import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUserId } from "@/lib/internal-auth";
import { getProjectDetail, updateProjectStatus, upsertAsset, getCharacter, getProjectCast, createApiLog, setCastBible, getLockedScenes } from "@/lib/db/repository";
import { generateProjectImages, generateSceneShots, generateCharacterBible } from "@/services/fal/image-generator";
import { generateShotGrid } from "@/services/fal/shot-grid";
import { initDb } from "@/lib/db";
import { SHOTS_PER_SCENE, SHOT_FRAMINGS, CHARACTER_BIBLE_ON, SHOT_GRID_ON, ANCHOR_IMAGES_ONLY } from "@/lib/config";
import { z } from "zod";

export const runtime = "nodejs";
// A real run of this route took 3.7 minutes with 14 scenes; the previous ceiling would have killed it
// mid-flight on a serverless host with the fal spend already committed. These are
// sized from measurement, not from a default.
export const maxDuration = 300;

const BodySchema = z.object({
  project_id: z.string().uuid(),
  scene_number: z.number().int().positive().optional(), // regenerate a single scene
  // Redibujo por DUPLICADO: el mismo prompt regenera el mismo gemelo. Con esta
  // bandera se le ordena otro encuadre de forma explícita.
  variar: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    // Either a browser session, or the job worker carrying the internal secret —
    // production has to keep running after the user closes the tab.
    const body: unknown = await req.json().catch(() => null);
    const userId = await resolveRequestUserId(req, body);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "project_id requerido" }, { status: 400 });

    await initDb();
    const detail = await getProjectDetail(parsed.data.project_id, userId);
    if (!detail) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    if (!detail.scenes?.length) return NextResponse.json({ error: "El proyecto no tiene escenas" }, { status: 422 });

    // Scenes that ALREADY have an image → never regenerate them on a retry
    // (that's wasted fal $). Map scene.id → scene_number for the existing set.
    const sceneNumById = new Map(detail.scenes.map((s) => [s.id, s.scene_number]));
    const existingImageScenes = new Set<number>(
      (detail.assets ?? [])
        .filter((a) => a.asset_type === "image" && a.public_url && a.scene_id)
        .map((a) => sceneNumById.get(a.scene_id!))
        .filter((n): n is number => typeof n === "number")
    );

    // ── CANDADO DE ESCENA APROBADA ─────────────────────────────────────────
    // Aquí es donde el candado vale: este endpoint es el único camino por el
    // que una imagen puede ser reemplazada. Bloquearlo solo en la UI dejaría la
    // escena aprobada a merced de cualquier reintento o llamada directa.
    const bloqueadas = await getLockedScenes(parsed.data.project_id);
    if (parsed.data.scene_number && bloqueadas.has(parsed.data.scene_number)) {
      return NextResponse.json(
        { error: `La escena ${parsed.data.scene_number} está aprobada. Quítale la aprobación para regenerarla.`, locked: true },
        { status: 409 },
      );
    }

    // Single-scene regen = force that one. Otherwise generate ONLY the missing scenes.
    let targetScenes = parsed.data.scene_number
      ? detail.scenes.filter((s) => s.scene_number === parsed.data.scene_number)
      : detail.scenes.filter((s) => !existingImageScenes.has(s.scene_number));

    // ── ANCHOR IMAGES ONLY ─────────────────────────────────────────────────
    // Plan the blocks from the SCRIPT (free) and render only the frames the clips
    // will consume: each block's opening frame, plus the closing frame of the last
    // one. The scenes in between are carried by the generated motion, so rendering
    // them buys a picture nobody ever sees.
    if (ANCHOR_IMAGES_ONLY && !parsed.data.scene_number) {
      const { planNarrativeBlocks } = await import("@/services/video/narrative-blocks");
      const { BLOCK_TARGET_SECONDS } = await import("@/lib/config");
      const plan = planNarrativeBlocks(
        detail.scenes.map((sc) => ({
          scene_number: sc.scene_number,
          image_url: "planned",          // the planner only checks for presence
          narration_text: sc.narration_text,
          duration_seconds: sc.duration_seconds,
          // El hablante cambia la agrupación (un bloque = una voz), así que sin
          // esto las anclas que se dibujan acá no coinciden con los clips que se
          // piden después — y volveríamos a pagar imágenes que nadie usa.
          speaker: sc.speaker,
        })),
        BLOCK_TARGET_SECONDS,
      );
      if (plan.length) {
        const anchors = new Set<number>(plan.map((b) => b.leadScene));
        // LOS DOS EXTREMOS DE CADA BLOQUE, no solo el de entrada.
        //
        // Un bloque cubre 2 o 3 líneas con UNA sola imagen: la de su primera
        // escena. Las demás líneas no tienen cuadro propio y el modelo las inventa
        // a partir de un momento que no es el suyo. Eso produjo el defecto que se
        // ve al mirar: el subtítulo dice "aquí no está su hija" mientras la hija
        // está en pantalla, porque la imagen se hizo para otra frase.
        //
        // Seedance acepta cuadro inicial Y final. Rindiendo también la ÚLTIMA
        // escena del bloque, el clip queda anclado en sus dos extremos con imágenes
        // de sus propias líneas. Cuesta una imagen más por bloque —unos $0.04—
        // contra los $0.65 que costaría darle un clip a cada línea.
        for (const b of plan) {
          const ultima = b.scenes[b.scenes.length - 1];
          if (ultima !== undefined) anchors.add(ultima);
        }
        const before = targetScenes.length;
        targetScenes = targetScenes.filter((sc) => anchors.has(sc.scene_number));
        console.log(`[anclas] ${before} escenas → ${targetScenes.length} imágenes (${plan.length} bloques)`);
      }
    }

    // Nothing to do → all images already exist. Return without spending a cent.
    if (!targetScenes.length) {
      return NextResponse.json({ success: true, total: 0, succeeded: 0, failed: 0, skipped_all: true });
    }

    // Decide the character reference image:
    //  1) A SAVED recurring character linked to the project → highest priority,
    //     so EVERY scene reuses that character's locked-in look.
    //  2) Otherwise, for single-scene regen of scene > 1, use scene 1's image so
    //     the regenerated scene keeps the same person.
    let referenceImageUrl: string | undefined;
    if (detail.project.character_id) {
      const character = await getCharacter(detail.project.character_id, userId);
      referenceImageUrl = character?.reference_image_url ?? undefined;
    }
    // A user-uploaded product/creative image drives ALL scenes so the REAL asset
    // appears in the ad (the "looks real, made with AI" moment).
    if (!referenceImageUrl && detail.project.reference_image_url) {
      referenceImageUrl = detail.project.reference_image_url;
    }

    // Retry case: scene 1 already exists but later scenes are missing → use scene 1's
    // saved image as the reference so the newly-generated scenes stay consistent
    // (and we don't waste money re-doing scene 1).
    if (!referenceImageUrl && !targetScenes.some((s) => s.scene_number === 1) && existingImageScenes.has(1)) {
      const scene1 = detail.scenes.find((s) => s.scene_number === 1);
      const scene1Img = detail.assets?.find((a) => a.asset_type === "image" && a.scene_id === scene1?.id);
      if (scene1Img?.public_url) referenceImageUrl = scene1Img.public_url;
    }

    // Multiple product images (different angles) → passed to nano-banana so it sees
    // the real product from every side = much better product fidelity in the ad.
    let referenceImageUrls: string[] | undefined;
    if (!detail.project.character_id && detail.project.reference_image_urls) {
      try {
        const arr = JSON.parse(detail.project.reference_image_urls) as unknown;
        if (Array.isArray(arr) && arr.every((u) => typeof u === "string")) {
          referenceImageUrls = arr as string[];
          if (!referenceImageUrl && referenceImageUrls[0]) referenceImageUrl = referenceImageUrls[0];
        }
      } catch { /* ignore malformed JSON */ }
    }
    if (!referenceImageUrl && parsed.data.scene_number && parsed.data.scene_number > 1) {
      const scene1 = detail.scenes.find((s) => s.scene_number === 1);
      const refAsset = detail.assets?.find(
        (a) => a.asset_type === "image" && a.scene_id === scene1?.id
      );
      referenceImageUrl = refAsset?.public_url ?? undefined;
    }

    // Phase 4: build a per-scene reference from the project cast — each scene's
    // speaker → that character's selected portrait. Only applies when NO single
    // saved character overrides everything (that takes priority above).
    let sceneReferences: Map<number, string> | undefined;
    // Each scene can pass BOTH the portrait and the multi-view sheet to the edit
    // model (more angles = far better identity retention).
    // portrait URL → its bible sheet. Keyed by portrait (not name) so the mapping
    // survives the appearance-order fallback below, where speaker names don't match.
    const bibleByPortrait = new Map<string, string>();
    // Vive fuera del bloque porque hace falta MÁS ABAJO, para saber qué otros
    // personajes están en cuadro en cada escena.
    let withPortrait: Awaited<ReturnType<typeof getProjectCast>> = [];
    // Tamaño real del elenco (con o sin retrato): decide el respaldo "una sola
    // persona en cuadro" más abajo. 0 = desconocido, no se aplica.
    let elencoTotal = 0;
    if (!detail.project.character_id) {
      const cast = await getProjectCast(parsed.data.project_id).catch(() => []);
      elencoTotal = cast.length;
      withPortrait = cast.filter((c) => c.reference_image_url);

      // SIN RETRATO NO HAY REFERENCIA, Y SIN REFERENCIA LAS CARAS SE VAN.
      //
      // La biblia de personaje y el enlace escena→retrato dependen de que el elenco
      // tenga una foto elegida. Si se saltea la pantalla de Elenco, el proyecto
      // queda sin retratos: cada imagen se genera desde cero y el personaje cambia
      // de cara entre escenas. Es el mayor motivo de inconsistencia que tiene el
      // sistema, y hasta ahora pasaba en absoluto silencio — el video salía, se
      // pagaba, y el defecto se descubría mirándolo.
      if (!cast.length) {
        console.warn("[elenco] el proyecto no tiene elenco guardado — sin retratos de referencia, los personajes van a cambiar de cara entre escenas");
      } else if (!withPortrait.length) {
        console.warn(`[elenco] ${cast.length} personaje(s) en el elenco pero NINGUNO con retrato elegido — mismo efecto que no tener elenco`);
      } else {
        console.log(`[elenco] ${withPortrait.length}/${cast.length} personaje(s) con retrato — se usan como referencia en cada escena`);
      }

      // CHARACTER BIBLE — build once per character, then reuse for every scene and
      // every future episode. Failures are non-fatal: we fall back to the portrait.
      if (CHARACTER_BIBLE_ON) {
        const { rehostToR2: rehost } = await import("@/services/storage");
        await Promise.all(withPortrait.map(async (c) => {
          if (c.bible_url) {
            bibleByPortrait.set(c.reference_image_url!, c.bible_url);
            return;
          }
          try {
            const raw = await generateCharacterBible({
              portraitUrl: c.reference_image_url!,
              description: `${c.name}${c.role ? `, ${c.role}` : ""}`,
              niche: detail.project.niche,
              visualStyle: detail.project.visual_style,
            });
            if (!raw) return;
            const durable = await rehost(raw, "bibles", "jpg", "image/jpeg");
            await setCastBible(c.id, durable);
            bibleByPortrait.set(c.reference_image_url!, durable);
          } catch (e) {
            console.error(`[bible] ${c.name} failed:`, e instanceof Error ? e.message.slice(0, 120) : e);
          }
        }));
      }

      if (withPortrait.length) {
        const norm = (s: string) => s.trim().toLowerCase();
        const portraitByName = new Map(withPortrait.map((c) => [norm(c.name), c.reference_image_url!]));
        const map = new Map<number, string>();
        // Pass 1 — exact name match (the happy path).
        for (const s of targetScenes) {
          const url = s.speaker ? portraitByName.get(norm(s.speaker)) : undefined;
          if (url) map.set(s.scene_number, url);
        }

        // Pass 1.5 — NOMBRE PARCIAL. El guion escribe "Camila Restrepo" donde el
        // elenco dice "Camila", o al reves. Comparar la cadena entera falla y esa
        // escena se queda sin retrato.
        // EL ARTÍCULO NO ES EL NOMBRE. De "La Presencia" salía "La", que no
        // identifica a nadie y además colisiona con cualquier otro personaje
        // que empiece igual ("La Niña", "La Madre"). Medido en una producción
        // real de terror cuya antagonista se llama "La Presencia".
        const ARTICULOS = ["el", "la", "los", "las", "un", "una", "lo"];
        const primerNombre = (s: string) => {
          const partes = norm(s).split(/\s+/).filter(Boolean);
          return partes.find((p) => !ARTICULOS.includes(p)) ?? partes[0] ?? "";
        };
        const porPrimerNombre = new Map(withPortrait.map((c) => [primerNombre(c.name), c.reference_image_url!]));
        for (const s of targetScenes) {
          if (map.has(s.scene_number) || !s.speaker) continue;
          const url = porPrimerNombre.get(primerNombre(s.speaker));
          if (url) map.set(s.scene_number, url);
        }

        // Pass 1.6 — APODOS. El guion llama "Vale" a quien el elenco registro como
        // "Valeria": es como habla la gente, y el orden de aparicion le habria dado
        // un rostro estable pero ajeno. Un prefijo de 3+ letras basta para
        // reconocerlo, y solo se acepta si UN unico miembro del elenco encaja —
        // con dos candidatos adivinar seria peor que caer a la red de seguridad.
        for (const s of targetScenes) {
          if (map.has(s.scene_number) || !s.speaker) continue;
          const dicho = primerNombre(s.speaker);
          if (dicho.length < 3) continue;
          const candidatos = withPortrait.filter((c) => {
            const real = primerNombre(c.name);
            return real.startsWith(dicho) || dicho.startsWith(real);
          });
          if (candidatos.length === 1) map.set(s.scene_number, candidatos[0]!.reference_image_url!);
        }

        // Pass 2 — RED DE SEGURIDAD, escena por escena.
        //
        // Antes esta red solo se desplegaba si NINGUNA escena habia coincidido
        // (map.size === 0). Con coincidencia parcial —la mitad de las escenas
        // encuentra su retrato y la otra mitad no— las que fallaban se quedaban
        // SIN referencia y el modelo reinventaba la cara. Medido en un video real:
        // Camila sale morena en un plano y pelirroja en otro, dentro de la misma
        // conversacion.
        //
        // Ahora cada escena con hablante que siga sin retrato recibe uno por ORDEN
        // DE APARICION, estable: el mismo nombre recibe siempre el mismo retrato en
        // toda la historia. Un rostro asignado por orden es una apuesta; ninguno es
        // una cara nueva garantizada.
        const speakers: string[] = [];
        for (const s of targetScenes) {
          const sp = s.speaker ? norm(s.speaker) : "";
          if (sp && !speakers.includes(sp)) speakers.push(sp);
        }
        const huerfanas = targetScenes.filter((s) => s.speaker && !map.has(s.scene_number));
        if (huerfanas.length && speakers.length) {
          console.warn(
            `[images] ${huerfanas.length}/${targetScenes.length} escenas sin retrato por nombre ` +
            `(hablantes: ${speakers.join(", ")} | elenco: ${withPortrait.map((c) => c.name).join(", ")}) ` +
            `— asignando por orden de aparicion`,
          );
          for (const s of huerfanas) {
            const idx = speakers.indexOf(norm(s.speaker!));
            if (idx >= 0) map.set(s.scene_number, withPortrait[idx % withPortrait.length]!.reference_image_url!);
          }
        }
        if (map.size) sceneReferences = map;
      }
    }

    // scene_number → the speaking character's bible sheet. Derived from the portrait
    // map that was actually chosen above, so it stays correct whether scenes were
    // matched by exact name or by the appearance-order safety net.
    let sceneBibles: Map<number, string> | undefined;
    if (bibleByPortrait.size && sceneReferences) {
      const m = new Map<number, string>();
      for (const [sceneNumber, portrait] of sceneReferences) {
        const b = bibleByPortrait.get(portrait);
        if (b) m.set(sceneNumber, b);
      }
      if (m.size) sceneBibles = m;
    }

    // ── QUIÉN MÁS ESTÁ EN CUADRO ─────────────────────────────────────────────
    //
    // El mapa de arriba da UN retrato por escena: el de quien habla. En una
    // escena con tres personas eso significa que al generador le llega una cara
    // y las otras dos las inventa. Medido en un video real: Jazmín salió con
    // pelo azul en el plano donde no hablaba y con pelo oscuro en el que sí, y
    // la tercera figura del fondo era un borrón. El modelo no se olvidó de
    // nadie — nunca le dijimos cómo se veían los demás.
    //
    // Quiénes están presentes no hace falta preguntárselo al guionista: ya está
    // escrito. Si el prompt de la escena o el diálogo NOMBRAN a alguien del
    // elenco, esa persona está en la escena. Es gratis —la misma llamada con más
    // entradas— y no necesita ningún campo nuevo.
    let sceneExtraRefs: Map<number, string[]> | undefined;
    if (withPortrait.length > 1) {
      const sinAcentos = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      const m = new Map<number, string[]>();
      for (const s of targetScenes) {
        const texto = sinAcentos(`${s.image_prompt ?? ""} ${s.narration_text ?? ""}`);
        const propio = sceneReferences?.get(s.scene_number);
        const otros = withPortrait
          .filter((c) => {
            if (c.reference_image_url === propio) return false;      // ya va como principal
            // El primer nombre SIN el artículo: de "La Presencia" hay que
            // buscar "presencia", no "la" — que tiene dos letras y quedaba
            // descartado, dejando al personaje sin retrato.
            const partes = sinAcentos(c.name ?? "").split(/\s+/).filter(Boolean);
            const nombre = partes.find((p) => !["el","la","los","las","un","una","lo"].includes(p)) ?? partes[0] ?? "";
            // Límite de palabra a mano: "Ana" no debe activarse dentro de "Anacleto".
            return nombre.length >= 3 && new RegExp(`(^|[^\\p{L}])${nombre}([^\\p{L}]|$)`, "u").test(texto);
          })
          .map((c) => c.reference_image_url!)
          .filter(Boolean);
        if (otros.length) m.set(s.scene_number, otros);
      }
      if (m.size) {
        sceneExtraRefs = m;
        const total = [...m.values()].reduce((n, a) => n + a.length, 0);
        console.log(`[elenco] ${m.size} escena(s) con más de un personaje en cuadro — ${total} retrato(s) extra como referencia ($0)`);
      }
    }

      // ── ESCALERA DE PLANOS (proyectos mudos / performance) ────────────────
      // Medido dos veces: en formato escena (un personaje, mismo cuarto, foto
      // del set) nano-banana CONVERGE — las escenas 1, 3 y 4 salieron casi
      // idénticas aunque el guion pedía encuadres distintos. El texto del
      // guionista pierde contra la gravedad de las referencias; una espec de
      // plano DISTINTA y explícita por escena, al final del prompt (recencia),
      // no pierde.
      const proyectoMudo = (detail.scenes ?? []).every((sc) => !(sc.narration_text ?? "").trim());
      const ESCALERA = [
        "SHOT SPEC: wide establishing shot from across the room, the subject small within the full space",
        "SHOT SPEC: medium shot at subject level, waist-up, subject filling half the frame",
        "SHOT SPEC: overhead top-down macro of the key object (the plate/hands) FILLING the entire frame, subject face NOT visible, the object BRIGHTLY and clearly lit in crisp sharp focus with every detail readable — never swallowed by shadow",
        "SHOT SPEC: extreme close-up of the face — lips, chin and jaw filling the frame",
        "SHOT SPEC: low angle from table height looking up at the subject, foreground objects large and out of focus",
        "SHOT SPEC: profile shot from the side, subject in the right third, negative space left",
      ];
      // Medido también en un proyecto HABLADO (la confesión de los insectos,
      // realista): 4 planos medios idénticos de cocina seguidos, el plano de la
      // puerta 3 veces. La convergencia de nano-banana no distingue mudo de
      // hablado — solo que en hablado el guion sí trae encuadres, así que la
      // espec es más suave: obliga a cambiar la DISTANCIA cuando la escena
      // anterior comparte lugar, sin imponer la escalera completa.
      const VARIACION = [
        "medium shot at subject level, waist-up",
        "tight close-up — the face filling the frame",
        "wide shot from across the room, the subject within the full space",
        "extreme close-up of the key object or the hands, face not visible",
      ];
      const lugarDe = (s: { location?: string | null }) => (s.location ?? "").trim().toLowerCase();
      let corrida = 0;
      const especDePlano = (idx: number) => {
        if (proyectoMudo) return " " + ESCALERA[idx % ESCALERA.length] + ". This framing is MANDATORY and overrides any other framing described.";
        corrida = idx > 0 && lugarDe(targetScenes[idx]!) === lugarDe(targetScenes[idx - 1]!) ? corrida + 1 : 0;
        if (corrida === 0) return "";
        return ` SHOT SPEC: change the camera DISTANCE decisively from the previous scene — ${VARIACION[corrida % VARIACION.length]}. Never repeat the framing of the previous frame.`;
      };
      // ── ELENCO DE UNO — respaldo en la capa de píxeles ────────────────────
      // El guionista ya tiene la ley y la guardia; esto cubre el caso en que un
      // elenco viejo o un prompt colado meta un segundo cuerpo: la orden va al
      // FINAL de cada prompt de imagen (recencia) y el juez de cuadro la lee,
      // así una segunda persona pasa a ser figura_extra aunque el image_prompt
      // la describa. Medido: la protagonista besando a un clon de sí misma.
      const unSolo = elencoTotal === 1;
      const soloUno = unSolo
        ? " EXACTLY ONE PERSON in this frame and in the whole video — this story has a single character. No second person, no one to kiss, hug or talk to, no extra hands, no human reflection or human silhouette."
        : "";

    const results = await generateProjectImages({
      projectId: parsed.data.project_id,
      niche: detail.project.niche,
      visualStyle: detail.project.visual_style,

      scenes: targetScenes.map((s, idx) => ({
        scene_number: s.scene_number,
        image_prompt: s.image_prompt ?? "",
        emotion: s.emotion ?? undefined,
        narration_text: s.narration_text ?? undefined,
        image_prompt_extra: (especDePlano(idx) + soloUno + (parsed.data.variar ? " COMPLETELY DIFFERENT SHOT than any previous frame of this scene: change the camera DISTANCE decisively, change the angle, and shift the subject off-center. Same person, same room, same light — different composition." : "")) || undefined,
        location: s.location ?? null,
      })),
      referenceImageUrl,
      referenceImageUrls,
      sceneReferences,
      sceneBibles,
      sceneExtraRefs,
    });

    // Save URLs to DB assets table — re-host each fal.media image (TEMPORARY URL)
    // to durable R2 so scenes never break later and you own your paid assets.
    const { rehostToR2 } = await import("@/services/storage");
    // Counters so the spend log reflects every paid call, not only the primaries.
    let sheetCount = 0;
    let shotCount = 0;
    const promptByScene = new Map(targetScenes.map((s) => [s.scene_number, s.image_prompt ?? ""]));
    const emotionByScene = new Map(targetScenes.map((s) => [s.scene_number, s.emotion ?? undefined]));

    await Promise.all(
      results
        .filter((r) => r.success && r.url)
        .map(async (r) => {
          const durableUrl = await rehostToR2(r.url!, "images", "jpg", "image/jpeg");

          // MULTI-SHOT: render extra camera setups of this same beat, referenced to
          // the frame we just made, so the edit can CUT between angles instead of
          // holding one image for the whole scene. Stored in metadata.shots so every
          // existing consumer of public_url keeps working untouched.
          let shots: string[] = [];
          // Kept outside the block so the asset metadata can carry it.
          let sheetUrl: string | null = null;
          if (SHOTS_PER_SCENE > 1) {
            const basePrompt = promptByScene.get(r.sceneNumber) ?? "";
            const framings = SHOT_FRAMINGS.slice(1, SHOTS_PER_SCENE);
            try {
              // Preferred path: ONE storyboard sheet sliced locally. Returns [] on
              // any problem (irregular sheet, no FFmpeg) so we fall through below.
              let extra: string[] = [];
              // The sheet is kept so the hook block can reuse it for this same
              // scene instead of paying for a second identical one.
              if (SHOT_GRID_ON) {
                const grid = await generateShotGrid({
                  basePrompt,
                  primaryImageUrl: durableUrl,
                  framings,
                  niche: detail.project.niche,
                  visualStyle: detail.project.visual_style,
                });
                extra = grid.shots;
                sheetUrl = grid.sheetUrl;
                if (grid.sheetUrl) sheetCount++;
              }
              // Fallback: one fal call per framing (3× the cost, and the framings
              // drift — kept because a scene with one held image is worse).
              if (!extra.length) {
                extra = await generateSceneShots({
                  basePrompt,
                  primaryImageUrl: durableUrl,
                  projectId: parsed.data.project_id,
                  sceneNumber: r.sceneNumber,
                  niche: detail.project.niche,
                  visualStyle: detail.project.visual_style,
                  framings,
                  emotion: emotionByScene.get(r.sceneNumber),
                });
              }
              shotCount += extra.length;
              shots = await Promise.all(extra.map((u) => rehostToR2(u, "images", "jpg", "image/jpeg")));
            } catch (e) {
              console.error("[images] extra shots failed:", e instanceof Error ? e.message.slice(0, 120) : e);
            }
          }

          await upsertAsset({
            projectId: parsed.data.project_id,
            sceneNumber: r.sceneNumber,
            assetType: "image",
            publicUrl: durableUrl,
            filePath: r.filePath,
            mimeType: "image/jpeg",
            metadata: (shots.length || sheetUrl) ? JSON.stringify({ shots, sheet: sheetUrl ?? undefined }) : undefined,
          });
        })
    );

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    // 💰 Log estimated fal spend so the app is never blind to cost again.
    try {
      const { estimateImages } = await import("@/lib/costs");
      const lora = (process.env.FLUX_REALISM_LORA?.length ?? 0) > 0;
      const ultra = (process.env.FLUX_QUALITY ?? "").toLowerCase() === "ultra";
      const upscale = (process.env.IMAGE_UPSCALE ?? "") === "on";
      // Count what really happened, not just the primary renders: bibles are one
      // edit call each, and every sliced sheet is a kontext/max call. Under-logging
      // here is what let the real cost drift 2.5x from the price for weeks.
      const { estimateImageExtras } = await import("@/lib/costs");
      const biblesBuilt = bibleByPortrait.size;
      const sheetsBuilt = SHOT_GRID_ON ? sheetCount : 0;
      const extraShotsBuilt = SHOT_GRID_ON ? 0 : shotCount;
      const cost = estimateImages(succeeded, { lora, ultra, upscale })
                 + estimateImageExtras({ bibles: biblesBuilt, sheets: sheetsBuilt, extraShots: extraShotsBuilt });
      await createApiLog({
        userId: userId, projectId: parsed.data.project_id,
        provider: "fal", endpoint: "/api/images", model: ultra ? "flux-pro-ultra" : lora ? "flux-lora" : "flux",
        costUsd: cost, statusCode: 200,
      });
    } catch { /* logging must never break production */ }

    await updateProjectStatus(
      parsed.data.project_id,
      failed === 0 ? "images_done" : "images_partial"
    );

    // Log errors for debugging
    results.filter(r => !r.success).forEach(r => {
      console.error(`[images] Scene ${r.sceneNumber} failed:`, r.error);
    });

    const firstError = results.find(r => !r.success)?.error;
    return NextResponse.json({
      success: succeeded > 0,
      total: results.length,
      succeeded,
      failed,
      error: succeeded === 0 ? (firstError ?? "Todas las imágenes fallaron") : undefined,
      mock: results[0]?.mock ?? false,
      errors: results.filter(r => !r.success).map(r => ({ scene: r.sceneNumber, error: r.error })),
      scenes: results.map((r) => ({
        scene_number: r.sceneNumber,
        success: r.success,
        url: r.url,
        error: r.error,
        duration_ms: r.durationMs,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[API /images]", message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function GET() {
  const hasKey = Boolean(process.env.FAL_API_KEY);
  const isMock = process.env.FORCE_MOCK_IMAGE === "true" || !hasKey;
  return NextResponse.json({ status: "ok", mock_mode: isMock, has_key: hasKey });
}
