import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

// ── VIRAL GENOME v0 ──────────────────────────────────────────────────────────
// GET  /api/genoma            → los registros del usuario (ADN + métricas)
// POST /api/genoma            → anotar métricas reales tras publicar
//
// Las métricas se anotan A MANO (vistas, ret. 3s, completion…) copiándolas de
// la analítica de TikTok/IG/YT. Con ~30 registros arranca la correlación real:
// qué arquetipos, mecánicas y hooks retienen. Fase 1 del dataset-moat.

const MetricsSchema = z.object({
  project_id: z.string().min(6),
  plataforma: z.string().max(30).optional(),
  url_publicada: z.string().max(300).optional(),
  vistas: z.number().int().nonnegative().optional(),
  ret_3s: z.number().min(0).max(100).optional(),
  completion: z.number().min(0).max(100).optional(),
  rewatch: z.number().min(0).max(50).optional(),
  likes: z.number().int().nonnegative().optional(),
  comentarios: z.number().int().nonnegative().optional(),
  compartidos: z.number().int().nonnegative().optional(),
  guardados: z.number().int().nonnegative().optional(),
  seguidores: z.number().int().nonnegative().optional(),
  notas: z.string().max(500).optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const db = getDb();
  const r = await db.execute({
    sql: `SELECT g.*, p.title FROM video_genome g LEFT JOIN projects p ON p.id = g.project_id
          WHERE g.user_id = ? ORDER BY g.actualizado DESC LIMIT 200`,
    args: [session.user.id],
  });
  return NextResponse.json({ genoma: r.rows });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const parsed = MetricsSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Métricas inválidas" }, { status: 400 });
  const m = parsed.data;
  const db = getDb();
  const campos: string[] = []; const args: (string | number)[] = [];
  for (const k of ["plataforma", "url_publicada", "vistas", "ret_3s", "completion", "rewatch", "likes", "comentarios", "compartidos", "guardados", "seguidores", "notas"] as const) {
    const v = m[k];
    if (v !== undefined) { campos.push(`${k} = ?`); args.push(v as string | number); }
  }
  if (!campos.length) return NextResponse.json({ error: "Nada que anotar" }, { status: 400 });
  campos.push("publicado_en = COALESCE(publicado_en, datetime('now'))", "actualizado = datetime('now')");
  args.push(m.project_id, session.user.id);
  const r = await db.execute({
    sql: `UPDATE video_genome SET ${campos.join(", ")} WHERE project_id = ? AND user_id = ?`,
    args,
  });
  if (Number(r.rowsAffected ?? 0) === 0) return NextResponse.json({ error: "Proyecto sin genoma (¿es tuyo?)" }, { status: 404 });
  return NextResponse.json({ success: true });
}
