import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getProjectDetail, updateProjectStatus, enqueueJob, getJobForProject } from "@/lib/db/repository";
import { initDb } from "@/lib/db";
import { startWorker } from "@/services/jobs/worker";
import { WORKER_ENABLED } from "@/lib/config";
import { internalSecret } from "@/lib/internal-auth";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 30;

const BodySchema = z.object({ project_id: z.string().uuid() });

// POST /api/produce — enqueue background production and return immediately.
//
// This used to run the whole pipeline as a floating promise inside this request.
// It worked until the process restarted, at which point a paid-for video simply
// stopped existing, with nothing on disk to say it ever had. Now the work becomes
// a `jobs` row and the worker owns it: the user can close the tab, the server can
// restart, and the job is still there to be re-claimed.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "project_id requerido" }, { status: 400 });
    const projectId = parsed.data.project_id;

    await initDb();
    const detail = await getProjectDetail(projectId, session.user.id);
    if (!detail) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    if (!detail.scenes?.length) return NextResponse.json({ error: "El proyecto no tiene historia" }, { status: 422 });

    // Fail loudly rather than accepting work nothing can pick up: without the
    // secret the worker can't authenticate against /api/voice et al, so the job
    // would sit queued forever while the UI showed "producing".
    if (!internalSecret()) {
      return NextResponse.json(
        { error: "Producción en background no configurada (falta INTERNAL_JOB_SECRET)" },
        { status: 503 },
      );
    }

    // Arrancarlo acá es un cinturón por si instrumentation no corrió. Con
    // ROLE=web es justo lo contrario de lo que queremos: la petición de un
    // usuario convertiría al servidor de páginas en un productor de videos.
    if (WORKER_ENABLED) startWorker();
    const { job, created } = await enqueueJob({ projectId, userId: session.user.id });
    if (created) await updateProjectStatus(projectId, "producing");

    return NextResponse.json({
      success: true,
      status: created ? "queued" : "already_running",
      job_id: job.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[API /produce]", message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// GET /api/produce?project_id=… — what the UI polls now. Cheap: one indexed row,
// no pipeline work, and it keeps telling the truth after a page reload because the
// state lives in the database rather than in the tab that started it.
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const projectId = req.nextUrl.searchParams.get("project_id");
    if (!projectId) return NextResponse.json({ error: "project_id requerido" }, { status: 400 });

    await initDb();
    const job = await getJobForProject(projectId, session.user.id);
    if (!job) return NextResponse.json({ success: true, job: null });

    return NextResponse.json({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        stage: job.stage,
        attempts: job.attempts,
        max_attempts: job.max_attempts,
        error: job.error_message,
        created_at: job.created_at,
        completed_at: job.completed_at,
      },
    });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
