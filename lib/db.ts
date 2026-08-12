import { createClient, type Client } from "@libsql/client";
import { readFileSync } from "fs";
import { isAbsolute, resolve, join, dirname } from "path";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";

// Project root resolved from import.meta.url (works in Turbopack/ESM)
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

let _client: Client | null = null;

export function getDb(): Client {
  if (_client) return _client;

  // ── Turso (production) ────────────────────────────────────────────────────
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;
  if (tursoUrl) {
    _client = createClient({ url: tursoUrl, authToken: tursoToken });
    return _client;
  }

  // ── Local SQLite (development) ────────────────────────────────────────────
  const rawPath = process.env.DATABASE_PATH ?? "./db/VYNAVO.db";
  const absPath = isAbsolute(rawPath) ? rawPath : resolve(PROJECT_ROOT, rawPath);

  const sep = absPath.includes("/") ? "/" : "\\";
  const dir = absPath.substring(0, absPath.lastIndexOf(sep));
  if (dir) mkdirSync(dir, { recursive: true });

  // On Windows, C:\... needs file:/// to avoid "C:" being parsed as host
  const fileUrl = absPath.match(/^[A-Za-z]:/)
    ? `file:///${absPath.replace(/\\/g, "/")}`
    : `file:${absPath}`;
  _client = createClient({ url: fileUrl });
  return _client;
}

export async function initDb(): Promise<void> {
  const db = getDb();

  // Read schema — always relative to project root (derived from __dirname)
  const schema = readFileSync(join(PROJECT_ROOT, "db/schema/001_initial.sql"), "utf-8");

  const statements = schema
    .split(";")
    .map((s) => {
      const withoutComments = s
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim();
      return withoutComments;
    })
    .filter((s) => {
      if (!s) return false;
      if (/^PRAGMA\s/i.test(s)) return false;
      return true;
    });

  for (const stmt of statements) {
    try {
      await db.execute(stmt);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("already exists")) continue;
      throw err;
    }
  }

  // ── Idempotent migrations (safe to run every boot) ──────────────────────────
  // Track whether the credit spent on a project was already refunded after a
  // failed production, so we never double-refund.
  await runMigration(db, "ALTER TABLE projects ADD COLUMN credit_refunded INTEGER NOT NULL DEFAULT 0");

  // Recurring characters — the moat. A saved character locks in a reference image
  // (the face/look) that future stories reuse, so the same character persists
  // across many videos. projects.character_id links a project to a saved character.
  await runMigration(db, "ALTER TABLE characters ADD COLUMN reference_image_url TEXT");
  await runMigration(db, "ALTER TABLE characters ADD COLUMN niche TEXT");
  await runMigration(db, "ALTER TABLE characters ADD COLUMN updated_at TEXT");
  await runMigration(db, "ALTER TABLE projects ADD COLUMN character_id TEXT");

  // Per-project animation tier (kenburns|cinematic|talking) — chosen at creation,
  // gated by the user's plan. Null falls back to the global ANIMATION_TIER default.
  await runMigration(db, "ALTER TABLE projects ADD COLUMN animation_tier TEXT");

  // Per-scene speaker attribution — WHO speaks the narration and their voice
  // archetype, so each character gets their own ElevenLabs voice (Phase 3).
  await runMigration(db, "ALTER TABLE scenes ADD COLUMN speaker TEXT");
  await runMigration(db, "ALTER TABLE scenes ADD COLUMN voice_profile TEXT");

  // How many NAVOS this project actually cost (varies by animation tier). Lets the
  // refund give back the exact amount spent, not a hardcoded 1.
  await runMigration(db, "ALTER TABLE projects ADD COLUMN credits_spent INTEGER NOT NULL DEFAULT 1");

  // A user-uploaded reference image (their real product / creative asset) so the
  // generated scenes feature it — the "made with AI but looks real" moment.
  await runMigration(db, "ALTER TABLE projects ADD COLUMN reference_image_url TEXT");

  // Multiple product/creative images (JSON array of URLs) so an ad can show the
  // product from several angles. nano-banana edit accepts an image array → better
  // multi-angle fidelity. reference_image_url stays as the primary (first) image.
  await runMigration(db, "ALTER TABLE projects ADD COLUMN reference_image_urls TEXT");

  // ── SERIES / EPISODES ──────────────────────────────────────────────────────
  // Every video promises a "Parte 2" in its CTA, so it has to be possible to make
  // one. A project can now point at the project it continues; the whole chain shares
  // a series_id. This is the retention loop: the viewer comes back for the next
  // episode, and the creator keeps producing (and spending) to deliver it.
  await runMigration(db, "ALTER TABLE projects ADD COLUMN series_id TEXT");
  await runMigration(db, "ALTER TABLE projects ADD COLUMN episode_number INTEGER NOT NULL DEFAULT 1");
  await runMigration(db, "ALTER TABLE projects ADD COLUMN parent_project_id TEXT");
  await runMigration(db, "CREATE INDEX IF NOT EXISTS idx_projects_series ON projects(series_id, episode_number)");
  // Backfill: projects created before this migration have series_id = NULL, so the
  // "next episode" lookup (WHERE series_id = ?) wouldn't even find the project
  // itself and Part 2 would be numbered 1. Every existing project becomes the head
  // of its own series. Safe to re-run — it only touches NULLs.
  await runMigration(db, "UPDATE projects SET series_id = id WHERE series_id IS NULL");

  // ── BORRADOR vs ESTRENO ────────────────────────────────────────────────────
  // El 82,5% del costo de un video se va en los clips de Seedance; el guion
  // cuesta el 0,4%. Sin una calidad barata, el usuario paga el render completo
  // solo para descubrir si la historia funcionaba — y si no funcionaba, perdió
  // el video entero. Con esta columna un proyecto puede producirse primero como
  // borrador (sin animación) y ascender a estreno cuando convence.
  // NULL = estreno, para que todo lo ya creado siga comportándose igual.
  await runMigration(db, "ALTER TABLE projects ADD COLUMN quality TEXT");

  // ── CHARACTER BIBLE ────────────────────────────────────────────────────────
  // A single multi-view sheet per character (front / three-quarter / profile /
  // expression) generated ONCE from the chosen portrait. Passed to nano-banana
  // alongside the portrait so the model sees the face from several angles instead
  // of guessing them from one photo — markedly better identity consistency across
  // scenes AND across episodes of a series. Costs ~$0.06 once, reused forever.

  // ── JOB QUEUE ──────────────────────────────────────────────────────────────
  // Production used to run as a fire-and-forget promise inside the request that
  // started it: nothing on disk, so a server restart silently lost a video the
  // user had already paid for, and nobody could tell whether it was still running
  // or dead. These columns make a job recoverable.
  //   heartbeat_at — the worker stamps it while alive; a stale stamp means the
  //                  process died mid-job and the row can be safely re-claimed.
  //   stage        — which step it reached, so the UI can say something true and
  //                  a retry knows what already succeeded.

  // The CAST chosen for a project (Phase 4): maps a character name → its selected
  // portrait (reference_image_url) + voice archetype. Lets production resolve each
  // scene's speaker to the right face (per-scene image reference) and voice.
  await runMigration(db, `CREATE TABLE IF NOT EXISTS project_cast (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT,
    voice_profile TEXT,
    reference_image_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  // ── One-time credit devaluation (NAVOS ×1000) ──────────────────────────────
  // We moved from "1 credit = 1 video" to a devalued economy where each video
  // costs THOUSANDS of NAVOS (see lib/config). Scale every existing balance ×1000
  // ONCE so pre-existing users keep the same purchasing power. Guarded by app_meta
  // so it can never run twice (which would over-inflate balances).
  await runMigration(db, `CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT)`);
  const already = await db.execute({ sql: "SELECT 1 FROM app_meta WHERE key = ? LIMIT 1", args: ["credit_scale_v2"] });
  if (already.rows.length === 0) {
    await db.execute("UPDATE users SET credits = credits * 1000");
    await db.execute({ sql: "INSERT INTO app_meta (key, value) VALUES (?, datetime('now'))", args: ["credit_scale_v2"] });
  }

  // ── COLUMNAS SOBRE TABLAS YA CREADAS ───────────────────────────────────────
  // Van al FINAL, después de todos los CREATE TABLE. Estaban arriba y en una base
  // NUEVA fallaban con "no such table", tirando abajo initDb entero — y con eso
  // toda escritura de la app devolvía 500. En local nunca se vio porque las tablas
  // ya existían de antes.
  // El ruido propio de cada escena (una puerta, un vidrio, pasos). Lo escribe el
  // guion y lo mezcla el ensamblador en el segundo exacto de esa escena.
  await runMigration(db, "ALTER TABLE scenes ADD COLUMN sfx_prompt TEXT");
  // Cómo se ve quien habla. Un nombre no identifica a nadie dentro de una imagen:
  // sin esto el modelo de video pone las líneas de los dos personajes en la boca
  // del que está enfocado.
  await runMigration(db, "ALTER TABLE scenes ADD COLUMN speaker_look TEXT");
  // Dónde transcurre la escena. Decide si el clip se encadena con el siguiente
  // (mismo lugar, toma continua) o corta limpio (cambio de escenario).
  await runMigration(db, "ALTER TABLE scenes ADD COLUMN location TEXT");
  // Qué se mueve en el ambiente: eje separado del personaje y de la cámara.
  await runMigration(db, "ALTER TABLE scenes ADD COLUMN environment TEXT");

  // ── RECUPERAR CONTRASEÑA ───────────────────────────────────────────────────
  // Hasta ahora no existía: quien olvidaba la suya quedaba afuera para siempre,
  // sin ninguna vía de vuelta. Se guarda el HASH del token, nunca el token: si
  // alguien lee esta tabla no puede entrar a ninguna cuenta con lo que ve.
  await runMigration(db, `CREATE TABLE IF NOT EXISTS password_resets (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  await runMigration(db, "CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id)");
  await runMigration(db, "ALTER TABLE project_cast ADD COLUMN bible_url TEXT");
  await runMigration(db, "ALTER TABLE jobs ADD COLUMN heartbeat_at TEXT");
  await runMigration(db, "ALTER TABLE jobs ADD COLUMN stage TEXT");
  await runMigration(db, "CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, created_at)");
  await runMigration(db, "CREATE INDEX IF NOT EXISTS idx_jobs_project ON jobs(project_id)");
}

// Run a migration that may already have been applied; ignore "duplicate"/"exists" errors.
async function runMigration(db: Client, sql: string): Promise<void> {
  try {
    await db.execute(sql);
  } catch (err) {
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
    if (msg.includes("duplicate column") || msg.includes("already exists")) return;
    throw err;
  }
}
