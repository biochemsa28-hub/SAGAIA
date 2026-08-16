import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { storyGeneratorService } from "@/services/openai/story-generator";
import {
  createProject, saveGenerationResult, updateProjectStatus,
  deductCredits, createApiLog, setProjectCharacter, getUserById, setProjectCast,
  refundCreditForProject,
} from "@/lib/db/repository";
import { resolveProjectTier, creditCostFor, videoSecondsFor, esBorrador, BORRADOR, BLOCK_TARGET_SECONDS } from "@/lib/config";
import { esNombreDePila } from "@/lib/ai/name-bank";
import { ACCION_CLAVE, picoPorDefecto } from "@/lib/ai/accion-clave";
import { esPremisaDeConsejo } from "@/lib/ai/prompts";
import { CHARS_PER_SECOND } from "@/services/video/narrative-blocks";
import { initDb } from "@/lib/db";
import { z } from "zod";
import { TOPIC_MAX } from "@/lib/validators/story.schema";
import { captureServer } from "@/lib/analytics/posthog";
import { rateLimit, getClientIp } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
// Reel pacing means many more scenes per story, so generation takes longer than
// the old 60s ceiling allowed (a 60s video = 10-14 scenes ≈ 2 min of generation).
export const maxDuration = 300;

const BodySchema = z.object({
  title: z.string().optional(),
  niche: z.string().min(1),
  sub_niche: z.string().optional(),
  // EL MISMO LÍMITE QUE EL GENERADOR, Y EN LA PUERTA.
  //
  // Acá decía min(1) sin máximo, así que una premisa larga entraba, se cobraban
  // los NAVOS, se creaba el proyecto, y recién adentro del generador el esquema
  // la rechazaba. Reembolso había, pero el usuario ya había esperado y perdido
  // la generación por un error que se podía ver en el primer milisegundo.
  //
  // Validar en la puerta con el MISMO número —importado, no copiado— es la
  // diferencia entre "datos inválidos" instantáneo y un cobro con devolución.
  topic: z.string().min(1).max(TOPIC_MAX),
  tone: z.string().min(1),
  duration_target: z.string().min(1),
  language: z.string().default("es"),
  visual_style: z.string().default("cinematic"),
  target_platform: z.string().optional(),
  additional_instructions: z.string().optional(),
  character_id: z.string().uuid().optional(), // reuse a saved recurring character
  animation_tier: z.enum(["kenburns", "cinematic", "talking"]).optional(),
  // "borrador" salta el modelo de video — el 82,5% del costo — para poder juzgar
  // la historia antes de pagar el render caro. Ausente = estreno.
  quality: z.enum(["borrador", "estreno"]).optional(),
  format: z.enum(["story", "ad", "consejo"]).optional(), // "ad" = UGC advertising video · "consejo" = la historia demuestra la respuesta
  reference_image_url: z.string().url().optional(), // user-uploaded product/creative image
  reference_image_urls: z.array(z.string().url()).max(4).optional(), // multiple product angles
  // Series wiring — set when this project continues another one ("Parte N").
  series_id: z.string().optional(),
  episode_number: z.number().int().positive().optional(),
  parent_project_id: z.string().uuid().optional(),

  // The cast chosen on the "Elenco" screen: each character's name, voice archetype
  // and the portrait the user selected. Persisted so production gives each scene's
  // speaker the right face (per-scene image reference) and voice (Phase 4).
  cast: z.array(z.object({
    name: z.string().min(1).max(60),
    // ── UN CAMPO COSMÉTICO NO PUEDE TUMBAR LA PETICIÓN ────────────────────
    //
    // "role" y "voice_profile" son etiquetas: describen al personaje pero no
    // deciden nada del video. Aun así estaban declarados con .max() estricto, y
    // un rol largo hacía fallar la generación ENTERA — pasó en producción con
    // "cast.2.role", porque el prompt de casting ofrece la lista abierta
    // "protagonista | antagonista | interés amoroso | testigo | etc." y el
    // modelo escribe cosas como "hermana de la protagonista y cómplice".
    //
    // Es la misma lección que is_peak: un dato auxiliar que invalida todo es un
    // fallo de diseño, no del modelo. Se RECORTA en vez de rechazar — nadie va a
    // extrañar los caracteres 41 en adelante de una etiqueta.
    role: z.preprocess((v) => (typeof v === "string" ? v.slice(0, 40) : v), z.string().max(40).optional()),
    voice_profile: z.preprocess((v) => (typeof v === "string" ? v.slice(0, 30) : v), z.string().max(30).optional()),
    reference_image_url: z.string().url().optional(),
    // Multi-view sheet inherited from a previous episode — kept so a series pays
    // to build the bible once instead of once per episode.
    bible_url: z.string().url().optional(),
    // La edad decide si a este personaje se le dibujan picos de contacto o
    // violencia. Opcional para no romper a quien ya tenga proyectos guardados.
    age: z.enum(["child","teen","young","adult","elderly"]).optional(),
  })).max(4).optional(),
});

export async function POST(req: NextRequest) {
  // 20 story generations per user/IP per hour
  const ip = getClientIp(req);
  const rl = rateLimit(`generate:${ip}`, { limit: 20, windowSecs: 3600 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Límite de generaciones alcanzado. Espera antes de continuar." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  const t0 = Date.now();
  try {
    const session = await getServerSession(authOptions);
    const isMock = process.env.FORCE_MOCK_AI === "true";
    const userId = session?.user?.id ?? null;
    if (!userId && !isMock) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: unknown = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      // QUÉ campo y POR QUÉ. "Datos inválidos" a secas obliga a adivinar cuál de
      // los quince campos está mal, y el usuario ya perdió el viaje completo.
      // Ahora que la validación ocurre en la puerta, el mensaje tiene que servir
      // para arreglarlo sin abrir el código.
      // EL MÁXIMO DEL CAMPO QUE FALLÓ, no una constante fija.
      //
      // La primera versión ponía TOPIC_MAX en todos los casos, así que un rol de
      // elenco demasiado largo se anunciaba como "máximo 1200 caracteres" cuando
      // su límite real son 40. Un mensaje de error que da el número equivocado
      // es peor que uno genérico: manda a buscar el problema donde no está.
      const f = parsed.error.issues[0];
      const tope = (f as { maximum?: number } | undefined)?.maximum;
      const detalle = f
        ? `${f.path.join(".")}: ${f.code === "too_big" && tope !== undefined
            ? `es demasiado largo (máximo ${tope} caracteres)`
            : f.message}`
        : "";
      return NextResponse.json({ error: `Datos inválidos — ${detalle}` }, { status: 400 });
    }

    await initDb();

    // Resolve the animation tier the user chose, clamped to what their plan allows.
    // The tier determines how many NAVOS the video costs (premium tiers cost more).
    const user = userId ? await getUserById(userId).catch(() => null) : null;
    const animationTier = resolveProjectTier(parsed.data.animation_tier ?? null, user?.plan ?? "free");
    // El precio escala con la duración pedida: 30s cuesta la mitad que 60s, y un
    // video largo cuesta lo que de verdad cuesta producirlo.
    const creditCost = creditCostFor(animationTier, parsed.data.duration_target, parsed.data.quality);

    // ── Check & deduct credits (tier-aware) ───────────────────────────────────
    if (userId) {
      const credit = await deductCredits(userId, creditCost);
      if (!credit.ok) {
        return NextResponse.json(
          { error: `Necesitas ${creditCost} NAVOS para este tipo de video. Recarga tu cuenta para continuar.`, credits: credit.remaining, required: creditCost },
          { status: 402 }
        );
      }
    }

    // ── Create project record ─────────────────────────────────────────────────
    const autoTitle = parsed.data.title ||
      `${parsed.data.niche} — ${parsed.data.topic.slice(0, 40)}`;

    let projectId: string | null = null;
    if (userId) {
      projectId = await createProject({
        userId,
        title: autoTitle,
        niche: parsed.data.niche,
        subNiche: parsed.data.sub_niche,
        topic: parsed.data.topic,
        tone: parsed.data.tone,
        durationTarget: parsed.data.duration_target,
        language: parsed.data.language,
        visualStyle: parsed.data.visual_style,
        aiProvider: isMock ? "mock" : (process.env.ANTHROPIC_API_KEY ? "anthropic" : "openai"),
        animationTier,
        creditsSpent: creditCost,
        referenceImageUrl: parsed.data.reference_image_url ?? parsed.data.reference_image_urls?.[0] ?? null,
        referenceImageUrls: parsed.data.reference_image_urls ?? null,
        seriesId: parsed.data.series_id ?? null,
        episodeNumber: parsed.data.episode_number ?? 1,
        parentProjectId: parsed.data.parent_project_id ?? null,
        quality: esBorrador(parsed.data.quality) ? BORRADOR : null,
      });
      await updateProjectStatus(projectId, "generating");
      // Link a saved recurring character so all scenes reuse its locked-in look.
      if (parsed.data.character_id) {
        await setProjectCharacter(projectId, userId, parsed.data.character_id).catch(() => {});
      }
      // Persist the chosen cast (name → portrait + voice) for per-scene production.
      if (parsed.data.cast?.length) {
        await setProjectCast(projectId, parsed.data.cast).catch(() => {});
      }
    }

    // ── EL ELENCO LLEGA AL GUION SÍ O SÍ ──────────────────────────────────────
    // El prompt ya exigía usar los nombres del elenco, pero los leía de un marcador
    // de texto "[ELENCO DISEÑADO]:" que armaba el NAVEGADOR dentro de
    // additional_instructions. El elenco de verdad viaja aparte, como dato
    // estructurado (parsed.data.cast) — dos caminos para el mismo hecho.
    //
    // Cuando el marcador no venía, la IA escribía con nombres inventados. Ahí se
    // rompe todo lo de abajo: los retratos se guardan por NOMBRE, así que un
    // "Valeria" que debía ser "Elena" no encuentra su cara y el sistema reparte los
    // rostros por orden de aparición. El usuario elige un elenco y ve otro.
    //
    // Ahora el marcador se arma acá, desde el elenco real. Si hay elenco, el guion
    // se entera — no depende de que el frontend lo recuerde.
    let instrucciones = parsed.data.additional_instructions ?? "";
    if (parsed.data.cast?.length) {
      const linea = parsed.data.cast
        .map((c) => {
          const partes = [c.name, c.role, c.voice_profile].filter(Boolean);
          return partes.join(" — ");
        })
        .join(" · ");
      // Reemplaza el marcador del frontend si existe; si no, lo agrega.
      instrucciones = instrucciones.includes("[ELENCO DISEÑADO]:")
        ? instrucciones.replace(/\[ELENCO DISEÑADO\]:.*/g, `[ELENCO DISEÑADO]: ${linea}`)
        : `${instrucciones}\n[ELENCO DISEÑADO]: ${linea}`.trim();
      console.log(`[elenco] ${parsed.data.cast.length} personaje(s) al guion: ${linea}`);
    }

    // ── Generate ──────────────────────────────────────────────────────────────
    // Pass the EFFECTIVE tier so the prompt can skip fields this tier won't use
    // (Ken Burns ignores animation_prompt → generating it is pure latency).
    const result = await storyGeneratorService.generate({
      ...parsed.data,
      additional_instructions: instrucciones || undefined,
      animation_tier: animationTier,
    });
    const durationMs = Date.now() - t0;

    if (!result.success) {
      if (projectId) await updateProjectStatus(projectId, "failed", result.error);

      // DEVOLVER LOS NAVOS. Se descuentan ANTES de generar —correcto, si no se
      // podría pedir guiones gratis en bucle— pero nadie los devolvía cuando la
      // generación fallaba. Con el precio corregido eso son 12.240 NAVOS por un
      // guion que nunca existió, y el usuario no tiene forma de recuperarlos.
      // refundCreditForProject es idempotente y no devuelve si ya hay video.
      if (userId && projectId) {
        await refundCreditForProject(userId, projectId).catch(() => {});
      }

      // El mensaje del proveedor llega en inglés y no dice qué hacer. Un rechazo
      // del filtro de contenido no es un error del sistema: es la premisa. Vale la
      // pena distinguirlo, porque reintentar sin cambiar nada da lo mismo.
      const crudo = String(result.error ?? "");
      const esFiltro = /content checker|content_filter|flagged|refus|policy|safety/i.test(crudo);
      const mensaje = esFiltro
        ? "El generador rechazó esta premisa por su filtro de contenido. No es un fallo del sistema: la historia, tal como está planteada, no la puede escribir. " +
          "Reformulá la idea contando el MISMO conflicto de forma implícita — el efecto sobre los personajes en vez del hecho explícito — y volvé a intentar. " +
          "Tus NAVOS fueron devueltos."
        : crudo;
      // Log failed generation
      if (userId) {
        await createApiLog({
          userId, projectId: projectId ?? undefined,
          provider: result.provider ?? "unknown",
          endpoint: "/api/generate/story",
          model: result.model,
          durationMs,
          statusCode: 422,
          error: result.error,
        });
      }
      return NextResponse.json(
        {
          error: mensaje,
          content_filter: esFiltro,
          refunded: Boolean(userId && projectId),
          validation_error: result.validation_error,
          provider: result.provider,
        },
        { status: 422 }
      );
    }

    // ── ¿EL GUION DA LA DURACIÓN PEDIDA? ──────────────────────────────────────
    // El video dura lo que los personajes tardan en hablar — no hay narrador que
    // rellene. Un guion de líneas cortas produce un video corto, y eso se descubría
    // recién al verlo terminado, con los clips ya pagados.
    //
    // El prompt ahora lleva un presupuesto de caracteres, pero una instrucción no es
    // una garantía: acá se MIDE. A ~14 caracteres por segundo en español.
    if (result.data?.scenes?.length) {
      const chars = result.data.scenes.reduce((n, s) => n + (s.narration_text ?? "").trim().length, 0);
      const segundos = Math.round(chars / CHARS_PER_SECOND);
      const pedidos = videoSecondsFor(parsed.data.duration_target);
      const pct = Math.round((segundos / pedidos) * 100);
      // Corto o largo, se REESCRIBE una vez. Antes solo el largo se corregía y el
      // corto se avisaba: medido, un "30s" salió de 22 segundos con cinco líneas
      // — el 73% de lo pedido, y el usuario pagó por 30. Un guion corto es un
      // problema de guion igual que uno largo, y se arregla en el guion.
      if (segundos < pedidos * 0.8 || segundos > pedidos * 1.15) {
        const corto = segundos < pedidos;
        // ── SE REESCRIBE, NO SE AVISA ──────────────────────────────────────────
        // Avisar no alcanzaba: medido, el guion pedía 10 bloques para 60 segundos
        // elegidos y el sistema descartaba 4 — la historia terminaba cortada y el
        // video salía de 93s cuando se habían pedido 60.
        //
        // Regenerar el guion cuesta centavos; descubrirlo después cuesta los clips
        // y las imágenes de un video entero. Se reintenta UNA vez, con el número
        // medido en la instrucción: un modelo corrige mucho mejor con "te pasaste
        // 32 segundos" que con "sé breve".
        console.warn(
          `[duracion] el guion da ~${segundos}s y se pidieron ${pedidos}s (${pct}%) — regenerando una vez con la corrección`,
        );
        const objetivo = Math.round(pedidos * CHARS_PER_SECOND);
        const correccion = corto
          ? `\n[CORRECCIÓN DE DURACIÓN] El guion anterior sumaba ~${segundos} segundos hablados y se pidieron ${pedidos}: ` +
            `quedó ${pedidos - segundos} segundos CORTO. Reescribilo COMPLETO con MÁS ESCENAS (no parlamentos más largos) hasta que el total ` +
            `de todos los narration_text ronde ~${objetivo} caracteres. Cada escena nueva trae información nueva: un detalle, una réplica ` +
            `del otro, un paso más del cuerpo. Nada de relleno ni repetir lo dicho.`
          : `\n[CORRECCIÓN DE DURACIÓN] El guion anterior sumaba ~${segundos} segundos hablados y se pidieron ${pedidos}. ` +
            `Te pasaste ${segundos - pedidos} segundos. Reescribilo COMPLETO para que el total de todos los narration_text ` +
            `no supere ~${objetivo} caracteres. NO comprimas la historia entera ni la cuentes a las apuradas: ` +
            `contá MENOS historia. Cerrá el primer tramo en el punto de máxima tensión y dejá el resto para la Parte 2.`;
        const reintento = await storyGeneratorService.generate({
          ...parsed.data,
          additional_instructions: (instrucciones + correccion).slice(0, 3000),
          animation_tier: animationTier,
        });
        const nuevos = reintento.success && reintento.data?.scenes?.length
          ? Math.round(reintento.data.scenes.reduce((n, s) => n + (s.narration_text ?? "").trim().length, 0) / CHARS_PER_SECOND)
          : 0;
        // Solo se acepta si de verdad mejora: un reintento peor que el original
        // sería cambiar un problema por otro más caro.
        if (nuevos > 0 && Math.abs(nuevos - pedidos) < Math.abs(segundos - pedidos)) {
          console.log(`[duracion] reintento aceptado: ~${nuevos}s de ${pedidos}s pedidos`);
          result.data = reintento.data;
        } else {
          console.warn(`[duracion] el reintento no mejoró (~${nuevos}s) — se conserva el original`);
        }
      } else {
        console.log(`[duracion] ~${segundos}s hablados de ${pedidos}s pedidos (${pct}%)`);
      }

      // ── DOS DEFECTOS DE GUION QUE ANTES SE DESCUBRÍAN DESPUÉS DE PAGAR ──────
      // 1) Un parlamento más largo que un clip: el planificador lo cubre pidiendo
      //    un clip más largo, y el resultado es un plano de 8-9s casi quieto en un
      //    formato que corta cada 2-3s. (El umbral viejo de 200 caracteres solo
      //    atrapaba congelamientos; una escena de 78 car. = 7.1s pasaba limpia.)
      // 2) Dos escenas consecutivas con image_prompt casi idéntico: producen dos
      //    imágenes casi iguales, el portero de continuidad las BLOQUEA y la
      //    producción entera se frena — después de pagar las imágenes.
      // Ambos son problemas de GUION y se arreglan en el guion: se detectan acá,
      // se regenera UNA vez nombrando las escenas, y solo se acepta si mejora.
      // Se relee de result.data porque el reintento de duración pudo reemplazarlo.
      const TECHO_ESCENA = Math.round(BLOCK_TARGET_SECONDS * CHARS_PER_SECOND * 1.15);
      const palabras = (t: string) => new Set(t.toLowerCase().match(/[a-záéíóúñü]{4,}/gi) ?? []);
      // Jaccard sobre palabras de 4+ letras: dos prompts que comparten el 65% del
      // vocabulario van a producir la misma imagen aunque el texto no sea igual.
      const parecidos = (a: string, b: string) => {
        const A = palabras(a), B = palabras(b);
        if (!A.size || !B.size) return 0;
        let comunes = 0;
        for (const w of A) if (B.has(w)) comunes++;
        return comunes / (A.size + B.size - comunes);
      };
      // 3) El pico demasiado temprano. Medido en 6 géneros a 60s: 2 de 6 lo
      //    ponían en la escena 9 de 14 (64%) — el momento más fuerte a los ~38s
      //    y 22 segundos de bajada. El algoritmo paga segundos vistos; la bajada
      //    es donde se van. Umbral 70%: el prompt pide último cuarto, se tolera
      //    un poco menos antes de pagar un reintento.
      type EscenaMin = { scene_number?: number; narration_text?: string | null; image_prompt?: string | null; is_peak?: boolean };
      const picoTemprano = (scenes: EscenaMin[]) => {
        const i = scenes.findIndex((s) => s.is_peak);
        if (i < 0 || scenes.length < 5) return null;
        const pct = Math.round(((i + 1) / scenes.length) * 100);
        return pct < 70 ? { escena: scenes[i]!.scene_number ?? i + 1, pct, total: scenes.length } : null;
      };
      const defectosDe = (scenes: EscenaMin[]) => {
        const largas = scenes
          .filter((s) => (s.narration_text ?? "").trim().length > TECHO_ESCENA)
          .map((s) => `${s.scene_number} (${(s.narration_text ?? "").trim().length} car.)`);
        const duplicadas: string[] = [];
        for (let i = 1; i < scenes.length; i++) {
          const a = (scenes[i - 1]!.image_prompt ?? "").trim();
          const b = (scenes[i]!.image_prompt ?? "").trim();
          if (a && b && parecidos(a, b) >= 0.65) duplicadas.push(`${scenes[i - 1]!.scene_number}-${scenes[i]!.scene_number}`);
        }
        const temprano = picoTemprano(scenes);
        // 4) Un CONSEJO sin consejos. Medido con "cómo ahorrar dinero cuando
        //    ganás poco": el bloque de formato estaba en el prompt y aun así
        //    salió un drama madre-hija sin una sola instrucción — 31k
        //    caracteres de guía de drama le ganaron a un bloque. Si es consejo
        //    y ninguna réplica nombra un paso/consejo/regla/señal, falta la
        //    respuesta que el usuario pidió.
        const sinConsejo = esConsejo && !scenes.some((sc) => MARCA_CONSEJO.test(sc.narration_text ?? ""));
        return { largas, duplicadas, temprano, sinConsejo, total: largas.length + duplicadas.length + (temprano ? 1 : 0) + (sinConsejo ? 1 : 0) };
      };
      const esConsejo = esPremisaDeConsejo({ topic: parsed.data.topic, format: parsed.data.format ?? "story" });
      const MARCA_CONSEJO = /(primer[oa]?|segund[oa]|tercer[oa]?|cuart[oa]|quint[oa]|consejo|paso|regla|señal|secreto|truco|clave|h[aá]bito|error)/i;
      const defectos = defectosDe((result.data?.scenes ?? []) as EscenaMin[]);
      if (defectos.total) {
        console.warn(
          `[escenas] guion con ${defectos.total} defecto(s) — parlamentos largos: [${defectos.largas.join(", ") || "ninguno"}], ` +
          `image_prompt casi duplicados: [${defectos.duplicadas.join(", ") || "ninguno"}], ` +
          `pico temprano: [${defectos.temprano ? `escena ${defectos.temprano.escena} de ${defectos.temprano.total} (${defectos.temprano.pct}%)` : "no"}], ` +
          `consejo sin consejos: [${defectos.sinConsejo ? "sí" : "no"}] — regenerando una vez`,
        );
        const correcciones =
          "\n[CORRECCIÓN DE ESCENAS] Reescribí el guion COMPLETO corrigiendo esto:" +
          (defectos.largas.length
            ? ` Las escenas ${defectos.largas.join(", ")} tienen narration_text demasiado largo — ` +
              `ninguna escena puede pasar de ${Math.round(BLOCK_TARGET_SECONDS * CHARS_PER_SECOND)} caracteres (${BLOCK_TARGET_SECONDS} segundos hablados); ` +
              "partí el parlamento en DOS escenas con encuadres distintos."
            : "") +
          (defectos.duplicadas.length
            ? ` Las escenas ${defectos.duplicadas.join(" y ")} tienen image_prompt casi idéntico — cada escena necesita su PROPIA imagen: ` +
              "cambiá el tamaño del plano, el ángulo de cámara o quién ocupa el cuadro."
            : "") +
          (defectos.temprano
            ? ` El pico físico (is_peak) cayó en la escena ${defectos.temprano.escena} de ${defectos.temprano.total} (${defectos.temprano.pct}%) — demasiado temprano: ` +
              `deja ${defectos.temprano.total - defectos.temprano.escena} escenas de bajada después del momento más fuerte. ` +
              "Movelo al ÚLTIMO CUARTO del guion (nunca antes del 75%), dejando UNA escena después, máximo dos, para reacción y cliffhanger. " +
              "Lo que hoy pasa después del pico se comprime o se corta."
            : "") +
          (defectos.sinConsejo
            ? " El usuario pidió un CONSEJO y el guion no contiene NINGÚN consejo dicho en voz alta: es un drama. Reescribilo para que un personaje diga, nombrados y con detalle concreto (número, tiempo, mecanismo), los pasos que el profesional del tema daría — y que el espectador pueda anotar. La emoción se queda; la respuesta se agrega."
            : "");
        const reintentoEscenas = await storyGeneratorService.generate({
          ...parsed.data,
          additional_instructions: (instrucciones + correcciones).slice(0, 3000),
          animation_tier: animationTier,
        });
        if (reintentoEscenas.success && reintentoEscenas.data?.scenes?.length) {
          const despues = defectosDe(reintentoEscenas.data.scenes as EscenaMin[]);
          if (despues.total < defectos.total) {
            console.log(`[escenas] reintento aceptado: ${defectos.total} defecto(s) → ${despues.total}`);
            result.data = reintentoEscenas.data;
          } else {
            console.warn(`[escenas] el reintento no mejoró (${despues.total} defecto(s)) — se conserva el original`);
          }
        }
      }
    }

    // ── REPARAR LOS NOMBRES ANTES DE GUARDARLOS ───────────────────────────────
    // La instrucción del prompt es tajante, pero una instrucción no es una
    // garantía: el modelo igual escribe "Valeria" donde el elenco dice "Valentina".
    // Corregirlo ACÁ, antes de que toque la base, es lo único que hace determinista
    // el enlace personaje↔rostro. Si se deja pasar, cada paso siguiente —retratos,
    // voces, subtítulos— hereda un nombre que no existe, y el usuario ve un
    // reparto que no eligió.
    //
    // Solo se corrige lo que NO coincide. Un speaker que ya está bien no se toca.
    if (result.data?.scenes?.length && parsed.data.cast?.length) {
      const nombres = parsed.data.cast.map((c) => c.name).filter(Boolean);
      const norm = (s: string) => s.trim().toLowerCase();
      const exactos = new Set(nombres.map(norm));

      // Un nombre inventado suele parecerse al real (Valeria/Valentina), así que
      // primero se busca por prefijo compartido; si no, por orden de aparición,
      // que al menos mantiene UNA cara por personaje a lo largo de la historia.
      const vistos: string[] = [];
      let corregidos = 0;
      for (const sc of result.data.scenes) {
        const sp = sc.speaker?.trim();
        if (!sp || exactos.has(norm(sp))) continue;

        const n = norm(sp);
        const parecido = nombres.find((real) => {
          const r = norm(real);
          return r.startsWith(n.slice(0, 3)) || n.startsWith(r.slice(0, 3));
        });

        if (!vistos.includes(n)) vistos.push(n);
        const porOrden = nombres[vistos.indexOf(n) % nombres.length];
        const elegido = parecido ?? porOrden;
        if (elegido) {
          console.warn(`[elenco] speaker "${sp}" no está en el elenco → "${elegido}"`);
          sc.speaker = elegido;
          corregidos++;
        }
      }
      // ── LOS NOMBRES QUE SE DICEN EN VOZ ALTA ────────────────────────────
      //
      // Lo de arriba corrige QUIÉN habla. Pero el nombre que el espectador OYE
      // está dentro del diálogo, y ahí nadie miraba. Medido en una producción
      // real con el elenco "Arnau Segura / Alanis Nájera": el personaje decía
      // "María, no quiero engañarte más". El chequeo daba todo correcto —el
      // campo speaker estaba bien— y el espectador escuchaba el nombre de
      // alguien que no existe en la historia. Eso es lo que se siente como
      // "no sigue el mismo personaje".
      //
      // Un vocativo se lo dice el que habla AL QUE ESCUCHA, así que en una
      // escena de dos el reemplazo correcto es siempre el otro del elenco.
      // La clave se compara SIN tildes, pero lo que se escribe es el nombre REAL
      // del elenco. Usar la clave normalizada como reemplazo dejaba "Anahi" donde
      // el personaje se llama "Anahí" — corrigiendo un problema e introduciendo
      // otro.
      const primer = (s: string) => norm(s).split(/\s+/)[0] ?? "";
      const primerosDelElenco = new Set(nombres.map(primer));
      const realPorClave = new Map(nombres.map((n) => [primer(n), n.trim().split(/\s+/)[0] ?? n]));
      let vocativos = 0;
      let sinReemplazoAvisado = false;
      for (const sc of result.data.scenes) {
        // NFC: el modelo puede escribir "í" como un solo carácter o como "i" más
        // una tilde combinante. En la segunda forma la expresión regular corta el
        // nombre por la mitad y deja la tilde suelta — medido: "Anahí" salía
        // convertido en "Anahií". Normalizar primero elimina esa clase entera de
        // error.
        const texto = (sc.narration_text ?? "").normalize("NFC");
        if (!texto) continue;
        // ⚠️ EL REEMPLAZO TIENE QUE SER UN NOMBRE USABLE.
        //
        // Se elegía "cualquier otro del elenco", y en un elenco de dos donde el
        // segundo es "La Presencia", ese otro daba primer nombre "La". La
        // reparación convertía "Carla, no duermas" en "LA, no duermas":
        // arreglaba un problema creando uno peor, y encima en el audio hablado.
        //
        // Si no hay a quién poner, NO se toca la línea. Un nombre inventado que
        // queda es un defecto; una frase sin sentido es un video roto. Y el
        // aviso de abajo lo deja registrado para que no pase inadvertido.
        const ARTICULOS_NOM = new Set(["el", "la", "los", "las", "un", "una", "lo"]);
        const usable = (n: string) => {
          const p = primer(n);
          return p.length >= 3 && !ARTICULOS_NOM.has(p);
        };
        const otro = nombres.find((n) => primer(n) !== primer(sc.speaker ?? "") && usable(n))
          ?? nombres.find(usable);
        if (!otro) {
          // Elenco sin ningún nombre propio utilizable (p. ej. protagonista +
          // criatura). Se deja el diálogo como está y se avisa una sola vez.
          if (!sinReemplazoAvisado) {
            console.warn(
              `[elenco] no hay un nombre del elenco que sirva para reemplazar vocativos inventados ` +
              `(elenco: ${nombres.join(", ")}) — el diálogo se deja tal cual`,
            );
            sinReemplazoAvisado = true;
          }
          continue;
        }
        // Solo palabras capitalizadas que son nombres de pila conocidos y no
        // están en el elenco. Sin el banco de nombres no se toca nada: adivinar
        // qué palabra es un nombre propio rompería diálogo legítimo.
        const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
        // Palabras que van capitalizadas y NO son nombres de persona. Sin esta
        // lista, "Dios mío, no puedo" convertiría a Dios en un personaje.
        const NO_SON_NOMBRES = new Set([
          "dios", "señor", "señora", "papa", "papá", "mama", "mamá", "abuela", "abuelo",
          "lunes", "martes", "miercoles", "miércoles", "jueves", "viernes", "sabado", "sábado", "domingo",
          "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
          "septiembre", "octubre", "noviembre", "diciembre", "navidad", "dime", "mira", "oye",
        ]);
        // UN VOCATIVO SE RECONOCE POR DÓNDE ESTÁ, NO POR ESTAR EN UNA LISTA.
        //
        // La primera versión solo reemplazaba nombres que el banco conociera, y el
        // banco no puede tener todos: en una producción real el guion dijo "Laura"
        // —que no estaba en las listas— y pasó intacto. Llamar a alguien por su
        // nombre tiene una FORMA reconocible: va al principio de la frase seguido
        // de coma, o después de una coma al final. Eso funciona con cualquier
        // nombre, exista o no en el banco.
        const corregido = texto
          // "Laura, no quiero…"  ·  ". Laura, escuchame"
          // \p{Lu}\p{Ll} con la bandera /u, NO [A-Z][a-z] ni \b. En JavaScript el
          // límite \b es ASCII: en "Anahí" lo pone después de "Anah" porque la í
          // no cuenta como letra. Medido: el reemplazo escribía "Anahí" y dejaba
          // la í suelta, produciendo "Anahíí" — corregir un nombre bien escrito.
          .replace(/(^|[.!?¡¿]\s+)(\p{Lu}\p{Ll}{2,})(\s*,)/gu, (m, ini, nom, coma) => {
            const k = primer(nom);
            if (primerosDelElenco.has(k) || NO_SON_NOMBRES.has(k)) return m;
            vocativos++;
            return `${ini}${(realPorClave.get(primer(otro)) ?? capitalizar(primer(otro)))}${coma}`;
          })
          // "…no te vayas, Laura."  ·  "…mírame, Laura"
          .replace(/(,\s*)(\p{Lu}\p{Ll}{2,})(\s*[.!?]|$)/gu, (m, coma, nom, fin) => {
            const k = primer(nom);
            if (primerosDelElenco.has(k) || NO_SON_NOMBRES.has(k)) return m;
            vocativos++;
            return `${coma}${(realPorClave.get(primer(otro)) ?? capitalizar(primer(otro)))}${fin}`;
          })
          // Y lo de antes, que sigue sirviendo para menciones fuera de vocativo
          // ("vi a María ayer") y para nombres del elenco mal escritos.
          .replace(/(?<!\p{L})(\p{Lu}\p{Ll}{2,})(?!\p{L})/gu, (m) => {
            const k = primer(m);
            if (primerosDelElenco.has(k) || NO_SON_NOMBRES.has(k)) return m;
            // Un nombre del elenco MAL ESCRITO ("Arnaud" por "Arnau") se normaliza
            // a la grafía real: es la misma persona, escrita distinto.
            const casiIgual = [...primerosDelElenco].find(
              (n) => n.length >= 4 && (n.startsWith(k.slice(0, 4)) || k.startsWith(n.slice(0, 4))),
            );
            if (casiIgual) { vocativos++; return (realPorClave.get(casiIgual) ?? capitalizar(casiIgual)); }
            if (!esNombreDePila(k)) return m;
            vocativos++;
            return (realPorClave.get(primer(otro)) ?? capitalizar(primer(otro)));
          });
        if (corregido !== texto) sc.narration_text = corregido;
      }
      if (vocativos) {
        console.warn(`[elenco] ${vocativos} nombre(s) inventado(s) DENTRO del diálogo reemplazados por los del elenco`);
      }

      if (corregidos) {
        console.warn(`[elenco] ${corregidos} atribución(es) corregidas — el guion se desvió de los nombres elegidos`);
      } else {
        console.log("[elenco] todas las escenas usan los nombres del elenco");
      }
    }

    // ── EL PICO FÍSICO NO PUEDE FALTAR ────────────────────────────────────────
    //
    // La REGLA #2.8 lo exige, pero una regla en el prompt es una petición: el
    // modelo puede entregar seis escenas de conversación con acciones físicas
    // chiquitas —una mirada, un paso atrás— y ninguna llegar al momento que la
    // gente comparte. Y el defecto es invisible hasta ver el video terminado.
    //
    // El pico ES el video: es el fotograma que alguien captura y reenvía. Sin
    // él no hay nada que ejecutar, y encima el sistema de cuadro destino se
    // queda sin trabajo — el video sale como seis planos de gente hablando.
    //
    // Así que se COMPRUEBA con la misma regla que usa el enrutador de video
    // (una sola definición de qué es un pico, en lib/ai/accion-clave), y si no
    // hay ninguno se le pide al modelo que reescriba UNA escena. Cuesta una
    // llamada de texto —centavos— y ocurre antes de gastar en imágenes.
    if (result.data?.scenes?.length) {
      const escenas = result.data.scenes as Array<{ physical_action?: string | null; scene_number?: number; is_peak?: boolean }>;
      // PRIMERO SE LE PREGUNTA AL GUIONISTA, y solo si no contestó se adivina.
      //
      // La regex enumera categorías de acción, y lo que un cuerpo puede hacer no
      // se enumera: en un día de pruebas se le encontraron seis agujeros. El
      // guionista, en cambio, SABE cuál escena es su pico —la REGLA #2.8 se lo
      // exige—, así que ahora lo declara. La regex queda de respaldo para los
      // guiones que no traigan la marca.
      const marcadas = escenas.filter((sc) => sc.is_peak);
      // Más de una marca no es un pico: son varios momentos importantes, y el
      // sistema solo puede dibujar uno. Se conserva la última, que en una
      // estructura de microdrama es la que está más cerca del clímax.
      if (marcadas.length > 1) {
        for (const sc of marcadas.slice(0, -1)) sc.is_peak = false;
        console.warn(`[pico] el guion marcó ${marcadas.length} escenas como pico — se conserva la última`);
      }
      const hayPico = marcadas.length > 0 || escenas.some((sc) => ACCION_CLAVE.test(sc.physical_action ?? ""));

      if (!hayPico) {
        // La anteúltima: es donde cae el punto de quiebre en una estructura de
        // seis escenas, y deja la última para el cliffhanger.
        const idx = Math.max(0, escenas.length - 2);
        const objetivo = escenas[idx]!;
        console.warn(
          `[pico] el guion no trae ningún pico físico (${escenas.length} escenas, todas conversación) — ` +
          `reescribiendo la acción de la escena ${objetivo.scene_number ?? idx + 1}`,
        );
        // Se usa la TABLA, no una llamada a la IA. Pedirle al modelo que repare
        // cuesta, tarda y puede volver otra vez sin pico — el arreglo tendría el
        // mismo modo de falla que el problema. La tabla es gratis, instantánea, y
        // cada entrada está verificada contra esta misma regla.
        const reemplazo = picoPorDefecto(parsed.data.tone);
        objetivo.physical_action = reemplazo;
        objetivo.is_peak = true;
        console.log(
          `[pico] escena ${objetivo.scene_number ?? idx + 1} recibe el pico de "${parsed.data.tone}": "${reemplazo.slice(0, 80)}"`,
        );
      } else {
        const declarada = escenas.find((sc) => sc.is_peak);
        console.log(declarada
          ? `[pico] el guion declaró la escena ${declarada.scene_number} como pico`
          : `[pico] sin marca del guion; la regla reconoce ${escenas.filter((sc) => ACCION_CLAVE.test(sc.physical_action ?? "")).length} escena(s) con pico`);
      }
    }

    // ── Save result + log ─────────────────────────────────────────────────────
    if (projectId && result.data) {
      await saveGenerationResult({
        projectId,
        story: result.data,
        rawAiResponse: JSON.stringify(result.data),
        aiProvider: result.provider ?? "mock",
      });
    }

    if (userId) {
      await createApiLog({
        userId, projectId: projectId ?? undefined,
        provider: result.provider ?? "mock",
        endpoint: "/api/generate/story",
        model: result.model,
        tokensUsed: result.tokensUsed,
        costUsd: result.costUsd,
        durationMs,
        statusCode: 200,
      });
    }

    if (userId) {
      captureServer(userId, "story_generated", {
        niche: parsed.data.niche,
        tone: parsed.data.tone,
        duration: parsed.data.duration_target,
        provider: result.provider,
        duration_ms: durationMs,
        project_id: projectId,
      });
    }

    return NextResponse.json({
      success: true,
      project_id: projectId,
      data: result.data,
      meta: {
        provider: result.provider,
        model: result.model,
        tokens_used: result.tokensUsed,
        cost_usd: result.costUsd,
        duration_ms: durationMs,
        retried: result.retried,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[API /generate/story]", message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET() {
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const isMock = process.env.FORCE_MOCK_AI === "true" || (!hasOpenAI && !hasAnthropic);
  return NextResponse.json({
    status: "ok",
    // Mirror the adapter's priority: Claude (anthropic) preferred when available.
    provider: isMock ? "mock" : hasAnthropic ? "anthropic" : "openai",
    mock_mode: isMock,
  });
}
