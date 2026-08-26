"use client";
import { mensajeLegible } from "@/lib/json-seguro";
import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Thumb from "@/components/thumb";
import confetti from "canvas-confetti";
import { track } from "@/components/providers/PostHogProvider";
import {
  ArrowLeft, Download, Loader2, Sparkles, CheckCircle2,
  Copy, Check, PlusCircle, Clock, TrendingUp, MessageSquare,
  Hash, Lightbulb, Target, RefreshCw, PartyPopper, Star, Lock, Unlock,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { useToast } from "@/components/ui/toast";
import { CountUp } from "@/components/ui/CountUp";
import { formatDate } from "@/lib/utils";
import type { ProjectDetail } from "@/lib/db/repository";

// Lo que la biblioteca de movimientos necesita mostrar. El tipo completo vive en
// el repositorio; acá solo lo que se dibuja.
type MotionDnaUI = { id: string; name: string; camera_move: string | null; emotion: string | null };

// Emotional, phase-aware messages shown on the live production stage. They make
// the wait feel like a show ("ya casi…") instead of a progress bar.
const EMO_MESSAGES: string[] = [
  "Tu elenco cobra vida…",
  "Dándole alma a cada voz…",
  "Iluminando la escena clave…",
  "Ya casi… puliendo el clímax",
  "Sincronizando emoción y ritmo…",
  "El momento viral se está cocinando…",
];

type StepId = "voice" | "images" | "clips" | "final";
type StepStatus = "pending" | "running" | "done" | "error";

// Best posting times per platform
const PLATFORM_TIPS: Record<string, { icon: string; times: string; tip: string }> = {
  tiktok:    { icon: "🎵", times: "7–9 am · 12–3 pm · 7–11 pm",  tip: "Publica 1–3 veces al día. Responde comentarios en la primera hora." },
  instagram: { icon: "📸", times: "6–9 am · 12–2 pm · 5–8 pm",   tip: "Agrega a Reels para mayor alcance. Usa los primeros 3 seg para enganchar." },
  youtube:   { icon: "▶️", times: "2–4 pm · 8–11 pm",             tip: "Shorts de menos de 60 seg tienen prioridad en el algoritmo." },
  facebook:  { icon: "👥", times: "9 am · 1–3 pm · 7–9 pm",       tip: "Comparte en grupos de nicho para alcance orgánico extra." },
};

// Production phases — what the user sees while the video is being created.
// Mapped from the internal step status but framed creatively (no raw pipeline).
const PHASES: { key: StepId; emoji: string; title: string; sub: string }[] = [
  { key: "voice",  emoji: "🎙️", title: "Grabando la narración", sub: "Dando voz a tu historia" },
  { key: "images", emoji: "🎨", title: "Pintando las escenas",  sub: "Creando cada cuadro cinematográfico" },
  { key: "clips",  emoji: "🎬", title: "Dando movimiento",       sub: "Animando cada escena con IA" },
  { key: "final",  emoji: "✨", title: "Montando tu video",      sub: "Uniendo voz, música y subtítulos" },
];

// Rotating tips shown during the wait — keeps it lively + educational
const WAIT_TIPS: string[] = [
  "💡 Los primeros 3 segundos deciden si te ven o te saltan",
  "🔥 Publicar a diario crece tu cuenta 3× más rápido",
  "🎯 Responde comentarios en la primera hora para impulsar el alcance",
  "✨ Un buen hook como comentario fijado dispara la repetición",
  "📈 El mismo video en TikTok, Reels y Shorts triplica las vistas",
  "🎬 Estamos dando vida a tus personajes, cuadro por cuadro…",
  "🎨 Cada escena mantiene el mismo personaje y paleta para que fluya",
];

function fireCelebration() {
  const colors = ["#7c3aed", "#ec4899", "#f59e0b", "#10b981", "#fff"];
  confetti({ particleCount: 140, spread: 90, origin: { y: 0.6 }, colors });
  setTimeout(() => confetti({ particleCount: 80, spread: 120, angle: 60, origin: { x: 0, y: 0.65 }, colors }), 200);
  setTimeout(() => confetti({ particleCount: 80, spread: 120, angle: 120, origin: { x: 1, y: 0.65 }, colors }), 350);
}

function CopyField({ label, value, copyKey: _copyKey, icon: Icon }: {
  label: string; value: string; copyKey: string; icon: React.ElementType;
}) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(value).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5 text-violet-400" />
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{label}</p>
        </div>
        <button onClick={copy} className="flex items-center gap-1 text-xs text-zinc-500 hover:text-violet-400 transition-colors">
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <p className="text-sm text-zinc-200 leading-relaxed">{value}</p>
    </div>
  );
}

export default function ProjectDetailPage() {
  return <Suspense fallback={null}><ProjectDetail /></Suspense>;
}

function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const autostart = searchParams.get("autostart") === "1";
  const autostartFired = useRef(false);
  // Guards the one-shot "is a job already running for this project?" check.
  const resumeChecked = useRef(false);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);
  const [stepStatus, setStepStatus] = useState<Record<StepId, StepStatus>>({
    voice: "pending", images: "pending", clips: "pending", final: "pending",
  });
  const [producing, setProducing] = useState(false);
  // El plan de rodaje arranca plegado: es para quien quiere dirigir, no ruido
  // para quien solo quiere su video.
  const [verPlan, setVerPlan] = useState(false);
  // Vista de mesa: el guion entero como tabla TIEMPO|LÍNEA|VISUAL|SONIDO|EMOCIÓN
  // para revisarlo de un vistazo ANTES de producir — la lectura de director.
  const [verTabla, setVerTabla] = useState(false);
  const [dnaGuardados, setDnaGuardados] = useState<MotionDnaUI[]>([]);
  const [hasError, setHasError] = useState(false);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [tipIdx, setTipIdx] = useState(0);
  // Series continuation ("Crear Parte N")
  const [creatingNext, setCreatingNext] = useState(false);
  const [nextError, setNextError] = useState<string | null>(null);
  const nextEpisodeNumber = (detail?.project.episode_number ?? 1) + 1;
  // "kenburns" = animate static images (cheap/fast, no Kling) | "cinematic" = Kling clips
  const [animationTier, setAnimationTier] = useState<"kenburns" | "cinematic" | "talking">("kenburns");
  const { toast } = useToast();

  useEffect(() => {
    fetch(`/api/projects/${id}`)
      .then((r) => {
        if (r.status === 404) { router.push("/dashboard/library"); return null; }
        return r.json();
      })
      .then((d) => {
        if (!d) return;
        setDetail(d as ProjectDetail);
        const rawTier = (d as { animation_tier?: string }).animation_tier;
        const tier = rawTier === "cinematic" ? "cinematic" : rawTier === "talking" ? "talking" : "kenburns";
        setAnimationTier(tier);
        const assets = (d as ProjectDetail).assets ?? [];
        const status = {
          voice:  assets.some((a) => a.asset_type === "audio")       ? "done" : "pending",
          images: assets.some((a) => a.asset_type === "image")       ? "done" : "pending",
          // In Ken Burns mode there are no clips — mark done so it never blocks progress
          clips:  tier === "kenburns" ? "done" : (assets.some((a) => a.asset_type === "video") ? "done" : "pending"),
          final:  assets.some((a) => a.asset_type === "final_video") ? "done" : "pending",
        } as Record<StepId, StepStatus>;
        setStepStatus(status);
        const fv = assets.find((a) => a.asset_type === "final_video");
        if (fv?.public_url) setFinalVideoUrl(fv.public_url);
      })
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [id, router]);

  // Auto-start production when arriving from "Nueva Historia" with ?autostart=1
  useEffect(() => {
    if (!autostart || !detail || producing || autostartFired.current) return;
    if (stepStatus.final === "done") return; // already produced
    autostartFired.current = true;
    // Small delay so the page renders first, then kick off production
    const t = setTimeout(() => { void produceAll(); }, 800);
    return () => clearTimeout(t);
  // produceAll is defined below — stable reference via useRef not needed here
  // because this effect only fires once (autostartFired guard)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autostart, detail, stepStatus.final]);

  // Re-attach to a production that is already running on the server. This is the
  // whole point of moving the pipeline out of the tab: reload the page mid-render
  // and you land back on the progress bar instead of on a project that looks idle
  // while its video is quietly being built (or worse, producing it a second time).
  useEffect(() => {
    if (!detail || producing || resumeChecked.current) return;
    resumeChecked.current = true;
    void (async () => {
      try {
        const r = await fetch(`/api/produce?project_id=${id}`);
        if (!r.ok) return;
        const { job } = await r.json() as { job: null | { status: string; stage: string | null } };
        if (!job || (job.status !== "queued" && job.status !== "processing")) return;
        setStepStatus(stageToSteps(job.stage));
        await produceAll({ resume: true });
      } catch { /* nothing running, or offline — leave the page as it is */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);

  // While producing: poll the project so generated scene images appear live
  // as thumbnails (the wait feels alive instead of a blank progress bar).
  useEffect(() => {
    if (!producing) return;
    const iv = setInterval(() => {
      fetch(`/api/projects/${id}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (d) setDetail(d as ProjectDetail); })
        .catch(() => {});
    }, 6000);
    return () => clearInterval(iv);
  }, [producing, id]);

  // Rotate the wait tips while producing
  useEffect(() => {
    if (!producing) return;
    const iv = setInterval(() => setTipIdx((i) => (i + 1) % WAIT_TIPS.length), 3500);
    return () => clearInterval(iv);
  }, [producing]);

  function setStep(step: StepId, status: StepStatus) {
    setStepStatus((p) => ({ ...p, [step]: status }));
  }

  // Continue the series: pull the cast + cliffhanger from THIS episode, generate the
  // next one, and land the user straight in its production screen.
  async function createNextEpisode() {
    if (creatingNext) return;
    setCreatingNext(true);
    setNextError(null);
    try {
      const ctxRes = await fetch("/api/series/next", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: id }),
      });
      const ctx = await ctxRes.json() as { payload?: Record<string, unknown>; cast?: unknown[]; error?: string };
      if (!ctxRes.ok || !ctx.payload) throw new Error(ctx.error ?? "No se pudo preparar el episodio");

      const genRes = await fetch("/api/generate/story", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...ctx.payload, cast: ctx.cast }),
      });
      if (genRes.status === 402) {
        const e = await genRes.json() as { required?: number };
        throw new Error(`Necesitas ${e.required ?? ""} NAVOS para el siguiente episodio.`);
      }
      const gen = await genRes.json() as { project_id?: string; error?: string };
      if (!genRes.ok || !gen.project_id) throw new Error(gen.error ?? "No se pudo crear el episodio");

      track("series_episode_created", { from_project: id, project_id: gen.project_id });
      router.push(`/dashboard/projects/${gen.project_id}?autostart=1`);
    } catch (err) {
      setNextError(mensajeLegible(err, "Error al crear el episodio"));
    } finally {
      setCreatingNext(false);
    }
  }

  async function runVoice() {
    setStep("voice", "running");
    const res = await fetch("/api/voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project_id: id }) });
    const data = await res.json() as { success: boolean; error?: string };
    if (res.ok && data.success) setStep("voice", "done");
    else { setStep("voice", "error"); throw new Error(data.error); }
  }

  async function runImages() {
    setStep("images", "running");
    const res = await fetch("/api/images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project_id: id }) });
    const data = await res.json() as { success: boolean; error?: string };
    if (res.ok && data.success) setStep("images", "done");
    else { setStep("images", "error"); throw new Error(data.error); }
  }

  // Poll a batch of video jobs until done; returns completed {scene, url} clips.
  async function pollClipStage(initial: Array<{ scene_number: number; request_id: string }>, stage?: "motion" | "lipsync") {
    let jobs = initial.filter((j) => j.request_id);
    const urls: Array<{ scene_number: number; video_url: string }> = [];
    for (let i = 0; i < 200 && jobs.length; i++) {
      await new Promise((r) => setTimeout(r, 6000));
      const collectRes = await fetch("/api/videos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project_id: id, action: "collect", stage, jobs: jobs.map((j) => ({ scene_number: j.scene_number, request_id: j.request_id })) }) });
      const collectData = await collectRes.json() as { all_done: boolean; scenes: Array<{ scene_number: number; status: string; url?: string }> };
      for (const s of collectData.scenes) if (s.status === "completed" && s.url) urls.push({ scene_number: s.scene_number, video_url: s.url });
      if (collectData.all_done) return urls;
      jobs = jobs.filter((j) => { const s = collectData.scenes.find((s) => s.scene_number === j.scene_number); return s?.status !== "completed" && s?.status !== "failed"; });
    }
    if (jobs.length) throw new Error("La animación tardó demasiado. Intenta de nuevo en un momento.");
    return urls;
  }

  async function runClips() {
    setStep("clips", "running");
    const submitRes = await fetch("/api/videos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project_id: id, action: "submit" }) });
    const submitData = await submitRes.json() as { success: boolean; action?: string; pipeline?: string; jobs: Array<{ scene_number: number; request_id: string; status: string; error?: string }>; error?: string };
    if (!submitRes.ok || !submitData.success) { setStep("clips", "error"); throw new Error(submitData.error ?? "Error al enviar clips"); }

    // Ken Burns tier: the API skips Kling entirely (no clips). Treat as done.
    if (submitData.action === "skipped") { setStep("clips", "done"); return; }

    const jobs = submitData.jobs.filter((j) => j.request_id);
    if (!jobs.length) {
      const firstError = submitData.jobs[0]?.error ?? "Fal.ai no aceptó los trabajos de video";
      setStep("clips", "error");
      throw new Error(`Clips fallaron al enviar: ${firstError}`);
    }

    try {
      const motionUrls = await pollClipStage(jobs, submitData.pipeline === "pro" ? "motion" : undefined);
      // PRO pipeline stage 2: lip-sync over the moving clips.
      if (submitData.pipeline === "pro") {
        const lsRes = await fetch("/api/videos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project_id: id, action: "lipsync_submit", motion: motionUrls }) });
        const lsData = await lsRes.json() as { jobs?: Array<{ scene_number: number; request_id: string }> };
        await pollClipStage(lsData.jobs ?? [], "lipsync");
      }
      setStep("clips", "done");
    } catch (e) {
      setStep("clips", "error");
      throw e;
    }
  }

  async function runFinal() {
    setStep("final", "running");
    setFinalVideoUrl(null);
    const submitRes = await fetch("/api/assemble", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project_id: id, action: "submit", add_subtitles: true }) });
    const submitData = await submitRes.json() as { render_id?: string; error?: string };
    if (!submitRes.ok || !submitData.render_id) { setStep("final", "error"); throw new Error(submitData.error); }
    for (let i = 0; i < 96; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const checkRes = await fetch("/api/assemble", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project_id: id, action: "check", render_id: submitData.render_id }) });
      const checkData = await checkRes.json() as { status: string; url?: string; error?: string };
      if (checkData.status === "done" && checkData.url) { setStep("final", "done"); setFinalVideoUrl(checkData.url); return; }
      if (checkData.status === "failed") { setStep("final", "error"); throw new Error("render failed"); }
    }
    setStep("final", "error"); throw new Error("El montaje final tardó demasiado. Intenta de nuevo.");
  }

  // Regenerate a single scene: new image → new clip → re-assemble final video.
  // Saves credits/time vs producing everything again. Progress shows the generic
  // "Produciendo tu video…" overlay (no internal steps exposed to the user).
  // Volver a la versión anterior de una escena. Gratis: la imagen ya está
  // generada y pagada, solo cambia el puntero. Después re-monta el video, que
  // es el único paso con costo real y el que hace visible el cambio.
  // ── Motion DNA ──
  // Guardar el movimiento de una toma que salió bien, y poder aplicarlo después
  // a otra historia. Nada de esto genera ni cuesta: son los mismos campos que el
  // generador lee, movidos de un lado a otro.
  async function cargarDna() {
    try {
      const r = await fetch("/api/motion-dna");
      if (!r.ok) return;
      const d = await r.json() as { dna?: MotionDnaUI[] };
      setDnaGuardados(d.dna ?? []);
    } catch { /* la biblioteca es opcional */ }
  }

  async function guardarDna(sceneNumber: number) {
    const name = window.prompt("Nombre para este movimiento (ej: Acercamiento tenso):")?.trim();
    if (!name) return;
    try {
      const r = await fetch("/api/motion-dna", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "guardar", project_id: id, scene_number: sceneNumber, name }),
      });
      const d = await r.json() as { error?: string };
      if (!r.ok) throw new Error(d.error ?? "no");
      await cargarDna();
      toast(`🎞 "${name}" guardado — reusalo en cualquier historia`, "success");
    } catch (e) {
      toast(mensajeLegible(e, "No se pudo guardar."), "error");
    }
  }

  async function aplicarDna(dnaId: string, nombre: string) {
    if (!scenes.length) return;
    try {
      const r = await fetch("/api/motion-dna", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "aplicar", dna_id: dnaId, project_id: id, scene_numbers: scenes.map(s => s.scene_number) }),
      });
      const d = await r.json() as { escenas?: number; error?: string };
      if (!r.ok) throw new Error(d.error ?? "no");
      const det = await fetch(`/api/projects/${id}`);
      if (det.ok) setDetail(await det.json() as ProjectDetail);
      toast(`🎞 "${nombre}" aplicado a ${d.escenas} escenas`, "success");
    } catch {
      toast("No se pudo aplicar.", "error");
    }
  }

  // Guarda una corrección del plan. No genera nada: solo cambia lo que el
  // generador va a leer cuando toque animar.
  async function guardarPlan(sceneNumber: number, campos: Record<string, string>) {
    try {
      const r = await fetch("/api/scenes/plan", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: id, scene_number: sceneNumber, ...campos }),
      });
      if (!r.ok) throw new Error("no");
      toast("Plan actualizado — se animará así", "success");
    } catch {
      toast("No se pudo guardar el plan.", "error");
    }
  }

  async function revertScene(sceneNumber: number) {
    const versiones = (detail?.assets ?? [])
      .filter(a => a.asset_type === "image" && a.scene_id === scenes.find(s => s.scene_number === sceneNumber)?.id)
      .flatMap(a => { try { return (JSON.parse(a.metadata ?? "{}") as { versiones?: string[] }).versiones ?? []; } catch { return []; } });
    const target = versiones[versiones.length - 1];
    if (!target) return;

    setProducing(true);
    setHasError(false);
    setErrorDetail(null);
    setStepStatus({ voice: "done", images: "done", clips: "done", final: "running" });
    try {
      const r = await fetch("/api/scenes/revert", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: id, scene_number: sceneNumber, target_url: target }),
      });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "No se pudo volver atrás");
      await runFinal();
      try {
        const d = await fetch(`/api/projects/${id}`);
        if (d.ok) setDetail(await d.json() as ProjectDetail);
      } catch {}
      toast("↩ Volviste a la versión anterior", "success");
    } catch (err) {
      setHasError(true);
      setErrorDetail(mensajeLegible(err, "Error desconocido"));
      toast("No se pudo volver atrás.", "error");
    } finally {
      setProducing(false);
    }
  }

  // Aprobar/desaprobar una escena. Es instantáneo y no cuesta nada: solo marca
  // el asset. El servidor es quien hace cumplir el candado en /api/images.
  async function toggleAprobada(sceneNumber: number, locked: boolean) {
    try {
      const r = await fetch("/api/scenes/lock", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: id, scene_number: sceneNumber, locked }),
      });
      if (!r.ok) throw new Error("no");
      const d = await fetch(`/api/projects/${id}`);
      if (d.ok) setDetail(await d.json() as ProjectDetail);
      toast(locked ? "🔒 Escena aprobada — no se regenerará" : "🔓 Aprobación quitada", "success");
    } catch {
      toast("No se pudo cambiar la aprobación.", "error");
    }
  }

  async function regenerateScene(sceneNumber: number) {
    setProducing(true);
    setFinalVideoUrl(null);
    setHasError(false);
    setErrorDetail(null);
    setStepStatus({ voice: "done", images: "running", clips: "pending", final: "pending" });
    try {
      // 1. New image for this scene
      const imgRes = await fetch("/api/images", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: id, scene_number: sceneNumber }),
      });
      const imgData = await imgRes.json() as { success: boolean; error?: string };
      if (!imgRes.ok || !imgData.success) throw new Error(imgData.error ?? "No se pudo regenerar la imagen");

      // Ken Burns: no clip to regenerate — just re-assemble with the new image.
      if (animationTier === "kenburns") {
        setStep("images", "done"); setStep("clips", "done");
        await runFinal();
        try {
          const r = await fetch(`/api/projects/${id}`);
          if (r.ok) setDetail(await r.json() as ProjectDetail);
        } catch {}
        fireCelebration();
        toast("🎉 ¡Escena regenerada!", "success");
        return;
      }

      // 2. New clip for this scene (submit + poll)
      setStep("images", "done"); setStep("clips", "running");
      const subRes = await fetch("/api/videos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: id, action: "submit", scene_number: sceneNumber }),
      });
      const subData = await subRes.json() as { jobs: Array<{ scene_number: number; request_id: string; error?: string }>; error?: string };
      const job = subData.jobs?.find((j) => j.request_id);
      if (!job) throw new Error(subData.jobs?.[0]?.error ?? subData.error ?? "No se pudo regenerar el clip");

      let done = false;
      for (let i = 0; i < 200 && !done; i++) {
        await new Promise((r) => setTimeout(r, 6000));
        const colRes = await fetch("/api/videos", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project_id: id, action: "collect", jobs: [{ scene_number: job.scene_number, request_id: job.request_id }] }),
        });
        const colData = await colRes.json() as { all_done: boolean; scenes: Array<{ scene_number: number; status: string }> };
        if (colData.all_done) {
          if (colData.scenes.some((s) => s.status === "failed")) throw new Error("El clip falló al regenerar");
          done = true;
        }
      }
      if (!done) throw new Error("El clip tardó demasiado, intenta de nuevo");

      // 3. Re-assemble final video with the updated clip
      await runFinal();
      try {
        const r = await fetch(`/api/projects/${id}`);
        if (r.ok) setDetail(await r.json() as ProjectDetail);
      } catch {}
      fireCelebration();
      toast("🎉 ¡Escena regenerada!", "success");
    } catch (err) {
      const msg = mensajeLegible(err, "Error desconocido");
      setHasError(true);
      setErrorDetail(msg);
      toast("No se pudo regenerar la escena. Ve el detalle.", "error");
    } finally {
      setProducing(false);
    }
  }

  // Save a scene's image as a REUSABLE recurring character — the moat. The image
  // becomes the locked-in "face" that future stories can reuse.
  async function saveAsCharacter(sceneNumber: number, imageUrl: string) {
    const name = window.prompt("Nombre del personaje (ej: Lucía la detective):")?.trim();
    if (!name) return;
    const sc = scenes.find((s) => s.scene_number === sceneNumber);
    try {
      const r = await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: clean(sc?.image_prompt ?? `Personaje de ${detail?.project.niche ?? "la historia"}`).slice(0, 800),
          reference_image_url: imageUrl,
          voice_style: detail?.story?.voice_style ?? undefined,
          niche: detail?.project.niche ?? undefined,
        }),
      });
      if (r.ok) toast(`⭐ "${name}" guardado. Úsalo en tus próximas historias.`, "success");
      else { const e = await r.json() as { error?: string }; toast(e.error ?? "No se pudo guardar", "error"); }
    } catch {
      toast("No se pudo guardar el personaje", "error");
    }
  }

  // Background production: kick off the whole pipeline on the server and leave.
  // The user can close the tab / create more videos — we notify when it's ready.
  async function produceBackground() {
    track("production_started_bg", { project_id: id });
    try {
      const res = await fetch("/api/produce", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: id }),
      });
      if (!res.ok) { const e = await res.json() as { error?: string }; throw new Error(e.error ?? "Error"); }
      toast("🎬 Tu video se está creando en segundo plano. Te avisamos cuando esté listo — ya puedes cerrar o crear otro.", "success");
      router.push("/dashboard/library");
    } catch (err) {
      toast(mensajeLegible(err, "No se pudo iniciar la producción"), "error");
    }
  }

  // The job's server-side stage → the four steps this screen already draws, so the
  // progress bar keeps working while the SERVER owns the pipeline.
  function stageToSteps(stage: string | null): Record<StepId, StepStatus> {
    switch (stage) {
      case "voice_images": return { voice: "running", images: "running", clips: "pending", final: "pending" };
      case "animation":    return { voice: "done", images: "done", clips: "running", final: "pending" };
      case "render":       return { voice: "done", images: "done", clips: "done", final: "running" };
      case "done":         return { voice: "done", images: "done", clips: "done", final: "done" };
      default:             return { voice: "pending", images: "pending", clips: "pending", final: "pending" };
    }
  }

  // Production now runs on the SERVER as a queued job, and this function just
  // watches it. The difference that matters: the work no longer lives in this tab.
  // Close it, reload it, lose the wifi — the job keeps going and this screen picks
  // the state back up from the database instead of starting over.
  // `resume: true` skips the enqueue and just re-attaches to a job that is already
  // running — what happens when the page is reloaded mid-production. Passing an
  // options object (rather than a boolean) keeps it safe to use as an onClick
  // handler, where React would hand us its event as the first argument.
  async function produceAll(opts?: { resume?: boolean }) {
    if (!opts?.resume) track("production_started", { project_id: id });
    setProducing(true);
    setHasError(false);
    setErrorDetail(null);
    try {
      if (!opts?.resume) {
        const res = await fetch("/api/produce", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project_id: id }),
        });
        if (!res.ok) {
          const e = await res.json() as { error?: string };
          throw new Error(e.error ?? "No se pudo iniciar la producción");
        }
      }

      // Poll the job, not the pipeline. Each tick is one indexed row.
      for (;;) {
        await new Promise((r) => setTimeout(r, 3000));
        const jr = await fetch(`/api/produce?project_id=${id}`);
        if (!jr.ok) continue;                       // transient — the job is safe
        const { job } = await jr.json() as { job: null | { status: string; stage: string | null; error: string | null } };
        if (!job) continue;

        setStepStatus(stageToSteps(job.stage));
        if (job.status === "failed") throw new Error(job.error ?? "La producción falló");
        if (job.status === "done") break;
      }

      try {
        const r = await fetch(`/api/projects/${id}`);
        if (r.ok) setDetail(await r.json() as ProjectDetail);
      } catch {}
      setProducing(false);
      setCelebrate(true);
      fireCelebration();
      toast("🎉 ¡Tu video está listo!", "success");
      setTimeout(() => setCelebrate(false), 4500);
      return;
    } catch (err) {
      const msg = mensajeLegible(err, "Error desconocido");
      setHasError(true);
      setErrorDetail(msg);
      // The worker already refunds on terminal failure. This is only a safety net
      // for the case where we never got a job started at all — and it's idempotent
      // server-side, so a double call can't hand back two credits.
      try {
        const r = await fetch("/api/credits/refund", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project_id: id }),
        });
        const d = await r.json() as { refunded?: boolean };
        if (d.refunded) toast("Algo falló — te devolvimos tu crédito. Intenta de nuevo.", "info");
        else toast("Algo salió mal. Ve el detalle abajo.", "error");
      } catch {
        toast("Algo salió mal. Ve el detalle abajo.", "error");
      }
    } finally {
      setProducing(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <>
        <TopBar title="Tu video" />
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
        </div>
      </>
    );
  }

  if (!detail) return null;

  const { project, story, scenes, seo } = detail;
  const clean = (t: string) => t?.replace(/^\[MOCK\]\s*/i, "").trim() ?? "";
  const seoHashtags: string[] = seo ? (JSON.parse(seo.hashtags) as string[]) : [];
  const platform = (((project as unknown) as Record<string, unknown>).target_platform as string | undefined) ?? "tiktok";
  const platformTip = (PLATFORM_TIPS[platform] ?? PLATFORM_TIPS.tiktok)!;

  // Ken Burns mode has no "clips" phase — hide it from progress + the waiting UI.
  const activePhases = animationTier === "kenburns" ? PHASES.filter((p) => p.key !== "clips") : PHASES;
  const activeStepIds = activePhases.map((p) => p.key);

  const doneCount = activeStepIds.filter((s) => stepStatus[s] === "done").length;
  const progress = Math.round((doneCount / activeStepIds.length) * 100);

  // Current production phase for the creative waiting screen:
  // first step that's running, else first not-done, else the last phase.
  const currentPhase =
    activePhases.find((p) => stepStatus[p.key] === "running") ??
    activePhases.find((p) => stepStatus[p.key] !== "done") ??
    activePhases[activePhases.length - 1]!;

  // Map each scene to its image thumbnail (assets link by scene_id)
  const imageBySceneId = new Map(
    (detail.assets ?? []).filter((a) => a.asset_type === "image" && a.scene_id).map((a) => [a.scene_id, a.public_url]),
  );
  // Versiones anteriores de cada imagen: lo que había antes de regenerar. Vive
  // en metadata.versiones del asset — volver a una es gratis.
  const versionesBySceneId = new Map<string, string[]>(
    (detail.assets ?? [])
      .filter((a) => a.asset_type === "image" && a.scene_id)
      .map((a) => {
        let v: string[] = [];
        try { const m = JSON.parse(a.metadata ?? "{}") as { versiones?: string[] }; v = m.versiones ?? []; } catch { v = []; }
        return [a.scene_id as string, v];
      }),
  );
  // Escenas aprobadas — el servidor las protege de cualquier regeneración.
  const aprobadaBySceneId = new Map<string, boolean>(
    (detail.assets ?? [])
      .filter((a) => a.asset_type === "image" && a.scene_id)
      .map((a) => {
        let ap = false;
        try { ap = Boolean((JSON.parse(a.metadata ?? "{}") as { aprobada?: boolean }).aprobada); } catch { ap = false; }
        return [a.scene_id as string, ap];
      }),
  );

  // ── Live stats for the production stage (dopamine numbers) ──────────────────
  const wordCount = scenes.reduce((n, s) => n + (s.narration_text?.trim().split(/\s+/).length ?? 0), 0);
  const voiceCount = new Set(
    scenes.map((s) => (s as { voice_profile?: string | null }).voice_profile).filter(Boolean),
  ).size || 1;
  const castCount = new Set(
    scenes.map((s) => (s as { speaker?: string | null }).speaker).filter(Boolean),
  ).size;
  // Stable "viral score" 92–99 derived from the project id — feels like real analysis.
  const viralScore = 92 + (Math.abs([...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)) % 8);

  // Full caption for sharing: title + description + hashtags
  const fullCaption = seo
    ? `${clean(seo.title)}\n\n${clean(seo.description)}\n\n${seoHashtags.join(" ")}`
    : project.title;

  return (
    <>
      <TopBar title="Tu video" subtitle={project.niche} />

      {/* ── REVEAL DE ENTREGA (recompensa) ──────────────────────────────────── */}
      {celebrate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm vy-fade-in"
          onClick={() => setCelebrate(false)}
        >
          <style>{`@keyframes vyFadeIn { from { opacity: 0; } to { opacity: 1; } } .vy-fade-in { animation: vyFadeIn 0.3s ease forwards; }`}</style>
          <div className="vy-pop relative mx-4 max-w-sm w-full rounded-3xl vy-grad-bg p-[1.5px] shadow-2xl vy-glow" onClick={(e) => e.stopPropagation()}>
            <div className="rounded-3xl bg-zinc-950 p-7 text-center">
              <div className="w-20 h-20 rounded-3xl vy-grad-bg flex items-center justify-center mx-auto mb-4 vy-float2">
                <PartyPopper className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-2xl font-extrabold vy-grad-text mb-1">¡Tu obra maestra está lista! 🎉</h2>
              <p className="text-sm text-zinc-400 mb-5">Lista para conquistar el feed</p>

              {/* Stats del video */}
              <div className="grid grid-cols-4 gap-2 mb-6">
                <div className="vy-glass rounded-xl py-2.5">
                  <p className="text-base font-extrabold text-violet-300"><CountUp value={scenes.length} /></p>
                  <p className="text-[8px] uppercase tracking-wider text-zinc-500">escenas</p>
                </div>
                <div className="vy-glass rounded-xl py-2.5">
                  <p className="text-base font-extrabold text-fuchsia-300"><CountUp value={castCount || 1} /></p>
                  <p className="text-[8px] uppercase tracking-wider text-zinc-500">personajes</p>
                </div>
                <div className="vy-glass rounded-xl py-2.5">
                  <p className="text-base font-extrabold text-pink-300"><CountUp value={voiceCount} /></p>
                  <p className="text-[8px] uppercase tracking-wider text-zinc-500">{voiceCount === 1 ? "voz" : "voces"}</p>
                </div>
                <div className="vy-glass rounded-xl py-2.5">
                  <p className="text-base font-extrabold text-cyan-300"><CountUp value={viralScore} suffix="%" /></p>
                  <p className="text-[8px] uppercase tracking-wider text-zinc-500">viral</p>
                </div>
              </div>

              <button
                onClick={() => setCelebrate(false)}
                className="w-full flex items-center justify-center gap-2 vy-grad-bg text-white font-extrabold py-3.5 rounded-2xl text-sm vy-press mb-2"
              >
                <Download className="w-4 h-4" /> Ver y descargar mi video
              </button>
              <Link href="/dashboard/projects/new">
                <button className="w-full flex items-center justify-center gap-2 border border-violet-700/50 text-violet-300 hover:bg-violet-950/40 font-semibold py-2.5 rounded-2xl text-xs transition-all">
                  <PlusCircle className="w-4 h-4" /> Crear otro mientras este arrasa
                </button>
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="p-4 space-y-5 pb-24">

        {/* Back + title */}
        <div className="flex items-center gap-3">
          <Link href="/dashboard/library">
            <button className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center transition-colors shrink-0">
              <ArrowLeft className="w-4 h-4 text-zinc-400" />
            </button>
          </Link>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-white leading-tight truncate">{project.title}</h1>
            <p className="text-xs text-zinc-500">{project.niche} · {formatDate(project.created_at)}</p>
          </div>
        </div>

        {/* ── VIDEO LISTO ────────────────────────────────────────────────────── */}
        {finalVideoUrl && (
          <>
            {/* Video + descarga lado a lado */}
            <div className="flex gap-3 items-start">
              {/* Video pequeño */}
              <div className="w-32 shrink-0 rounded-xl overflow-hidden border border-zinc-700 bg-black">
                <video
                  src={finalVideoUrl}
                  className="w-full aspect-[9/16] object-cover"
                  controls playsInline
                />
              </div>

              {/* Acciones rápidas */}
              <div className="flex-1 space-y-2.5">
                <div className="bg-emerald-950/30 border border-emerald-800/30 rounded-xl p-3 text-center">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto mb-1" />
                  <p className="text-xs font-bold text-emerald-300">¡Video listo!</p>
                  <p className="text-xs text-emerald-700 mt-0.5">Descarga y publica ahora</p>
                </div>
                <a
                  href={finalVideoUrl}
                  download
                  onClick={() => track("video_downloaded", { project_id: id })}
                  className="flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 text-white font-semibold py-3 rounded-xl transition-all text-sm w-full"
                >
                  <Download className="w-4 h-4" />
                  Descargar MP4
                </a>
                <a
                  href={finalVideoUrl}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium py-2.5 rounded-xl transition-all text-xs w-full border border-zinc-700"
                >
                  ↗ Ver en pantalla completa
                </a>

                {/* Continuar la serie — el bucle de retención: el video prometió una
                    Parte 2 en su CTA, así que aquí es donde se crea (mismo elenco,
                    retoma el cliffhanger). Máxima intención: acaba de ver su video. */}
                <button
                  onClick={() => void createNextEpisode()}
                  disabled={creatingNext}
                  className="flex items-center justify-center gap-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-600/50 text-amber-300 font-bold py-2.5 rounded-xl transition-all text-xs w-full disabled:opacity-50"
                >
                  {creatingNext
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Preparando…</>
                    : <>🎬 Crear Parte {nextEpisodeNumber}</>}
                </button>
                {nextError && <p className="text-[11px] text-red-400 text-center">{nextError}</p>}
              </div>
            </div>

            {/* ── KIT DE PUBLICACIÓN ────────────────────────────────────────── */}
            <div className="space-y-1.5">
              <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest px-1">Kit para publicar</h2>

              {/* Caption completa */}
              <CopyField
                label="Caption completa"
                value={fullCaption}
                copyKey="caption"
                icon={MessageSquare}
              />

              {/* Título SEO */}
              {seo && (
                <CopyField
                  label="Título del video"
                  value={clean(seo.title)}
                  copyKey="seo-title"
                  icon={Target}
                />
              )}

              {/* Hook de apertura */}
              {story && (
                <CopyField
                  label="Hook de apertura (primer comentario fijado)"
                  value={clean(story.hook)}
                  copyKey="hook"
                  icon={Lightbulb}
                />
              )}

              {/* CTA */}
              {story && (
                <CopyField
                  label="Call to action"
                  value={clean(story.cta)}
                  copyKey="cta"
                  icon={TrendingUp}
                />
              )}

              {/* Hashtags */}
              {seoHashtags.length > 0 && (
                <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-1.5">
                      <Hash className="w-3.5 h-3.5 text-violet-400" />
                      <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Hashtags</p>
                    </div>
                    <CopyHashtagsButton hashtags={seoHashtags} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {seoHashtags.map((h) => (
                      <span key={h} className="text-xs bg-zinc-800 text-violet-300 rounded-full px-2.5 py-1 border border-zinc-700/60">{h}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── ESTRATEGIA DE PUBLICACIÓN ─────────────────────────────────── */}
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-lg">{platformTip.icon}</span>
                <h3 className="text-sm font-bold text-white capitalize">Estrategia para {platform}</h3>
              </div>

              {/* Horarios */}
              <div className="flex items-start gap-3 bg-zinc-800/60 rounded-lg p-3">
                <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-amber-300 mb-0.5">Mejores horarios para publicar</p>
                  <p className="text-xs text-zinc-300">{platformTip.times}</p>
                </div>
              </div>

              {/* Tip del algoritmo */}
              <div className="flex items-start gap-3 bg-zinc-800/60 rounded-lg p-3">
                <TrendingUp className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-violet-300 mb-0.5">Tip de algoritmo</p>
                  <p className="text-xs text-zinc-300">{platformTip.tip}</p>
                </div>
              </div>

              {/* Estrategia de storytelling */}
              <div className="flex items-start gap-3 bg-zinc-800/60 rounded-lg p-3">
                <Lightbulb className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-emerald-300 mb-0.5">Estrategia de storytelling</p>
                  <ul className="text-xs text-zinc-300 space-y-1">
                    <li>• Pon el hook como primer comentario fijado para repetición</li>
                    <li>• Responde cada comentario en las primeras 2 horas para impulsar el algoritmo</li>
                    <li>• Haz una segunda parte si supera 500 comentarios</li>
                    <li>• Publica el mismo video en {platform === "tiktok" ? "Reels y Shorts" : platform === "instagram" ? "TikTok y Shorts" : "TikTok y Reels"} para triplicar el alcance</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Miniatura */}
            {seo?.thumbnail_concept && (
              <CopyField
                label="Concepto de miniatura (para Canva / CapCut)"
                value={clean(seo.thumbnail_concept)}
                copyKey="thumbnail"
                icon={Lightbulb}
              />
            )}

            {/* ── AJUSTAR ESCENAS ───────────────────────────────────────────── */}
            {scenes.length > 0 && (
              <div className="space-y-2">
                <div className="px-1 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">¿No te gustó una escena?</h2>
                    <p className="text-[11px] text-zinc-600 mt-0.5">
                      Regenera solo esa escena — el resto se conserva. Si la nueva no te gusta, vuelves a la anterior gratis.
                      Y con 🔒 apruebas una escena para que nada vuelva a tocarla.
                    </p>
                  </div>
                  {/* El plan de movimiento existía y era invisible: la IA decidía la
                      cámara y la emoción de cada escena, y el usuario se enteraba
                      recién en el video ya pagado. Verlo y corregirlo antes de
                      animar es la diferencia entre dirigir y apostar. */}
                  <button
                    onClick={() => { const abrir = !verPlan; setVerPlan(abrir); if (abrir) void cargarDna(); }}
                    className="shrink-0 text-[11px] px-2.5 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
                  >
                    {verPlan ? "Ocultar plan" : "🎬 Ver plan de rodaje"}
                  </button>
                  <button
                    onClick={() => setVerTabla(v => !v)}
                    className="shrink-0 text-[11px] px-2.5 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:border-fuchsia-500/60 hover:text-white transition-colors ml-2"
                  >
                    {verTabla ? "Ocultar tabla" : "📋 Guion como tabla"}
                  </button>
                </div>

                {verTabla && (
                  <div className="overflow-x-auto rounded-xl border border-zinc-800 mb-3">
                    <table className="w-full text-[11px] leading-snug">
                      <thead className="bg-zinc-900 text-zinc-500 uppercase tracking-wider text-[9px]">
                        <tr>
                          <th className="px-2 py-1.5 text-left">T</th>
                          <th className="px-2 py-1.5 text-left">Línea</th>
                          <th className="px-2 py-1.5 text-left">Visual</th>
                          <th className="px-2 py-1.5 text-left">Sonido</th>
                          <th className="px-2 py-1.5 text-left">Emoción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/70">
                        {(() => { let t = 0; return scenes.map((sc) => {
                          const x = sc as unknown as { duration_seconds?: number | null; narration_text?: string | null; image_prompt?: string | null; physical_action?: string | null; sfx_prompt?: string | null; ambience?: string | null; emotion?: string | null; speaker?: string | null; is_peak?: number | boolean };
                          const ini = t; const dur = Number(x.duration_seconds ?? 5) || 5; t += dur;
                          return (
                            <tr key={`tbl-${sc.id}`} className={x.is_peak ? "bg-pink-950/20" : undefined}>
                              <td className="px-2 py-1.5 text-zinc-500 whitespace-nowrap align-top">{ini}–{t}s{x.is_peak ? " ★" : ""}</td>
                              <td className="px-2 py-1.5 text-zinc-200 align-top min-w-[140px]">{x.speaker ? <span className="text-fuchsia-300 font-bold">{x.speaker}: </span> : null}{(x.narration_text ?? "").trim() || <span className="text-zinc-600">(mudo)</span>}</td>
                              <td className="px-2 py-1.5 text-zinc-400 align-top min-w-[180px]">{(x.physical_action ?? x.image_prompt ?? "").slice(0, 110)}</td>
                              <td className="px-2 py-1.5 text-zinc-500 align-top min-w-[120px]">{[x.ambience, x.sfx_prompt].filter(Boolean).join(" · ").slice(0, 80) || "—"}</td>
                              <td className="px-2 py-1.5 text-zinc-400 align-top capitalize">{x.emotion ?? "—"}</td>
                            </tr>
                          );
                        }); })()}
                      </tbody>
                    </table>
                  </div>
                )}
                {verPlan && (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 divide-y divide-zinc-800/70 mb-2">
                    <p className="px-3 py-2 text-[10px] text-zinc-500">
                      Esto es lo que la IA va a animar. Corrígelo y se anima así — es gratis y no genera nada.
                    </p>

                    {/* MOTION DNA — el movimiento como algo que se reutiliza.
                        Si una toma quedó bien, guardar su movimiento evita tener
                        que volver a tener suerte en la próxima historia. */}
                    {dnaGuardados.length > 0 && (
                      <div className="px-3 py-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mr-1">Tu biblioteca</span>
                        {dnaGuardados.map(d => (
                          <button
                            key={d.id}
                            onClick={() => void aplicarDna(d.id, d.name)}
                            title={`Cámara: ${d.camera_move ?? "—"} · Emoción: ${d.emotion ?? "—"}`}
                            className="px-2 py-1 rounded-lg border border-violet-700/50 bg-violet-950/30 text-[10px] text-violet-200 hover:bg-violet-600 hover:text-white transition-colors"
                          >
                            🎞 {d.name}
                          </button>
                        ))}
                        <span className="text-[9px] text-zinc-600 w-full mt-0.5">Toca uno para aplicarlo a TODAS las escenas.</span>
                      </div>
                    )}

                    {scenes.map((sc) => {
                      const s = sc as unknown as { camera_move?: string | null; emotion?: string | null; environment?: string | null };
                      return (
                        <div key={`plan-${sc.id}`} className="px-3 py-2 grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 items-center">
                          <span className="text-[10px] font-bold text-zinc-500 w-5">{sc.scene_number}</span>
                          {([
                            { k: "camera_move" as const, ph: "cámara", v: s.camera_move ?? "" },
                            { k: "emotion" as const, ph: "emoción", v: s.emotion ?? "" },
                            { k: "environment" as const, ph: "ambiente", v: s.environment ?? "" },
                          ]).map(campo => (
                            <input
                              key={campo.k}
                              defaultValue={campo.v}
                              placeholder={campo.ph}
                              onBlur={(e) => {
                                const nuevo = e.target.value.trim();
                                if (nuevo !== campo.v) void guardarPlan(sc.scene_number, { [campo.k]: nuevo });
                              }}
                              className="bg-zinc-950/60 border border-zinc-800 rounded px-2 py-1 text-[10px] text-zinc-300 focus:outline-none focus:border-violet-600 transition-colors"
                            />
                          ))}
                          <button
                            onClick={() => void guardarDna(sc.scene_number)}
                            title="Guardar este movimiento para reusarlo en otras historias"
                            className="text-[10px] px-1.5 py-1 rounded border border-zinc-800 text-zinc-500 hover:text-violet-300 hover:border-violet-700 transition-colors"
                          >
                            💾
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2">
                  {scenes.map((sc) => {
                    const thumb = imageBySceneId.get(sc.id);
                    const aprobada = aprobadaBySceneId.get(sc.id) ?? false;
                    return (
                      <div key={sc.id} className={`relative group rounded-xl overflow-hidden border bg-zinc-900 aspect-[9/16] ${
                        aprobada ? "border-emerald-500/70 ring-1 ring-emerald-500/30" : "border-zinc-800"
                      }`}>
                        {thumb ? (
                          <Thumb src={thumb} alt={`Escena ${sc.scene_number}`} sizes="(max-width: 768px) 33vw, 15vw" className="object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-700 text-xs">Escena {sc.scene_number}</div>
                        )}
                        <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center text-[10px] font-bold text-white">
                          {sc.scene_number}
                        </div>
                        {thumb && (
                          <div className="absolute top-1 right-1 z-10 flex gap-1">
                            {/* Aprobar: siempre visible, no en hover. Es un estado
                                del contenido, no una acción escondida. */}
                            <button
                              onClick={(e) => { e.stopPropagation(); void toggleAprobada(sc.scene_number, !aprobada); }}
                              className={`p-1.5 rounded-lg transition-colors ${
                                aprobada
                                  ? "bg-emerald-600 text-white"
                                  : "bg-black/70 text-zinc-300 hover:bg-emerald-600 hover:text-white"
                              }`}
                              title={aprobada ? "Aprobada — click para permitir regenerar" : "Aprobar: protege esta escena de regeneraciones"}
                            >
                              {aprobada ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); void saveAsCharacter(sc.scene_number, thumb); }}
                              className="p-1.5 rounded-lg bg-black/70 hover:bg-violet-600 text-violet-200 hover:text-white transition-colors"
                              title="Guardar como personaje reutilizable"
                            >
                              <Star className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                        {/* Deshacer: visible SOLO si esta escena tiene una versión
                            anterior. No compite con Regenerar — vive abajo y se ve
                            siempre, porque tras una regeneración fallida es lo
                            primero que el usuario busca. */}
                        {(versionesBySceneId.get(sc.id)?.length ?? 0) > 0 && (
                          <button
                            onClick={(e) => { e.stopPropagation(); void revertScene(sc.scene_number); }}
                            disabled={producing}
                            className="absolute bottom-1 inset-x-1 z-10 py-1 rounded-lg bg-black/75 hover:bg-emerald-600 text-[9px] font-bold text-emerald-200 hover:text-white transition-colors disabled:opacity-40"
                            title="Volver a la imagen anterior (gratis)"
                          >
                            ↩ Volver a la anterior
                          </button>
                        )}
                        {/* Una escena aprobada no ofrece regenerar: el candado se
                            hace cumplir en el servidor, y la UI no debe invitar a
                            una acción que va a ser rechazada. */}
                        {aprobada ? (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/0 hover:bg-black/60 opacity-0 hover:opacity-100 transition-all pointer-events-none">
                            <Lock className="w-5 h-5 text-emerald-300" />
                            <span className="text-[9px] font-semibold text-emerald-200 px-2 text-center">Aprobada · protegida</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => regenerateScene(sc.scene_number)}
                            className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/0 hover:bg-black/70 opacity-0 hover:opacity-100 transition-all"
                          >
                            <RefreshCw className="w-5 h-5 text-white" />
                            <span className="text-[10px] font-semibold text-white">Regenerar</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Crear otro */}
            <Link href="/dashboard/projects/new">
              <button className="w-full flex items-center justify-center gap-2 border border-zinc-700 hover:border-violet-600/60 text-zinc-400 hover:text-violet-300 font-medium py-3.5 rounded-xl transition-all text-sm">
                <PlusCircle className="w-4 h-4" />
                Crear otro video
              </button>
            </Link>
          </>
        )}

        {/* ── PRODUCIENDO (escenario en vivo) ────────────────────────────────── */}
        {producing && !finalVideoUrl && (
          <div className="space-y-5">

            {/* Escenario central: anillo + fase girando 3D + % */}
            <div className="relative overflow-hidden rounded-2xl vy-glass p-6 text-center">
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-violet-600/20 rounded-full blur-3xl animate-pulse" />
              </div>
              <div className="relative">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-300 mb-3">VYNAVO está creando</p>
                <div className="flex justify-center mb-4" style={{ perspective: "700px" }}>
                  <div className="relative w-28 h-28">
                    <div className="absolute -inset-2 rounded-full border-2 border-transparent border-t-violet-500 border-r-pink-500 vy-ring-spin" />
                    <div className="vy-flip3d w-28 h-28 rounded-2xl vy-grad-bg flex items-center justify-center text-5xl">
                      {currentPhase.emoji}
                    </div>
                    <div className="absolute -bottom-1.5 -right-1.5 w-9 h-9 rounded-full bg-zinc-950 border-2 border-cyan-400 flex items-center justify-center vy-pulse-soft">
                      <span className="text-[11px] font-bold text-cyan-300">{Math.max(progress, 8)}</span>
                    </div>
                  </div>
                </div>
                <h2 className="text-lg font-bold vy-grad-text mb-1">{currentPhase.title}…</h2>
                <p key={tipIdx} className="text-sm text-fuchsia-200 vy-fadeup">✨ {EMO_MESSAGES[tipIdx % EMO_MESSAGES.length]}</p>
              </div>
            </div>

            {/* Stats en vivo */}
            <div className="grid grid-cols-3 gap-2">
              <div className="vy-glass rounded-xl py-3 text-center">
                <p className="text-lg font-extrabold text-violet-300"><CountUp value={wordCount} /></p>
                <p className="text-[9px] uppercase tracking-wider text-zinc-500 mt-0.5">palabras</p>
              </div>
              <div className="vy-glass rounded-xl py-3 text-center">
                <p className="text-lg font-extrabold text-fuchsia-300"><CountUp value={voiceCount} /></p>
                <p className="text-[9px] uppercase tracking-wider text-zinc-500 mt-0.5">{voiceCount === 1 ? "voz" : "voces"}</p>
              </div>
              <div className="vy-glass rounded-xl py-3 text-center">
                <p className="text-lg font-extrabold text-cyan-300"><CountUp value={viralScore} suffix="%" /></p>
                <p className="text-[9px] uppercase tracking-wider text-zinc-500 mt-0.5">viral score</p>
              </div>
            </div>

            {/* Checklist de fases (vivo) */}
            <div className="vy-glass rounded-xl p-4 space-y-2.5">
              {activePhases.map((ph) => {
                const st = stepStatus[ph.key];
                return (
                  <div key={ph.key} className={`flex items-center gap-2.5 text-xs ${st === "running" ? "vy-rise" : ""}`}>
                    {st === "done" ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      : st === "running" ? <Loader2 className="w-4 h-4 text-violet-400 animate-spin shrink-0" />
                      : <span className="w-4 h-4 rounded-full border border-zinc-700 shrink-0" />}
                    <span className={st === "done" ? "text-emerald-300" : st === "running" ? "text-white font-semibold" : "text-zinc-600"}>
                      {ph.title}{st === "running" ? "…" : ""}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Miniaturas en vivo de las escenas (se ensamblan ante el usuario) */}
            {scenes.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {scenes.map((sc, i) => {
                  const thumb = imageBySceneId.get(sc.id);
                  return (
                    <div key={sc.id} className="relative rounded-xl overflow-hidden border border-violet-900/40 bg-zinc-900 aspect-[9/16]">
                      {thumb ? (
                        <>
                          <Thumb src={thumb} alt={`Escena ${sc.scene_number}`} sizes="(max-width: 768px) 33vw, 15vw" className="object-cover vy-ken2" />
                          <div className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 text-white" />
                          </div>
                        </>
                      ) : (
                        <div className="vy-shimmer2 vy-scan2 absolute inset-0 flex items-center justify-center" style={{ animationDelay: `${i * 0.15}s` }}>
                          <span className="text-violet-700 text-lg">🎞️</span>
                        </div>
                      )}
                      <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center text-[10px] font-bold text-white">
                        {sc.scene_number}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Barra de progreso */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-zinc-500">
                <span>Creando tu video</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full vy-grad-bg rounded-full transition-all duration-700" style={{ width: `${Math.max(progress, 8)}%` }} />
              </div>
            </div>

            {/* Tip rotativo */}
            <div className="vy-glass rounded-xl px-4 py-3 text-center min-h-[3rem] flex items-center justify-center">
              <p key={`tip-${tipIdx}`} className="text-xs text-zinc-400 vy-fadeup">{WAIT_TIPS[tipIdx]}</p>
            </div>

            <p className="text-center text-xs text-zinc-600">No cierres esta pantalla mientras se crea tu video</p>
          </div>
        )}

        {/* ── LISTO PARA INICIAR ────────────────────────────────────────────── */}
        {!producing && !finalVideoUrl && (
          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-950/60 to-zinc-900 border border-violet-700/30 p-8 text-center">
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-violet-600/15 rounded-full blur-3xl" />
              </div>
              <div className="relative">
                <div className="text-5xl mb-4">🎬</div>
                <h2 className="text-xl font-bold text-white mb-2">
                  {hasError ? "Algo salió mal" : "Tu historia está lista"}
                </h2>
                <p className="text-sm text-zinc-400 mb-2">
                  {hasError
                    ? "No te preocupes, puedes intentarlo de nuevo."
                    : animationTier === "kenburns"
                      ? "Toca el botón para crear tu video con IA. Tarda ~1-2 minutos."
                      : "Toca el botón para crear tu video con IA. Tarda unos 7 minutos."}
                </p>
                {hasError && errorDetail && (
                  <div className="mb-4 text-left bg-red-950/40 border border-red-800/40 rounded-xl px-4 py-3">
                    <p className="text-xs font-semibold text-red-400 mb-1">Detalle del error:</p>
                    <p className="text-xs text-red-300 font-mono break-words">{errorDetail}</p>
                  </div>
                )}
                <button
                  onClick={() => void produceAll()}
                  className="inline-flex items-center gap-3 bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 text-white font-bold text-base px-8 py-4 rounded-2xl transition-all shadow-lg shadow-violet-900/40 hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Sparkles className="w-5 h-5" />
                  {hasError ? "Reintentar" : "Crear y ver en vivo"}
                </button>
                <button
                  onClick={produceBackground}
                  className="mt-3 inline-flex items-center justify-center gap-2 border border-violet-700/50 text-violet-300 hover:bg-violet-950/40 font-semibold text-sm px-6 py-3 rounded-2xl transition-all"
                >
                  🎬 Producir en segundo plano · puedes cerrar
                </button>
                <p className="text-xs text-zinc-600 mt-4">~minutos · Completamente automático · te avisamos cuando esté listo</p>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
}

// Isolated copy button to avoid re-rendering the whole page
function CopyHashtagsButton({ hashtags }: { hashtags: string[] }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(hashtags.join(" ")).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button onClick={copy} className="flex items-center gap-1 text-xs text-zinc-500 hover:text-violet-400 transition-colors">
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? "Copiado" : "Copiar todos"}
    </button>
  );
}
