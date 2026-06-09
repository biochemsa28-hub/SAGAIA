import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getProjectDetail } from "@/lib/db/repository";
import { initDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    await initDb();

    const detail = await getProjectDetail(id, session.user.id);
    if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json(detail);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[API /projects/:id]", message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
