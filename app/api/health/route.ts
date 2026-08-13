import { NextResponse } from "next/server";
import {
  resolveProjectTier, creditCostForTier, getAnimationTier, TIER_COST_USD,
  CHARACTER_BIBLE_ON, CONTINUITY_GATE_ON, SHOT_GRID_ON, HOOK_BLOCK_ON,
  SHOTS_PER_SCENE, ANIMATE_HERO_SCENES, MAX_CONCURRENT_JOBS, MAX_DAILY_VIDEOS,
  FREE_SIGNUP_NAVOS, MAX_VIDEO_SECONDS, MAX_BLOCKS_PER_VIDEO,
  NATIVE_AUDIO_ON, NARRATIVE_BLOCKS_ON, ANCHOR_IMAGES_ONLY,
} from "@/lib/config";
import { internalSecret } from "@/lib/internal-auth";

export const runtime = "nodejs";

// El limite de memoria REAL del contenedor, no el del host. ffmpeg murio con
// SIGKILL en todas las escenas y estuvimos horas adivinando el motivo porque
// nadie sabia cuanta memoria habia disponible: Node reporta la del nodo entero,
// que en Railway no tiene ninguna relacion con lo que el contenedor puede usar.
// cgroup v2 primero, v1 de respaldo; "max" significa sin limite.
function memoriaContenedor() {
  const leer = (p: string): number | null => {
    try {
      const t = require("fs").readFileSync(p, "utf-8").trim();
      if (t === "max") return null;
      const n = Number(t);
      return Number.isFinite(n) && n > 0 && n < 1e15 ? n : null;
    } catch { return null; }
  };
  const mb = (n: number | null) => (n === null ? null : Math.round(n / 1048576));
  const limite = leer("/sys/fs/cgroup/memory.max") ?? leer("/sys/fs/cgroup/memory/memory.limit_in_bytes");
  const uso = leer("/sys/fs/cgroup/memory.current") ?? leer("/sys/fs/cgroup/memory/memory.usage_in_bytes");
  const limMb = mb(limite);
  const usoMb = mb(uso);
  return {
    limite_mb: limMb,
    en_uso_mb: usoMb,
    libre_mb: limMb !== null && usoMb !== null ? limMb - usoMb : null,
    node_rss_mb: Math.round(process.memoryUsage().rss / 1048576),
    cpus_visibles: require("os").cpus().length,
    // Un render de una escena a 1080x1920 necesita holgura real. Por debajo de
    // esto x264 no llega a emitir el primer fotograma antes del SIGKILL.
    suficiente_para_ffmpeg:
      limMb !== null && usoMb !== null ? limMb - usoMb >= 350 : null,
  };
}

export async function GET(req: Request) {
  // Actually TALK to the database instead of checking that a variable exists.
  // Reporting database:true for a present-but-broken connection is what sent us
  // chasing a "forgotten password" for half an hour while every write silently
  // failed with a 500. A health check that only reads env vars is a health check
  // that lies at the exact moment you need it.
  let db_connection: { ok: boolean; error?: string } = { ok: false, error: "no probada" };
  try {
    const { getDb } = await import("@/lib/db");
    await getDb().execute("SELECT 1");
    db_connection = { ok: true };
  } catch (e) {
    db_connection = { ok: false, error: (e instanceof Error ? e.message : String(e)).slice(0, 200) };
  }

  const checks = {
    openai:      Boolean(process.env.OPENAI_API_KEY),
    elevenlabs:  Boolean(process.env.ELEVENLABS_API_KEY),
    fal:         Boolean(process.env.FAL_API_KEY),
    shotstack:   Boolean(process.env.SHOTSTACK_API_KEY),
    stripe:      Boolean(process.env.STRIPE_SECRET_KEY),
    resend:      Boolean(process.env.RESEND_API_KEY),
    posthog:     Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY),
    nextauth:    Boolean(process.env.NEXTAUTH_SECRET),
    database:    Boolean(process.env.TURSO_DATABASE_URL),
    // These were NOT checked before, which made it impossible to tell from
    // outside whether production had them — and both fail SILENTLY when absent.
    // Without Anthropic the story quietly falls back to OpenAI; without R2 every
    // asset is written to fal storage, whose URLs EXPIRE. That is the exact bug
    // that made finished videos disappear.
    anthropic:   Boolean(process.env.ANTHROPIC_API_KEY),
    r2_storage:  Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET),
    internal_secret: Boolean(process.env.INTERNAL_JOB_SECRET),
    force_mock_ai:    process.env.FORCE_MOCK_AI    ?? "unset",
    force_mock_voice: process.env.FORCE_MOCK_VOICE ?? "unset",
    force_mock_image: process.env.FORCE_MOCK_IMAGE ?? "unset",
    env: process.env.NODE_ENV,
    vercel: Boolean(process.env.VERCEL),
  };

  // Effective creative-pipeline config the RUNNING server has loaded — confirms
  // the .env.local changes actually took effect (env needs a server restart).
  // What the RUNNING server actually has switched on. Production had been
  // diagnosed by guessing for weeks — every quality and cost decision in this app
  // is a flag, and none of them were visible from outside the box.
  const tier = resolveProjectTier(null, "free");
  const production = {
    tier,
    navos_per_video: creditCostForTier(tier),
    cost_usd_per_video: TIER_COST_USD[tier],
    free_signup_navos: FREE_SIGNUP_NAVOS,
    character_bible: CHARACTER_BIBLE_ON,
    continuity_gate: CONTINUITY_GATE_ON,
    shot_grid: SHOT_GRID_ON,
    hook_block: HOOK_BLOCK_ON,
    shots_per_scene: SHOTS_PER_SCENE,
    animate_hero_scenes: ANIMATE_HERO_SCENES,
    // The worker is a long-lived loop; on serverless it can never run, which is
    // the single most important thing to know about a given deployment.
    queue_worker_configured: Boolean(internalSecret()),
    max_concurrent_jobs: MAX_CONCURRENT_JOBS,
    max_daily_videos: MAX_DAILY_VIDEOS,
    max_video_seconds: MAX_VIDEO_SECONDS,
    max_blocks_per_video: MAX_BLOCKS_PER_VIDEO,
    native_audio: NATIVE_AUDIO_ON,
    narrative_blocks: NARRATIVE_BLOCKS_ON,
    anchor_images_only: ANCHOR_IMAGES_ONLY,
    render_engine: (process.env.RENDER_ENGINE ?? "shotstack").toLowerCase(),
    voice_model: process.env.ELEVEN_MODEL ?? "eleven_v3",
    shot_grid_model: process.env.SHOT_GRID_MODEL ?? "flux-pro/kontext/max",
    effective_tier_source: process.env.FORCE_TIER ? "FORCE_TIER" : "default",
    animation_tier_default: getAnimationTier(),
  };

  const pipeline = {
    flux_quality:           process.env.FLUX_QUALITY ?? "default(cinematic)",
    realism_lora_active:    Boolean(process.env.FLUX_REALISM_LORA),
    realism_trigger:        process.env.FLUX_REALISM_TRIGGER ?? "unset",
    character_consistency:  process.env.CHARACTER_CONSISTENCY ?? "default(on)",
    character_ref_model:    process.env.CHARACTER_REF_MODEL ?? "default(nano-banana/edit)",
    character_gen_model:    process.env.CHARACTER_GEN_MODEL ?? "default(nano-banana)",
    animation_tier_default: process.env.ANIMATION_TIER ?? "default(kenburns)",
    video_model:            process.env.VIDEO_MODEL ?? "default(seedance-pro)",
    auto_sfx:               process.env.AUTO_SFX ?? "default(on)",
    lipsync_model:          process.env.LIPSYNC_MODEL ?? "default(veed/fabric-1.0)",
  };


  // Validate the SHAPE of each secret without ever revealing it. A variable that
  // merely EXISTS is not enough: pasting a raw .env block into a hosting panel can
  // store the whole  line as the value, and the trailing quote comes
  // along too. Those characters are illegal in an HTTP header, so every provider
  // call died with "invalid header value" while the health check happily reported
  // the key as present.
  const suciedad = (v?: string) => {
    if (!v) return null;
    if (/^[A-Z0-9_]+=/.test(v)) return 'contiene el NOMBRE de la variable';
    if (/^["']|["']$/.test(v)) return 'tiene comillas';
    if (v !== v.trim()) return 'tiene espacios o saltos de linea';
    if (v.includes(String.fromCharCode(10)) || v.includes(String.fromCharCode(13))) return "tiene saltos de linea";
    return null;
  };
  const secret_format: Record<string, string> = {};
  for (const k of ['FAL_API_KEY','ANTHROPIC_API_KEY','OPENAI_API_KEY','ELEVENLABS_API_KEY','TURSO_AUTH_TOKEN','TURSO_DATABASE_URL','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','STRIPE_SECRET_KEY','INTERNAL_JOB_SECRET','NEXTAUTH_SECRET']) {
    const problema = suciedad(process.env[k]);
    if (problema) secret_format[k] = problema;
  }


  // Shape checks were not enough. A value can be perfectly formatted and still be
  // the wrong thing: R2_PUBLIC_URL once held the literal text ".env.local linea 53"
  // — my own instruction, pasted instead of the value — and every image URL became
  // unparseable while the health check reported the variable as clean.
  const ESPERADO: Record<string, { test: (v: string) => boolean; dice: string }> = {
    R2_PUBLIC_URL:      { test: (v) => v.startsWith("http"), dice: "debe empezar con https://" },
    NEXTAUTH_URL:       { test: (v) => v.startsWith("http"), dice: "debe empezar con https://" },
    TURSO_DATABASE_URL: { test: (v) => v.startsWith("libsql://") || v.startsWith("http"), dice: "debe empezar con libsql://" },
    FAL_API_KEY:        { test: (v) => v.includes(":"), dice: "debe tener el formato id:secreto" },
    ELEVENLABS_API_KEY: { test: (v) => v.startsWith("sk_"), dice: "debe empezar con sk_" },
    ANTHROPIC_API_KEY:  { test: (v) => v.startsWith("sk-ant-"), dice: "debe empezar con sk-ant-" },
    OPENAI_API_KEY:     { test: (v) => v.startsWith("sk-"), dice: "debe empezar con sk-" },
    STRIPE_SECRET_KEY:  { test: (v) => v.startsWith("sk_"), dice: "debe empezar con sk_" },
  };
  // Y ni siquiera el contenido alcanza. ELEVENLABS_API_KEY pasó las dos
  // validaciones —empieza con sk_, sin comillas ni espacios— y ElevenLabs la
  // rechazó igual en todas las producciones: "API key must start with 'sk_'".
  // Una clave puede tener la forma correcta y estar revocada, ser de otra cuenta
  // o venir incompleta. La única prueba real es preguntarle al proveedor.
  //
  // Va detrás de ?live=1 a propósito: el HEALTHCHECK del contenedor pega acá cada
  // 30 segundos, y no vamos a golpear proveedores externos en cada latido.
  const live: Record<string, string> = {};
  if (new URL(req.url).searchParams.get("live") === "1") {
    const el = process.env.ELEVENLABS_API_KEY;
    if (el) {
      // /v1/user es una lectura: no genera nada y no cuesta créditos.
      live.elevenlabs = await fetch("https://api.elevenlabs.io/v1/user", {
        headers: { "xi-api-key": el },
      })
        .then((r) => (r.ok ? "ok" : `RECHAZADA (${r.status})`))
        .catch((e) => `sin respuesta: ${e instanceof Error ? e.message.slice(0, 60) : "error"}`);
    } else {
      live.elevenlabs = "no configurada";
    }

    // ANTHROPIC, por la misma razón exacta que ElevenLabs.
    //
    // Medido: una clave de 108 caracteres, que empieza con sk-ant- y no tiene
    // comillas ni espacios —o sea que pasa las dos validaciones de forma y de
    // contenido— fue rechazada por Anthropic con "API key is invalid". Estaba
    // revocada. Con solo mirar la forma, el chequeo diría "anthropic: ok"
    // mientras ningún guion se genera, y el problema se buscaría en otro lado.
    //
    // /v1/models es una LECTURA: no genera nada y no gasta tokens.
    const an = process.env.ANTHROPIC_API_KEY;
    live.anthropic = an
      ? await fetch("https://api.anthropic.com/v1/models?limit=1", {
          headers: { "x-api-key": an, "anthropic-version": "2023-06-01" },
        })
          .then((r) => (r.ok ? "ok" : `RECHAZADA (${r.status})`))
          .catch((e) => `sin respuesta: ${e instanceof Error ? e.message.slice(0, 60) : "error"}`)
      : "no configurada";

    // FAL: es quien cobra por imágenes y video, así que una clave muerta o una
    // cuenta sin saldo detienen la producción entera. Ya pasó dos veces.
    const fk = process.env.FAL_KEY ?? process.env.FAL_API_KEY;
    live.fal = fk
      ? await fetch("https://rest.alpha.fal.ai/tokens/", {
          method: "POST",
          headers: { Authorization: `Key ${fk}`, "content-type": "application/json" },
          body: JSON.stringify({ allowed_apps: ["fal-ai/any"], token_expiration: 60 }),
        })
          .then((r) => (r.ok ? "ok" : `RECHAZADA (${r.status})`))
          .catch((e) => `sin respuesta: ${e instanceof Error ? e.message.slice(0, 60) : "error"}`)
      : "no configurada";
  }

  const secret_content: Record<string, string> = {};
  for (const [k, regla] of Object.entries(ESPERADO)) {
    const v = process.env[k];
    if (v && !regla.test(v)) secret_content[k] = regla.dice;
  }
  // UNA CLAVE MAL FORMADA NO ES UNA CLAVE PRESENTE.
  //
  // checks.* solo miraba si la variable EXISTE, así que ELEVENLABS_API_KEY
  // aparecía en true mientras secret_content la marcaba como inválida y todas las
  // producciones salían sin música ni efectos. Un diagnóstico que dice "ok" sobre
  // algo roto es peor que no tener diagnóstico: manda a buscar el problema a otro
  // lado. Si el contenido o el formato están mal, el check se cae con ellos.
  const VAR_DE_CHECK: Record<string, string> = {
    ELEVENLABS_API_KEY: "elevenlabs", FAL_API_KEY: "fal", OPENAI_API_KEY: "openai",
    ANTHROPIC_API_KEY: "anthropic", STRIPE_SECRET_KEY: "stripe",
    TURSO_DATABASE_URL: "database", NEXTAUTH_SECRET: "nextauth",
    INTERNAL_JOB_SECRET: "internal_secret",
  };
  for (const variable of [...Object.keys(secret_content), ...Object.keys(secret_format)]) {
    const check = VAR_DE_CHECK[variable];
    if (check && check in checks) (checks as Record<string, unknown>)[check] = false;
  }

  const missing = Object.entries(checks)
    .filter(([k, v]) => typeof v === "boolean" && !v)
    .map(([k]) => k);

  // ── QUÉ VERSIÓN ESTÁ CORRIENDO ───────────────────────────────────────────
  //
  // Faltaba, y se notó: la única forma de saber si producción tenía un arreglo
  // era pegar un log y deducirlo del FORMATO de una línea — "dice
  // '· proveedores:', entonces tiene el router". Eso es adivinar con evidencia
  // indirecta, y envejece mal: en cuanto pasan unas horas, la deducción ya no
  // vale y nadie sabe si desplegó.
  //
  // Railway inyecta el commit en el contenedor. Exponerlo convierte la pregunta
  // "¿está desplegado?" en una consulta de un segundo, sin abrir el panel.
  const version = {
    commit: (process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "desconocido").slice(0, 7),
    mensaje: (process.env.RAILWAY_GIT_COMMIT_MESSAGE ?? "").slice(0, 90) || null,
    rama: process.env.RAILWAY_GIT_BRANCH ?? process.env.VERCEL_GIT_COMMIT_REF ?? null,
    desplegado: process.env.RAILWAY_DEPLOYMENT_ID?.slice(0, 8) ?? null,
    arrancado_hace_seg: Math.round(process.uptime()),
  };

  // Y CON QUÉ CONFIGURACIÓN. Cada decisión de calidad y de gasto es una
  // variable, y hasta ahora había que producir un video para descubrir cuáles
  // estaban puestas. Estas son las que deciden cuánto cuesta cada video.
  const gasto = {
    resolucion: process.env.VIDEO_RESOLUTION ?? "default(720p)",
    bloque_segundos: process.env.BLOCK_TARGET_SECONDS ?? "default(6)",
    picos_caros_max: process.env.RTV_MAX_BLOCKS ?? "default(0 · apagado)",
    modo_referencias: process.env.RTV_MODE ?? "default(peaks)",
    cuadro_destino: process.env.PEAK_FRAMES ?? "default(on)",
    presupuesto_por_segundo: process.env.MAX_ANIMATION_SPEND_PER_SECOND ?? "default(0.1167)",
    tope_absoluto: process.env.MAX_ANIMATION_SPEND_USD ?? "sin tope",
    redibujos_max: process.env.CONTINUITY_REDRAW_MAX ?? "default(4)",
    rol: process.env.ROLE ?? "default(all)",
  };

  return NextResponse.json({
    ok: missing.length === 0,
    version,
    gasto,
    missing,
    memoria: memoriaContenedor(),
    checks,
    db_connection,
    secret_format,
    secret_content,
    // Solo aparece con ?live=1 — ver el comentario donde se construye.
    ...(Object.keys(live).length ? { live } : {}),
    production,
    pipeline,
  });
}
