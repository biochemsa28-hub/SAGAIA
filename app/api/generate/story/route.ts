import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { storyGeneratorService } from "@/services/openai/story-generator";
import {
  createProject, saveGenerationResult, updateProjectStatus,
  deductCredits, createApiLog, setProjectCharacter, getUserById, setProjectCast,
  refundCreditForProject,
} from "@/lib/db/repository";
import { resolveProjectTier, creditCostForTier, videoSecondsFor } from "@/lib/config";
import { CHARS_PER_SECOND } from "@/services/video/narrative-blocks";
import { initDb } from "@/lib/db";
import { z } from "zod";
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
  topic: z.string().min(1),
  tone: z.string().min(1),
  duration_target: z.string().min(1),
  language: z.string().default("es"),
  visual_style: z.string().default("cinematic"),
  target_platform: z.string().optional(),
  additional_instructions: z.string().optional(),
  character_id: z.string().uuid().optional(), // reuse a saved recurring character
  animation_tier: z.enum(["kenburns", "cinematic", "talking"]).optional(),
  format: z.enum(["story", "ad"]).optional(), // "ad" = UGC advertising video
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
    role: z.string().max(40).optional(),
    voice_profile: z.string().max(30).optional(),
    reference_image_url: z.string().url().optional(),
    // Multi-view sheet inherited from a previous episode — kept so a series pays
    // to build the bible once instead of once per episode.
    bible_url: z.string().url().optional(),
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
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    await initDb();

    // Resolve the animation tier the user chose, clamped to what their plan allows.
    // The tier determines how many NAVOS the video costs (premium tiers cost more).
    const user = userId ? await getUserById(userId).catch(() => null) : null;
    const animationTier = resolveProjectTier(parsed.data.animation_tier ?? null, user?.plan ?? "free");
    const creditCost = creditCostForTier(animationTier);

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
      if (segundos < pedidos * 0.8) {
        console.warn(
          `[duracion] el guion da ~${segundos}s hablados de los ${pedidos}s pedidos (${pct}%) — el video va a salir corto`,
        );
      } else if (segundos > pedidos * 1.15) {
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
        const correccion =
          `\n[CORRECCIÓN DE DURACIÓN] El guion anterior sumaba ~${segundos} segundos hablados y se pidieron ${pedidos}. ` +
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

      // Un parlamento más largo que un clip NO se puede animar entero: el video se
      // congela mientras el personaje sigue hablando. Se detecta acá, antes de
      // gastar, y se nombra la escena — que es lo único accionable.
      // Se relee de result.data porque el reintento de duración pudo reemplazarlo.
      const largas = (result.data?.scenes ?? [])
        .filter((s) => (s.narration_text ?? "").trim().length > 200)
        .map((s) => `${s.scene_number} (${(s.narration_text ?? "").trim().length} car.)`);
      if (largas.length) {
        console.warn(
          `[duracion] ${largas.length} escena(s) con el parlamento más largo que un clip: ${largas.join(", ")}` +
          " — se van a congelar o repetir en el montaje. Regenerá el guion.",
        );
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
      if (corregidos) {
        console.warn(`[elenco] ${corregidos} atribución(es) corregidas — el guion se desvió de los nombres elegidos`);
      } else {
        console.log("[elenco] todas las escenas usan los nombres del elenco");
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
