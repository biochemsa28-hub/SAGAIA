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
