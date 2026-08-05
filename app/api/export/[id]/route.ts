import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildProjectZip } from "@/services/export/zip-exporter";
import { StoryOutputSchema } from "@/lib/validators/story.schema";
import { rateLimit, getClientIp } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Auth gate: building a ZIP burns CPU/memory — never let anonymous callers do it.
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rl = rateLimit(`export:${getClientIp(req)}`, { limit: 30, windowSecs: 3600 });
    if (!rl.allowed) return NextResponse.json({ error: "Demasiadas exportaciones. Espera un momento." }, { status: 429 });

    const { id: projectId } = await params;
    const body: unknown = await req.json();

    // Validate the story data
    const parsed = StoryOutputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid story data", issues: parsed.error.issues },
        { status: 422 }
      );
    }

    const zipBuffer = await buildProjectZip(parsed.data, projectId);
    const filename = `vynavo_${Date.now()}.zip`;

    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(zipBuffer.length),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Export failed";
    console.error("[API /export]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
