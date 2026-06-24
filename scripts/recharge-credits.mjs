// One-off NAVOS recharge.
//   node scripts/recharge-credits.mjs <email> <amount>
// Example: node scripts/recharge-credits.mjs biochemsa28@gmail.com 100
//
// Targets PRODUCTION if TURSO_DATABASE_URL is set in the env, otherwise the
// local SQLite DB. To recharge production, put TURSO_DATABASE_URL and
// TURSO_AUTH_TOKEN in .env.local (copy them from Vercel), then run this.

import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local (simple parser, no extra deps)
try {
  const env = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* no .env.local — rely on shell env */ }

const email = process.argv[2];
const amount = Number(process.argv[3]);
if (!email || !Number.isFinite(amount)) {
  console.error("Usage: node scripts/recharge-credits.mjs <email> <amount>");
  process.exit(1);
}

const tursoUrl = process.env.TURSO_DATABASE_URL;
const db = tursoUrl
  ? createClient({ url: tursoUrl, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:///${resolve(process.cwd(), process.env.DATABASE_PATH ?? "./db/VYNAVO.db").replace(/\\/g, "/")}` });

console.log(`Target: ${tursoUrl ? "PRODUCTION (Turso)" : "LOCAL SQLite"}`);

const before = await db.execute({ sql: "SELECT credits FROM users WHERE email = ?", args: [email] });
if (!before.rows[0]) {
  console.error(`No user found with email: ${email}`);
  process.exit(1);
}
console.log(`Current NAVOS: ${before.rows[0].credits}`);

const res = await db.execute({
  sql: "UPDATE users SET credits = credits + ?, updated_at = datetime('now') WHERE email = ? RETURNING credits",
  args: [amount, email],
});
console.log(`✅ Recharged +${amount}. New NAVOS: ${res.rows[0].credits}`);
