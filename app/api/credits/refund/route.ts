import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getProjectDetail, refundCreditForProject } from "@/lib/db/repository";
import { initDb } from "@/lib/db";
import { z } from "zod";

export const runtime = "nodejs";

const BodySchema = z.object({ project_id: z.string().uuid() });

// POST /api/credits/refund — give back the credit when a production fails.
// Server-side guards make this safe to call from the client: it only refunds
// once per project AND only when there's genuinely no final video.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body: unknown = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "project_id requerido" }, { status: 400 });

    await initDb();

    // Ownership check
    const detail = await getProjectDetail(parsed.data.project_id, session.user.id);
    if (!detail) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

    const result = await refundCreditForProject(session.user.id, parsed.data.project_id);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[API /credits/refund]", message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
