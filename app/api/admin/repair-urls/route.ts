import { NextRequest, NextResponse } from "next/server";
import { getDb, initDb } from "@/lib/db";
import { internalSecret } from "@/lib/internal-auth";

export const runtime = "nodejs";

// POST /api/admin/repair-urls — rewrite asset URLs that were saved while
// R2_PUBLIC_URL held the wrong value.
//
// The uploads themselves succeeded: the objects are in the bucket under the right
// keys. Only the public prefix recorded next to them is wrong, because it was read
// from a misconfigured variable at write time. Correcting the variable does not
// revert rows already written, so a whole project's images point at an
// unparseable address and the render fails with "No scene clips could be built".
//
// Everything after the last "/images/" (or /clips/, /finals/…) is the real object
// key, so the fix is a prefix swap — no regeneration, no new spend.
export async function POST(req: NextRequest) {
  try {
    const secret = internalSecret();
    if (!secret || req.headers.get("x-vynavo-internal") !== secret) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const base = (process.env.R2_PUBLIC_URL ?? "").replace(/\/+$/, "");
    if (!base.startsWith("http")) {
      return NextResponse.json({ error: "R2_PUBLIC_URL sigue mal configurada" }, { status: 400 });
    }

    await initDb();
    const db = getDb();
    const rows = (await db.execute(
      "SELECT id, public_url FROM assets WHERE public_url IS NOT NULL AND public_url NOT LIKE 'http%'",
    )).rows as unknown as Array<{ id: string; public_url: string }>;

    let arreglados = 0;
    const ejemplos: string[] = [];
    for (const r of rows) {
      // Keep the folder + filename, discard whatever was prepended to it.
      const m = /\/((?:images|clips|finals|bibles|frames|uploads|tests)\/[^/]+)$/.exec(r.public_url);
      if (!m) continue;
      const url = `${base}/${m[1]}`;
      await db.execute({ sql: "UPDATE assets SET public_url = ? WHERE id = ?", args: [url, r.id] });
      arreglados++;
      if (ejemplos.length < 3) ejemplos.push(url);
    }

    return NextResponse.json({
      success: true,
      encontrados: rows.length,
      arreglados,
      ejemplos,
    });
  } catch (err) {
    console.error("[repair-urls]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
