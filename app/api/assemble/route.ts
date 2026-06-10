import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getProjectDetail, updateProjectStatus, upsertAsset } from "@/lib/db/repository";
import { submitAssembly, checkAssembly } from "@/services/creatomate/assembler";
import { initDb } from "@/lib/db";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const Schema = z.object({
  project_id: z.string().uuid(),
  action: z.enum(["submit", "check"]).default("submit"),
  render_id: z.string().optional(),
  add_subtitles: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body: unknown = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

    await initDb();

    // ── CHECK status of existing render ──────────────────────────────────────
    if (parsed.data.action === "check" && parsed.data.render_id) {
      const status = await checkAssembly(parsed.data.render_id);

      if (status.status === "succeeded" && status.url) {
        await upsertAsset({
          projectId: parsed.data.project_id,
          assetType: "final_video",
          publicUrl: status.url,
          mimeType: "video/mp4",
        });
        await updateProjectStatus(parsed.data.project_id, "ready");
      }

      return NextResponse.json({ success: true, ...status });
    }

    // ── SUBMIT new assembly ───────────────────────────────────────────────────
    const detail = await getProjectDetail(parsed.data.project_id, session.user.id);
    if (!detail) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

    const videoAssets = detail.assets?.filter((a) => a.asset_type === "video") ?? [];
    if (!videoAssets.length) {
      return NextResponse.json({ error: "Genera los videos animados primero" }, { status: 422 });
    }

    const audioAssets = detail.assets?.filter((a) => a.asset_type === "audio") ?? [];

    // Build scene list
    const scenes = detail.scenes.map((scene, idx) => {
      const video = videoAssets[idx] ?? videoAssets[0];
      const audio = audioAssets[idx];
      return {
        sceneNumber: scene.scene_number,
        videoUrl: video?.public_url ?? "",
        audioUrl: audio?.public_url ?? undefined,
        narrationText: scene.narration_text,
        durationSeconds: scene.duration_seconds || 5,
      };
    });

    const result = await submitAssembly({
      scenes,
      title: detail.project.title,
      addSubtitles: parsed.data.add_subtitles,
    });

    return NextResponse.json({
      success: true,
      render_id: result.renderId,
      output_url: result.outputUrl,
      status: result.status,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[API /assemble]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  const hasKey = Boolean(process.env.CREATOMATE_API_KEY);
  return NextResponse.json({ status: "ok", has_key: hasKey });
}
