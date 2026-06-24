import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getProjectDetail, getUserById, deleteProject } from "@/lib/db/repository";
import { initDb } from "@/lib/db";
import { resolveProjectTier } from "@/lib/config";

export const runtime = "nodejs";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    await initDb();
    const ok = await deleteProject(id, session.user.id);
    if (!ok) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[API DELETE /projects/:id]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    await initDb();

    const detail = await getProjectDetail(id, session.user.id);
    if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Expose the effective animation tier (project choice clamped to plan) so the
    // producer knows whether to run Ken Burns, Seedance, or lip-sync.
    const user = await getUserById(session.user.id).catch(() => null);
    const tier = resolveProjectTier(detail.project.animation_tier, user?.plan ?? "free");
    return NextResponse.json({ ...detail, animation_tier: tier });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[API /projects/:id]", message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
