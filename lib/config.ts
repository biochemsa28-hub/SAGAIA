// ─── Platform-wide production config ──────────────────────────────────────────

export type AnimationTier = "kenburns" | "cinematic" | "talking";

// ─── SINGLE PREMIUM TIER ───────────────────────────────────────────────────────
// VYNAVO produces ONE quality only: "talking" — lip-sync where the character's
// mouth moves with their voice (image + audio → VEED Fabric clip with synced
// narration). No cheap/fast tiers. Every video is a high-end "obra de arte".
// The type + functions are kept for compatibility but everything resolves to
// "talking" so old data / requests can never downgrade the output.

export function getAnimationTier(): AnimationTier {
  return forcedTier() ?? "talking";
}

export const TIER_RANK: Record<AnimationTier, number> = { kenburns: 0, cinematic: 1, talking: 2 };

// Every plan produces the single premium tier — plans differ only by volume.
export function maxTierForPlan(_plan: string | null | undefined): AnimationTier {
  return "talking";
}

export function tierAllowedForPlan(_tier: AnimationTier, _plan: string | null | undefined): boolean {
  return true;
}

// The effective tier for a project is ALWAYS the premium talking tier.
// Global tier override for CHEAP mass testing. Set FORCE_TIER=kenburns to make
// EVERY video use the near-free tier (image + Ken Burns motion + captions, NO
// per-scene video model, NO lip-sync). Unset → premium "talking" (default).
function forcedTier(): AnimationTier | null {
  const f = (process.env.FORCE_TIER ?? "").toLowerCase().trim();
  return f === "kenburns" || f === "cinematic" || f === "talking" ? f : null;
}

export function resolveProjectTier(_projectTier: string | null | undefined, _plan: string | null | undefined): AnimationTier {
  return forcedTier() ?? "talking";
}

// ─── CREDIT ECONOMY (single source of truth) ─────────────────────────────────
// NAVO = the in-app credit. Devalued ON PURPOSE into big numbers: each video costs
// THOUSANDS of NAVOS, not 1. Big buckets feel generous (Magnific/Krea/Topaz tactic)
// AND let us price each tier by its real cost. The model below GUARANTEES that every
// video — at any tier — earns at least MARGIN_MULTIPLIER× its cost, because both the
// per-video NAVO price and the plan NAVO grants are derived from the same anchor.
//
// Anchor: 1000 NAVOS = US$1.00 of customer-facing value.
export const NAVOS_PER_USD = 1000;

// REAL production cost per finished video, by tier (USD). Everything downstream —
// the NAVO price of a video, the free grant, the margin on every plan — is derived
// from these three numbers, so an estimate left here quietly becomes a price.
//
// kenburns is MEASURED (guion + 18 imágenes con SHOTS_PER_SCENE=3 + voz +
// 1 escena héroe animada + render local). It sat at the original $0.50 guess long
// after production had changed underneath it, which put the real gross margin at
// 1.2× instead of the 3× this file claims to guarantee.
//
// ⚠️ cinematic y talking siguen siendo ESTIMACIONES — nadie las midió todavía. Si
// la de kenburns estaba 2.5× por debajo, asumí que estas también lo están, y medilas
// antes de vender esos tiers.
export const TIER_COST_USD: Record<AnimationTier, number> = {
  // MEDIDO 2026-08-06 sobre api_logs: $8.168 de gasto real en 2 videos = $4.08
  // cada uno, con los cinco puntos de gasto registrando (guion, imágenes, clips,
  // voz y montaje). El $1.25 anterior era de cuando NO se animaba nada: desde que
  // Seedance anima todos los bloques, ese número dejó de describir el producto y
  // cada video se vendía por debajo de su costo.
  kenburns: 4.08,
  cinematic: 5.0,  // estimado — sigue sin medirse
  talking: 6.5,    // estimado — + lip-sync por escena (lo más caro)
};

// Markup over cost. 2.0 = price is 2× cost = 100% utilidad (floor). 3.0 = 200%
// markup = ~67% gross margin (healthy SaaS). Every video stays profitable by
// construction at any value — raise/lower this single number to tune margin.
export const MARGIN_MULTIPLIER = 3.0;

// NAVO price of ONE video at a tier = cost × margin × (NAVOS per USD).
// At 3×: kenburns 1500 · cinematic 6000 · talking 9000.
export const CREDIT_COST_BY_TIER: Record<AnimationTier, number> = {
  kenburns:  Math.round(TIER_COST_USD.kenburns  * MARGIN_MULTIPLIER * NAVOS_PER_USD),
  cinematic: Math.round(TIER_COST_USD.cinematic * MARGIN_MULTIPLIER * NAVOS_PER_USD),
  talking:   Math.round(TIER_COST_USD.talking   * MARGIN_MULTIPLIER * NAVOS_PER_USD),
};

export function creditCostForTier(tier: AnimationTier): number {
  return CREDIT_COST_BY_TIER[tier] ?? CREDIT_COST_BY_TIER.kenburns;
}

// ── SPEND KILL-SWITCH ────────────────────────────────────────────────────────
// Hard cap on how many videos the WHOLE app can produce per day. A bug, retry
// loop, or abuse can't drain your fal/API balance beyond this. Generous default
// for testing; raise via MAX_DAILY_VIDEOS when you scale for real.
export const MAX_DAILY_VIDEOS = Math.max(1, Number(process.env.MAX_DAILY_VIDEOS ?? 300) || 300);

// ── HYBRID ANIMATION ─────────────────────────────────────────────────────────
// How many "hero" scenes get REAL video (Seedance/Veo3) while the rest stay on
// free Ken Burns. Animating only the hook costs ~1/7 of animating everything but
// carries most of the impact: the first seconds decide whether anyone keeps
// watching. 0 = fully free. 1 = the hook. 2 = hook + climax.
export const ANIMATE_HERO_SCENES = Math.max(0, Number(process.env.ANIMATE_HERO_SCENES ?? 0) || 0);

export const NATIVE_AUDIO_ON = (process.env.NATIVE_AUDIO ?? "off").toLowerCase() === "on";

// ── MULTI-SHOT EDITING ───────────────────────────────────────────────────────
// How many camera setups to render per scene. The scene's runtime is split across
// them and the edit CUTS between angles, which is how limited-budget animation
// creates energy without animating anything. Cuts also hide the small drift
// between independently generated images — which is exactly why generating frames
// for continuous motion fails but cutting between angles works.
// 1 = current behaviour (one held image). 2-3 = real editing rhythm.
// Forced to 1 under native audio, and not as a preference: narrative blocks build
// their clips from the block's FIRST and LAST scene images only, and the assembler
// explicitly drops the shot list for a native segment. Every extra shot generated
// in that mode is paid for and then never appears on screen — measured at roughly
// a dollar per video of pure waste. A flag you can set to a value that only burns
// money is a bug, so the code refuses it rather than trusting the .env.
export const SHOTS_PER_SCENE = NATIVE_AUDIO_ON
  ? 1
  : Math.min(3, Math.max(1, Number(process.env.SHOTS_PER_SCENE ?? 1) || 1));

// Generate those extra setups as ONE 2x2 storyboard sheet sliced locally, instead
// of one fal call per shot.
//
// WHEN IT WORKS it is strictly better — measured on a real A/B: 1 call vs 3
// ($0.03 vs $0.09, 13s vs 30s), identical wardrobe/lighting across shots, and
// framings that actually differ (separate calls kept returning the same medium
// shot, and one grew an extra hand). Cost: each panel is half-width, ~10% softer
// (blurdetect 8.24 → 9.08), which is why the scene's PRIMARY image is still a
// full render and only the cut-aways come from the sheet.
//
// STILL OFF BY DEFAULT, but for a different reason than before. nano-banana only
// produced a sliceable 2x2 in 3 of 9 attempts, below break-even. A model sweep
// found flux-pro/kontext/max lands it 4 of 6 with a correct vertical sheet, which
// clears the bar on geometry — see SHOT_GRID_MODEL in services/fal/shot-grid.ts.
// What is NOT verified is kontext/max's price per image. The maths: the sheet
// replaces 2 cut-away renders (~$0.05), and a miss costs the sheet plus the
// fallback, so at a 4/6 hit rate it only wins while the sheet itself stays under
// ~$0.03. Confirm that on the fal dashboard before flipping SHOT_GRID=on.
// Same reasoning: the sheet exists to be sliced into extra shots, and native
// blocks never use them. Buying a storyboard per scene to throw it away was the
// other half of that wasted dollar.
export const SHOT_GRID_ON = !NATIVE_AUDIO_ON && (process.env.SHOT_GRID ?? "off").toLowerCase() === "on";

// Framing modifiers appended to the scene's base prompt, in cut order. Same subject,
// same moment — different lens. Index 0 is the AI's own framing (unmodified), which
// in practice comes back as a medium shot of whoever is speaking.
//
// These are real coverage, not three versions of the same size. The previous set
// asked for a "tighter medium close-up" and then an "extreme close-up" — two shots
// that sit next to each other on the lens, so the edit had nothing to cut BETWEEN
// and every model returned near-identical frames. Wide → medium → detail is how
// coverage has worked since Griffith: the wide sells the place, the medium sells
// the person, the insert sells the thing that matters. Cutting across those sizes
// reads as filmmaking; cutting between two close-ups reads as a mistake.
//
// Order matters — SHOTS_PER_SCENE takes these from the top, so the two strongest
// contrasts against the medium anchor come first.
export const SHOT_FRAMINGS: string[] = [
  "",
  ", wide establishing shot — the character small in the frame, the location and its depth visible around them, same moment and lighting",
  ", extreme close-up detail insert — the eyes, or the hands, or the one object this beat turns on, shallow focus, same lighting",
  ", over-the-shoulder shot from behind the character, seeing what they see, same moment and lighting",
];

// Which scene numbers deserve the paid animation, given the total scene count.
// Deterministic on purpose: predictable cost beats clever-but-variable.
export function heroSceneNumbers(totalScenes: number): number[] {
  const n = Math.min(ANIMATE_HERO_SCENES, totalScenes);
  if (n <= 0) return [];
  if (n === 1) return [1];                       // the hook
  const heroes = new Set<number>([1, totalScenes]); // hook + closing cliffhanger
  // Fill any remaining budget from the middle outward (the escalation beats).
  let mid = Math.ceil(totalScenes / 2);
  while (heroes.size < n && mid > 1) { heroes.add(mid); mid--; }
  return [...heroes].sort((a, b) => a - b).slice(0, n);
}

// NAVOS a monthly plan should grant for a given price, so the customer gets exactly
// their money's worth at the 2× anchor — which keeps every video ≥100% markup.
// $9 → 9000 NAVOS, $49 → 49000, etc.
export function navosForPriceUsd(usd: number): number {
  return Math.round(usd * NAVOS_PER_USD);
}

// Free trial grant on signup. The intent was always "exactly ONE video — the wow
// moment that converts", but it was written as the literal 9000 that a talking-tier
// video cost at the time. When FORCE_TIER moved production to kenburns, that same
// 9000 silently became SIX free videos — around $7.50 of real spend for every
// person who signs up and never pays.
//
// Derived now, so it can never drift from the price again: N videos at whatever a
// video actually costs today.
export const FREE_SIGNUP_VIDEOS = Math.max(1, Number(process.env.FREE_SIGNUP_VIDEOS ?? 1) || 1);
export const FREE_SIGNUP_NAVOS = creditCostForTier(getAnimationTier()) * FREE_SIGNUP_VIDEOS;

// PRO pipeline: scene image → Seedance (cinematic motion) → video lip-sync (sync.so),
// so every talking scene has REAL motion AND a synced mouth. OFF by default (it
// doubles cost + time per scene and needs live validation). Flip PRO_PIPELINE=on.
export const PRO_PIPELINE = (process.env.PRO_PIPELINE ?? "off").toLowerCase() === "on";

// ── CHARACTER BIBLE ──────────────────────────────────────────────────────────
// Build a one-time multi-view reference sheet per character (front, three-quarter,
// profile, expression) from the approved portrait, and pass it to the edit model
// alongside that portrait. One viewpoint forces the model to invent every other
// angle; a sheet shows it. Costs ~$0.06 per character, ONCE — reused by every
// scene and inherited by every later episode. Disable with CHARACTER_BIBLE=off.
export const CHARACTER_BIBLE_ON = (process.env.CHARACTER_BIBLE ?? "on").toLowerCase() !== "off";

// ── JOB QUEUE ────────────────────────────────────────────────────────────────
// How many videos the worker produces at once. Each one holds open several fal /
// ElevenLabs calls, so this is the real throttle on spend rate as well as on CPU.
export const MAX_CONCURRENT_JOBS = Math.max(1, Number(process.env.MAX_CONCURRENT_JOBS ?? 2) || 2);

// How often the worker looks for new work. Low enough to feel instant, high
// enough that an idle server isn't hammering the database.
export const JOB_POLL_MS = Math.max(1000, Number(process.env.JOB_POLL_MS ?? 3000) || 3000);

// A job whose heartbeat is older than this is considered abandoned and re-queued.
// Must comfortably exceed the longest gap between heartbeats (the render poll
// stamps one every 5s) or live jobs would be stolen from under themselves.
export const JOB_STALE_SECONDS = Math.max(120, Number(process.env.JOB_STALE_SECONDS ?? 300) || 300);

// Where the worker reaches the app's own routes. Loopback by default because the
// worker runs inside the same process; set it when running behind a proxy.
export const APP_BASE_URL =
  process.env.APP_BASE_URL ??
  process.env.NEXTAUTH_URL ??
  `http://127.0.0.1:${process.env.PORT ?? 3000}`;

// ── CONTINUITY GATE ──────────────────────────────────────────────────────────
// Inspect the scene images BEFORE paying a video model. Costs nothing (FFmpeg on
// pixels, no API call) and catches the failure that already burned us: the cast
// not matching the script, so every scene inherited scene 1's frame and we paid
// to animate six copies of the same picture. Disable with CONTINUITY_GATE=off.
export const CONTINUITY_GATE_ON = (process.env.CONTINUITY_GATE ?? "on").toLowerCase() !== "off";

// ── HOOK BLOCK ───────────────────────────────────────────────────────────────
// The hero scene stops being "one still with a Ken Burns pan" and becomes a real
// multi-shot block: its image → a 2x2 storyboard sheet → Seedance v1.5, which
// cuts between the panels as full-frame shots with genuine motion.
//
// Measured, not assumed: v1 pro animated the sheet AS a grid and then invented an
// unrelated scene; v1.5 played the panels as a sequence — medium, then insert on
// the hand, then a wide — keeping face, wardrobe and location. That is the
// difference between "animated slideshow" and "shot on a set".
//
// It costs ~$0.65 (sheet + clip) on top of the video, so it is deliberately scoped
// to the HOOK — the seconds that decide whether anyone keeps watching — via the
// existing ANIMATE_HERO_SCENES budget. OFF by default: turning it on raises cost
// per video, and that has to be your call, not a default.
export const HOOK_BLOCK_ON = (process.env.HOOK_BLOCK ?? "off").toLowerCase() === "on";

// Seedance holds the sheet as a GRID for the opening seconds before committing to
// the first full-frame shot — measured at ~4.5s across real 10s clips, not the 2s
// a single sample suggested. So: ask for the maximum length and cut generously,
// leaving ~10s of clean multishot.
// 12 is Seedance's hard ceiling — the API rejects anything above it outright.
export const HOOK_BLOCK_SECONDS = Math.min(12, Math.max(6, Number(process.env.HOOK_BLOCK_SECONDS ?? 12) || 12));
export const HOOK_BLOCK_TRIM_SECONDS = Math.max(0, Number(process.env.HOOK_BLOCK_TRIM_SECONDS ?? 5) || 0);

// ── NARRATIVE BLOCKS ─────────────────────────────────────────────────────────
// Animate the video as a handful of multi-scene BLOCKS instead of one clip per
// scene. Measured on a real 53s video: 6 blocks instead of 14 clips — $3.72 of
// motion instead of $8.68 — and the result is better, because a single 8s
// generation comes back with three real camera setups while a 3.8s one barely
// manages a single move.
//
// Supersedes HOOK_BLOCK when on: the hook is simply the first block.
export const NARRATIVE_BLOCKS_ON = (process.env.NARRATIVE_BLOCKS ?? "off").toLowerCase() === "on";

// How much narration one block should cover. 10s is the sweet spot found in
// testing: long enough for three shots, short enough that the clip's internal
// cuts still land near the dialogue beats.
// Clamped to what a clip can ACTUALLY cover after the storyboard head is cut off.
// These are separate env vars and drifting them apart is silent and ugly: a block
// whose narration outruns its clip freezes on the last frame for the remainder.
// Measured that failure directly — 13s of narration over an 8s clip held a still
// for five seconds. Tying them means it cannot happen by configuration.
// The trim only exists to cut a storyboard grid off the front. Native-audio clips
// never show one, so the whole generation is usable — subtracting the trim there
// shrinks every block by 5s and buys 10 clips where 6 would do, at $0.62 each.
const USABLE_CLIP_SECONDS = NATIVE_AUDIO_ON
  ? HOOK_BLOCK_SECONDS
  : Math.max(4, HOOK_BLOCK_SECONDS - HOOK_BLOCK_TRIM_SECONDS);
export const BLOCK_TARGET_SECONDS = Math.min(
  USABLE_CLIP_SECONDS,
  Math.min(12, Math.max(6, Number(process.env.BLOCK_TARGET_SECONDS ?? 10) || 10)),
);

// Chain each block's storyboard sheet off the PREVIOUS block's closing frame, so
// wardrobe, lighting and location carry across the whole video and it reads as
// one continuous piece instead of six clips glued together.
export const BLOCK_CHAIN_CONTINUITY = (process.env.BLOCK_CHAIN ?? "on").toLowerCase() !== "off";

// ── NATIVE CHARACTER AUDIO ───────────────────────────────────────────────────
// Seedance returns clips whose characters SPEAK — in Spanish, with emotion, and
// (verified) saying the script's lines verbatim when the dialogue is quoted in
// the prompt. We were discarding that track and dubbing an ElevenLabs narrator
// over it, which is why every video "sounded narrated" no matter how the script
// was rewritten.
//
// Turning this on changes the product's shape, not just a setting:
//   · every second of the video must be a CLIP — a still has no native audio
//   · ElevenLabs is no longer called at all
//   · captions come from transcribing what was actually said, not from dictating it

// Language passed to the transcriber for the burned captions.
export const NATIVE_AUDIO_LANGUAGE = process.env.NATIVE_AUDIO_LANGUAGE ?? "es";

// ── ANCHOR IMAGES ONLY ───────────────────────────────────────────────────────
// A narrative block is generated from exactly two frames: its own first scene and
// the next block's first scene (end_image_url). Every OTHER scene image is paid
// for and never reaches the screen — the model invents what happens between the
// two anchors, which is the whole point of the block.
//
// With 14 scenes and 6 blocks that is 7 renders bought and discarded. Turning this
// on plans the blocks FIRST (free — the planner sizes them from the script text)
// and then renders only the frames the clips will actually consume.
//
// Off restores per-scene images, which the Ken Burns path still needs.
// Depende TAMBIÉN de los bloques, y no es un detalle: sin bloques cada escena
// necesita su propia imagen para animarse, y la ruta por escena descarta las que
// no la tienen. Atado solo al audio nativo, apagar NARRATIVE_BLOCKS dejaba 14
// escenas con 4 imágenes y por lo tanto 4 clips — un modo roto que parecía una
// decisión de configuración.
export const ANCHOR_IMAGES_ONLY = NATIVE_AUDIO_ON
  && NARRATIVE_BLOCKS_ON
  && (process.env.ANCHOR_IMAGES_ONLY ?? "on").toLowerCase() !== "off";

// ── HARD LENGTH CEILING ──────────────────────────────────────────────────────
// The last line of defence on spend. The script prompt is capped at 60s, but a
// model that ignores the instruction, a legacy project, or a future edit to the
// duration map would all reach the video step and bill per block regardless.
// Blocks past this count are dropped before a single clip is submitted.
export const MAX_VIDEO_SECONDS = Math.max(20, Number(process.env.MAX_VIDEO_SECONDS ?? 60) || 60);
export const MAX_BLOCKS_PER_VIDEO = Math.max(2, Math.ceil(MAX_VIDEO_SECONDS / BLOCK_TARGET_SECONDS));

// ── LA DURACIÓN ELEGIDA MANDA ────────────────────────────────────────────────
// El tope era una sola variable global para todos los proyectos, así que elegir
// "30s" y elegir "60s" producía lo mismo, y un guion largo se recortaba a la
// mitad: medido, "el guion pedía 9 bloques" y se emitieron 6 — cuatro escenas
// quedaron fuera y la historia terminaba en la nada.
//
// Lo que el usuario elige es un CONTRATO: si pide 60 segundos, el video dura 60.
// Lo que no entra no se recorta al final — se convierte en la Parte 2, que es
// para lo que existe la serie.
//
// La variable global queda como techo absoluto de gasto, nunca como el objetivo.
const SEGUNDOS_POR_DURACION: Record<string, number> = {
  "15s": 15, "30s": 30, "60s": 60, "90s": 90, "120s": 120,
  "3-5min": 120, "10-20min": 120,
};

export function videoSecondsFor(durationTarget: string | null | undefined): number {
  const pedido = SEGUNDOS_POR_DURACION[(durationTarget ?? "").trim()] ?? 60;
  return Math.min(pedido, MAX_VIDEO_SECONDS);
}

export function maxBlocksFor(durationTarget: string | null | undefined): number {
  return Math.max(1, Math.ceil(videoSecondsFor(durationTarget) / BLOCK_TARGET_SECONDS));
}
