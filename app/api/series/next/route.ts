import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getEpisodeContext } from "@/lib/db/repository";
import { initDb } from "@/lib/db";
import { z } from "zod";

export const runtime = "nodejs";

const BodySchema = z.object({ project_id: z.string().uuid() });

// POST /api/series/next — returns everything the "Crear Parte 2" flow needs to
// generate the NEXT episode of a story: the same cast, where the cliffhanger left
// off, and the series/episode wiring. The client passes this straight into
// /api/generate/story, so continuity costs no extra AI call here.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "project_id requerido" }, { status: 400 });

    await initDb();
    const ctx = await getEpisodeContext(parsed.data.project_id, session.user.id);
    if (!ctx) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

    const { project, cast, lastLines, cta, nextEpisode } = ctx;
    const seriesId = project.series_id ?? project.id;

    // Build the same "[MARKER]: ..." instruction block the story prompt already
    // knows how to read (cast + previous episode + episode number).
    const castLine = cast.length
      ? `[ELENCO DISEÑADO]: ${cast.map((c) => `${c.name} (${c.role ?? "personaje"}, ${c.voice_profile ?? "narrator"})`).join(" | ")}`
      : "";
    const prevBlock = lastLines.length
      ? `[EPISODIO ANTERIOR]:\n${lastLines.join("\n")}${cta ? `\n(cierre: ${cta})` : ""}`
      : "";
    const additional = [`[EPISODIO NUMERO]: ${nextEpisode}`, castLine, prevBlock].filter(Boolean).join("\n");

    // Keep the series title stable: "Base — Parte N".
    const baseTitle = (project.title || "Serie").replace(/\s*—\s*Parte\s*\d+\s*$/i, "");

    return NextResponse.json({
      success: true,
      next_episode: nextEpisode,
      series_id: seriesId,
      parent_project_id: project.id,
      cast: cast.map((c) => ({
        name: c.name,
        role: c.role ?? undefined,
        voice_profile: c.voice_profile ?? undefined,
        reference_image_url: c.reference_image_url ?? undefined,
        // Carry the bible forward so a 10-episode series pays for it once, not ten times.
        bible_url: c.bible_url ?? undefined,
      })),
      // Ready-to-send payload for /api/generate/story
      payload: {
        title: `${baseTitle} — Parte ${nextEpisode}`,
        niche: project.niche,
        sub_niche: project.sub_niche ?? undefined,
        topic: project.topic,
        tone: project.tone,
        duration_target: project.duration_target,
        language: project.language,
        visual_style: project.visual_style,
        animation_tier: project.animation_tier ?? undefined,
        additional_instructions: additional,
        series_id: seriesId,
        episode_number: nextEpisode,
        parent_project_id: project.id,
      },
    });
  } catch (err) {
    console.error("[API /series/next]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
