import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getProjectsByUser, getUserStats } from "@/lib/db/repository";
import { initDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = session.user.id;
    await initDb();

    const [projects, stats] = await Promise.all([
      getProjectsByUser(userId),
      getUserStats(userId),
    ]);

    return NextResponse.json({ projects, stats });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[API /projects]", message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
