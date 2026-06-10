import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getProjectDetail, updateProjectStatus } from "@/lib/db/repository";
import { generateProjectImages } from "@/services/fal/image-generator";
import { initDb } from "@/lib/db";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 120;

const BodySchema = z.object({
  project_id: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body: unknown = await req.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "project_id requerido" }, { status: 400 });

    await initDb();
    const detail = await getProjectDetail(parsed.data.project_id, session.user.id);
    if (!detail) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    if (!detail.scenes?.length) return NextResponse.json({ error: "El proyecto no tiene escenas" }, { status: 422 });

    const results = await generateProjectImages({
      projectId: parsed.data.project_id,
      scenes: detail.scenes.map((s) => ({
        scene_number: s.scene_number,
        image_prompt: s.image_prompt ?? "",
      })),
    });

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    // Update project status
    await updateProjectStatus(
      parsed.data.project_id,
      failed === 0 ? "images_done" : "images_partial"
    );

    return NextResponse.json({
      success: true,
      total: results.length,
      succeeded,
      failed,
      mock: results[0]?.mock ?? false,
      scenes: results.map((r) => ({
        scene_number: r.sceneNumber,
        success: r.success,
        url: r.url,
        error: r.error,
        duration_ms: r.durationMs,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[API /images]", message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function GET() {
  const hasKey = Boolean(process.env.FAL_API_KEY);
  const isMock = process.env.FORCE_MOCK_IMAGE === "true" || !hasKey;
  return NextResponse.json({ status: "ok", mock_mode: isMock, has_key: hasKey });
}
