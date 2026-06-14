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
}
