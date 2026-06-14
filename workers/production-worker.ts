/**
 * VYNAVO Production Worker
 * Ejecuta en un proceso Node.js separado (no serverless)
 * Procesa jobs de producción de video sin límite de tiempo
 *
 * Para correr: npx tsx workers/production-worker.ts
 * En producción: pm2 start workers/production-worker.ts --interpreter tsx
 */

// NOTE: Requiere Redis corriendo + instalar:
// npm install bullmq ioredis

// import { Worker } from "bullmq";
// import { getDb } from "@/lib/db";
// import { updateProjectStatus } from "@/lib/db/repository";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

console.log(`
╔══════════════════════════════════════╗
║  VYNAVO Production Worker v1.0       ║
║  Redis: ${REDIS_URL.slice(0, 30).padEnd(30)} ║
╚══════════════════════════════════════╝
`);

// ── Cuando tengas Redis, descomenta esto: ──────────────────────────────────
/*
const worker = new Worker(
  "vynavo-production",
  async (job) => {
    const { project_id, user_id, steps } = job.data;
    console.log(`[Worker] Procesando proyecto ${project_id}`);

    // Paso 1: Voz
    if (steps.includes("voice")) {
      await job.updateProgress(10);
      const res = await fetch(`${process.env.NEXTAUTH_URL}/api/voice`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-worker-secret": process.env.WORKER_SECRET! },
        body: JSON.stringify({ project_id }),
      });
      if (!res.ok) throw new Error("Voice generation failed");
      await job.updateProgress(25);
    }

    // Paso 2: Imágenes
    if (steps.includes("images")) {
      const res = await fetch(`${process.env.NEXTAUTH_URL}/api/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-worker-secret": process.env.WORKER_SECRET! },
        body: JSON.stringify({ project_id }),
      });
      if (!res.ok) throw new Error("Image generation failed");
      await job.updateProgress(50);
    }

    // Paso 3: Clips (con polling)
    if (steps.includes("clips")) {
      const submitRes = await fetch(`${process.env.NEXTAUTH_URL}/api/videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-worker-secret": process.env.WORKER_SECRET! },
        body: JSON.stringify({ project_id, action: "submit" }),
      });
      const { jobs: clipJobs } = await submitRes.json();

      // Polling hasta que terminen los clips
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const collectRes = await fetch(`${process.env.NEXTAUTH_URL}/api/videos`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-worker-secret": process.env.WORKER_SECRET! },
          body: JSON.stringify({ project_id, action: "collect", jobs: clipJobs }),
        });
        const { all_done } = await collectRes.json();
        await job.updateProgress(50 + Math.round(i * 0.4));
        if (all_done) break;
      }
      await job.updateProgress(80);
    }

    // Paso 4: Video final
    if (steps.includes("final")) {
      const submitRes = await fetch(`${process.env.NEXTAUTH_URL}/api/assemble`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-worker-secret": process.env.WORKER_SECRET! },
        body: JSON.stringify({ project_id, action: "submit", add_subtitles: true }),
      });
      const { render_id } = await submitRes.json();

      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const checkRes = await fetch(`${process.env.NEXTAUTH_URL}/api/assemble`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-worker-secret": process.env.WORKER_SECRET! },
          body: JSON.stringify({ project_id, action: "check", render_id }),
        });
        const { status, url } = await checkRes.json();
        if (status === "done" && url) break;
        if (status === "failed") throw new Error("Final render failed");
      }
      await job.updateProgress(100);
    }

    console.log(`[Worker] ✅ Proyecto ${project_id} completado`);
    return { project_id, status: "completed" };
  },
  {
    connection: { url: REDIS_URL },
    concurrency: 3,  // Procesa 3 videos simultáneamente
  }
);

worker.on("completed", (job) => {
  console.log(`[Worker] Job ${job.id} completado`);
});

worker.on("failed", (job, err) => {
  console.error(`[Worker] Job ${job?.id} falló:`, err.message);
});

console.log("Worker escuchando jobs en cola 'vynavo-production'...");
*/

// ── Versión simple sin Redis (polling manual) ──────────────────────────────
console.log("Worker modo stub — implementa Redis/BullMQ para producción completa");
console.log("Consulta: https://docs.bullmq.io/guide/workers");
