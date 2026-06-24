import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { deleteCharacter, getCharacter } from "@/lib/db/repository";
import { initDb } from "@/lib/db";

export const runtime = "nodejs";

// GET /api/characters/:id — one saved character
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    await initDb();
    const character = await getCharacter(id, session.user.id);
    if (!character) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ success: true, character });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[API /characters/:id GET]", message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// DELETE /api/characters/:id — remove a saved character
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    await initDb();
    const ok = await deleteCharacter(id, session.user.id);
    if (!ok) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[API /characters/:id DELETE]", message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
