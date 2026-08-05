// Next runs this once per server process, before handling any request.
// It is where the job worker belongs: starting it from an API route means a
// server that restarts overnight recovers nothing until somebody happens to hit
// /api/produce. Started here, orphaned jobs are re-queued the moment the process
// comes back up.
export async function register() {
  // Only the Node runtime — the edge runtime has no filesystem, no ffmpeg, and
  // this module would fail to load there.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startWorker } = await import("@/services/jobs/worker");
  startWorker();
}
