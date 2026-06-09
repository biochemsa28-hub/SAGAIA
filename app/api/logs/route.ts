import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getApiLogs } from "@/lib/db/repository";
import { initDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await initDb();
    const logs = await getApiLogs(session.user.id, 100);
    return NextResponse.json({ logs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[API /logs]", message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
