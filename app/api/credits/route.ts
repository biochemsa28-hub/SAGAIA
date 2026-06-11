import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserById } from "@/lib/db/repository";
import { initDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await initDb();
    const user = await getUserById(session.user.id);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    return NextResponse.json({ credits: user.credits, plan: user.plan });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[API /credits]", message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
