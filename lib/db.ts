import { createClient, type Client } from "@libsql/client";
import { readFileSync } from "fs";
import { isAbsolute, resolve, join } from "path";
import { mkdirSync } from "fs";

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
  const rawPath = process.env.DATABASE_PATH ?? "./db/SAGAIA.db";
  const absPath = isAbsolute(rawPath) ? rawPath : resolve(process.cwd(), rawPath);

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

  // Read schema — works both locally and on Vercel (bundled at build time)
  let schema: string;
  try {
    // Local: derive path from DATABASE_PATH
    const rawPath = process.env.DATABASE_PATH ?? "./db/SAGAIA.db";
    const absDbPath = isAbsolute(rawPath) ? rawPath : resolve(process.cwd(), rawPath);
    const projectRoot = resolve(absDbPath, "../../");
    schema = readFileSync(join(projectRoot, "db/schema/001_initial.sql"), "utf-8");
  } catch {
    // Vercel/production: schema next to this file (copied via vercel.json)
    schema = readFileSync(join(process.cwd(), "db/schema/001_initial.sql"), "utf-8");
  }

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
