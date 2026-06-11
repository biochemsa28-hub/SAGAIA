"use client";
import { useEffect, useState, useRef } from "react";
import React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Download, Loader2, Film, FileText,
  Image as ImageIcon, Zap, Hash, ChevronDown, ChevronUp,
  Copy, Check, Mic, Play, CheckCircle2,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { useToast } from "@/components/ui/toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import type { ProjectDetail } from "@/lib/db/repository";

// ─── Types ────────────────────────────────────────────────────────────────────
type StepId = "voice" | "images" | "clips" | "final";
type StepStatus = "pending" | "running" | "done" | "error";

const STEP_META: Record<StepId, { label: string; sublabel: string; estimate: string; color: string }> = {
  voice:  { label: "Voz",      sublabel: "Narración IA",  estimate: "~30 seg",  color: "emerald" },
  images: { label: "Imágenes", sublabel: "Imágenes IA",  estimate: "~1 min",  color: "blue"    },
  clips:  { label: "Clips",    sublabel: "Animación IA",  estimate: "~3 min",  color: "purple"  },
  final:  { label: "Video final", sublabel: "Ensamblaje IA", estimate: "~2 min",  color: "pink"    },
};

// ─── Step row component ───────────────────────────────────────────────────────
function StepRow({
  id, status, text, elapsed,
}: { id: StepId; status: StepStatus; text: string; elapsed?: number }) {
  const meta = STEP_META[id];
  const icons: Record<StepId, string> = { voice: "🎤", images: "🖼️", clips: "🎬", final: "⚡" };

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
      status === "running" ? "bg-violet-950/40 border border-violet-700/40" :
      status === "done"    ? "bg-zinc-900/60" :
      status === "error"   ? "bg-red-950/30 border border-red-800/30" :
      "opacity-40"
    }`}>
      {/* Icon/status */}
      <div className="w-8 h-8 shrink-0 flex items-center justify-center">
        {status === "running" && <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />}
        {status === "done"    && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
        {status === "error"   && <span className="text-red-400 text-lg">✕</span>}
        {status === "pending" && <span className="text-xl">{icons[id]}</span>}
      </div>

      {/* Label */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">{meta.label}</span>
          <span className="text-xs text-zinc-600">{meta.sublabel}</span>
        </div>
        {text && (
          <p className={`text-xs mt-0.5 ${status === "error" ? "text-red-400" : "text-zinc-400"}`}>{text}</p>
        )}
      </div>

      {/* Time */}
      <div className="text-right shrink-0">
        {status === "done" && elapsed !== undefined && (
          <span className="text-xs text-emerald-500">{elapsed}s</span>
        )}
        {status === "running" && elapsed !== undefined && (
          <span className="text-xs text-violet-400 tabular-nums">{elapsed}s</span>
        )}
        {status === "pending" && (
          <span className="text-xs text-zinc-600">{meta.estimate}</span>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedScene, setExpandedScene] = useState<number | null>(1);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);

  // Per-step status
  const [stepStatus, setStepStatus] = useState<Record<StepId, StepStatus>>({
    voice: "pending", images: "pending", clips: "pending", final: "pending",
  });
  const [stepText, setStepText] = useState<Record<StepId, string>>({
    voice: "", images: "", clips: "", final: "",
  });
  const [stepElapsed, setStepElapsed] = useState<Record<StepId, number>>({
    voice: 0, images: 0, clips: 0, final: 0,
  });
  const [producingAll, setProducingAll] = useState(false);
  const { toast } = useToast();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepStartRef = useRef<number>(0);

  useEffect(() => {
    fetch(`/api/projects/${id}`)
      .then((r) => {
        if (r.status === 404) { router.push("/dashboard/library"); return null; }
        return r.json();
      })
      .then((d) => {
        if (!d) return;
        setDetail(d as ProjectDetail);
        // Seed step statuses from existing assets
        const assets = (d as ProjectDetail).assets ?? [];
        setStepStatus({
          voice: assets.some((a) => a.asset_type === "audio") ? "done" : "pending",
          images: assets.some((a) => a.asset_type === "image") ? "done" : "pending",
          clips: assets.some((a) => a.asset_type === "video") ? "done" : "pending",
          final: assets.some((a) => a.asset_type === "final_video") ? "done" : "pending",
        });
      })
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [id, router]);

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  function setStep(step: StepId, status: StepStatus, text = "") {
    setStepStatus((p) => ({ ...p, [step]: status }));
    setStepText((p) => ({ ...p, [step]: text }));

    if (status === "running") {
      // start per-step timer
      if (timerRef.current) clearInterval(timerRef.current);
      stepStartRef.current = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - stepStartRef.current) / 1000);
        setStepElapsed((p) => ({ ...p, [step]: elapsed }));
      }, 1000);
    } else if (status === "done" || status === "error") {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      const elapsed = Math.floor((Date.now() - stepStartRef.current) / 1000);
      setStepElapsed((p) => ({ ...p, [step]: elapsed }));
    }
  }

  // ── Voice ──────────────────────────────────────────────────────────────────
  async function runVoice() {
    setStep("voice", "running", "Generando voz…");
    const res = await fetch("/api/voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: id }),
    });
    const data = (await res.json()) as { success: boolean; succeeded: number; total: number; voice?: string; mock?: boolean; error?: string };
    if (res.ok && data.success) {
      setStep("voice", "done", `${data.succeeded}/${data.total} escenas generadas`);
      toast("🎤 Voz generada correctamente", "success");
    } else {
      setStep("voice", "error", data.error ?? "Error al generar voz");
      toast(data.error ?? "Error al generar voz", "error");
      throw new Error(data.error ?? "voice failed");
    }
  }

  // ── Images ─────────────────────────────────────────────────────────────────
  async function runImages() {
    setStep("images", "running", "Generando imágenes…");
    const res = await fetch("/api/images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: id }),
    });
    const data = (await res.json()) as { success: boolean; succeeded: number; total: number; mock?: boolean; error?: string };
    if (res.ok && data.success) {
      setStep("images", "done", `${data.succeeded}/${data.total} imágenes generadas`);
      toast("🖼️ Imágenes generadas correctamente", "success");
    } else {
      setStep("images", "error", data.error ?? "Error al generar imágenes");
      toast(data.error ?? "Error al generar imágenes", "error");
      throw new Error(data.error ?? "images failed");
    }
  }

  // ── Clips (Kling) ──────────────────────────────────────────────────────────
  async function runClips() {
    setStep("clips", "running", "Procesando animaciones…");
    const submitRes = await fetch("/api/videos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: id, action: "submit" }),
    });
    const submitData = (await submitRes.json()) as {
      success: boolean;
      jobs: Array<{ scene_number: number; request_id: string; status: string }>;
      error?: string;
    };
    if (!submitRes.ok || !submitData.success) {
      setStep("clips", "error", submitData.error ?? "Error al enviar");
      throw new Error(submitData.error ?? "clips submit failed");
    }

    let jobs = submitData.jobs.filter((j) => j.request_id);
    setStep("clips", "running", `Animando ${jobs.length} clips…`);

    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const collectRes = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: id, action: "collect",
          jobs: jobs.map((j) => ({ scene_number: j.scene_number, request_id: j.request_id })),
        }),
      });
      const collectData = (await collectRes.json()) as {
        all_done: boolean;
        scenes: Array<{ scene_number: number; status: string }>;
      };
      const done = collectData.scenes.filter((s) => s.status === "completed").length;
      setStep("clips", "running", `${done}/${jobs.length} clips listos…`);
      if (collectData.all_done) {
        setStep("clips", "done", `${done}/${jobs.length} clips animados`);
        toast("🎬 Clips animados correctamente", "success");
        return;
      }
      jobs = jobs.filter((j) => {
        const s = collectData.scenes.find((s) => s.scene_number === j.scene_number);
        return s?.status !== "completed" && s?.status !== "failed";
      });
    }
    setStep("clips", "error", "Tiempo agotado — intenta de nuevo");
    toast("Clips: tiempo agotado, intenta de nuevo", "error");
    throw new Error("clips timeout");
  }

  // ── Final video ────────────────────────────────────────────────────────────
  async function runFinal() {
    setStep("final", "running", "Iniciando ensamblaje…");
    setFinalVideoUrl(null);
    const submitRes = await fetch("/api/assemble", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: id, action: "submit", add_subtitles: true }),
    });
    const submitData = (await submitRes.json()) as { render_id?: string; error?: string };
    if (!submitRes.ok || !submitData.render_id) {
      setStep("final", "error", submitData.error ?? "Error al enviar");
      throw new Error(submitData.error ?? "final submit failed");
    }
    const renderId = submitData.render_id;
    setStep("final", "running", "Ensamblando… (1-2 min)");
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const checkRes = await fetch("/api/assemble", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: id, action: "check", render_id: renderId }),
      });
      const checkData = (await checkRes.json()) as { status: string; url?: string; error?: string };
      if (checkData.status === "done" && checkData.url) {
        setStep("final", "done", "¡Video listo!");
        setFinalVideoUrl(checkData.url);
        toast("⚡ ¡Video final listo! Puedes descargarlo ahora", "success");
        return;
      }
      if (checkData.status === "failed") {
        setStep("final", "error", checkData.error ?? "Render fallido");
        toast(checkData.error ?? "Error al ensamblar el video", "error");
        throw new Error("final render failed");
      }
      setStep("final", "running", `Ensamblando… (${checkData.status})`);
    }
    setStep("final", "error", "Tiempo agotado — intenta de nuevo");
    throw new Error("final timeout");
  }

  // ── Produce all ────────────────────────────────────────────────────────────
  async function produceAll() {
    setProducingAll(true);
    try {
      if (stepStatus.voice !== "done") await runVoice();
      if (stepStatus.images !== "done") await runImages();
      if (stepStatus.clips !== "done") await runClips();
      await runFinal();
      // reload to get fresh assets
      setTimeout(() => window.location.reload(), 1500);
    } catch {
      // error already set per-step
    } finally {
      setProducingAll(false);
    }
  }

  // ── ZIP ────────────────────────────────────────────────────────────────────
  async function downloadZip() {
    if (!detail?.story) return;
    setDownloading(true);
    try {
      const storyOutput = {
        meta: {
          title: detail.project.title, niche: detail.project.niche,
          tone: detail.project.tone, duration_target: detail.project.duration_target,
          language: detail.project.language, visual_style: detail.project.visual_style,
        },
        story: { hook: detail.story.hook, full_narrative: detail.story.full_narrative, cta: detail.story.cta },
        scenes: detail.scenes.map((s) => ({
          scene_number: s.scene_number, narration_text: s.narration_text,
          duration_seconds: s.duration_seconds, image_prompt: s.image_prompt ?? "",
          animation_prompt: s.animation_prompt ?? "", emotion: s.emotion ?? "", camera_move: s.camera_move ?? "",
        })),
        seo: detail.seo ? {
          title: detail.seo.title, description: detail.seo.description,
          hashtags: JSON.parse(detail.seo.hashtags) as string[],
          tags: JSON.parse(detail.seo.tags) as string[],
          thumbnail_concept: detail.seo.thumbnail_concept ?? "",
          thumbnail_prompt: detail.seo.thumbnail_prompt ?? "",
        } : undefined,
        production_notes: {
          total_duration_seconds: detail.story.total_duration_seconds,
          scene_count: detail.story.scene_count,
          voice_style: detail.story.voice_style ?? "neutral",
          music_mood: detail.story.music_mood ?? "neutral",
        },
      };
      const res = await fetch(`/api/export/${id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(storyOutput),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sagaia_${detail.project.title.slice(0, 30).replace(/\s+/g, "_")}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Error al exportar. Intenta de nuevo.");
    } finally {
      setDownloading(false);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <>
        <TopBar title="Proyecto" />
        <div className="p-6 flex items-center justify-center min-h-[40vh]">
          <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
        </div>
      </>
    );
  }

  if (!detail) return null;

  const { project, story, scenes, seo, assets } = detail;
  const seoHashtags: string[] = seo ? (JSON.parse(seo.hashtags) as string[]) : [];
  const imageAssets = assets?.filter((a) => a.asset_type === "image") ?? [];
  const videoAssets = assets?.filter((a) => a.asset_type === "video") ?? [];
  const finalVideo = assets?.find((a) => a.asset_type === "final_video");
  const displayFinalUrl = finalVideoUrl ?? finalVideo?.public_url ?? null;

  const STEP_IDS: StepId[] = ["voice", "images", "clips", "final"];
  const allDone = STEP_IDS.every((s) => stepStatus[s] === "done");
  const anyRunning = STEP_IDS.some((s) => stepStatus[s] === "running") || producingAll;
  const hasError = STEP_IDS.some((s) => stepStatus[s] === "error");
  const doneCount = STEP_IDS.filter((s) => stepStatus[s] === "done").length;
  const totalProgress = Math.round((doneCount / STEP_IDS.length) * 100);

  return (
    <>
      <TopBar title={project.title} subtitle={`${project.niche} · ${project.duration_target}`} />
      <div className="p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/library">
              <button className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center transition-colors">
                <ArrowLeft className="w-4 h-4 text-zinc-400" />
              </button>
            </Link>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <StatusBadge status={project.status} />
                <span className="text-xs text-zinc-500">{formatDate(project.created_at)}</span>
              </div>
              <h1 className="text-lg font-bold text-white">{project.title}</h1>
            </div>
          </div>

          {/* ZIP icon only */}
          {story && (
            <button
              onClick={downloadZip}
              disabled={downloading}
              title="Exportar ZIP"
              className="w-9 h-9 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center transition-colors text-zinc-400 hover:text-white disabled:opacity-50"
            >
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            </button>
          )}
        </div>

        {/* ── Production Panel ────────────────────────────────────────────── */}
        {story && (
          <Card className="p-5 space-y-4">

            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white">Producción de video</h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {allDone ? "Video completo y listo" : "Tiempo total estimado ~7 min"}
                </p>
              </div>
              {allDone && (
                <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium bg-emerald-950/40 border border-emerald-800/40 px-2.5 py-1 rounded-full">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Completo
                </span>
              )}
            </div>

            {/* Progress bar */}
            {(anyRunning || allDone || doneCount > 0) && (
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-zinc-600">
                  <span>{doneCount} de 4 pasos</span>
                  <span>{totalProgress}%</span>
                </div>
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-violet-500 to-pink-500 rounded-full transition-all duration-700"
                    style={{ width: `${totalProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Steps list */}
            <div className="space-y-1.5">
              {STEP_IDS.map((sid) => (
                <StepRow
                  key={sid}
                  id={sid}
                  status={stepStatus[sid]}
                  text={stepText[sid]}
                  elapsed={stepElapsed[sid]}
                />
              ))}
            </div>

            {/* Main CTA */}
            {!allDone && (
              <button
                onClick={produceAll}
                disabled={anyRunning}
                className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-violet-900/20"
              >
                {anyRunning ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Produciendo video…</>
                ) : hasError ? (
                  <><Play className="w-4 h-4" /> Reintentar producción</>
                ) : doneCount > 0 ? (
                  <><Play className="w-4 h-4" /> Continuar producción</>
                ) : (
                  <><Zap className="w-4 h-4" /> Generar video completo</>
                )}
              </button>
            )}

            {anyRunning && (
              <p className="text-center text-xs text-zinc-600">
                No cierres esta página mientras se produce el video
              </p>
            )}
          </Card>
        )}

        {/* No story yet */}
        {!story && (
          <Card className="text-center py-12">
            <Film className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Este proyecto aún no tiene contenido generado.</p>
            <Link href="/dashboard/projects/new">
              <Button size="sm" className="mt-4">Crear nuevo proyecto</Button>
            </Link>
          </Card>
        )}

        {story && (
          <>
            {/* Final Video — top priority if done */}
            {displayFinalUrl && (
              <Card>
                <div className="flex items-center gap-2 mb-4">
                  <Zap className="w-4 h-4 text-pink-400" />
                  <h2 className="text-sm font-semibold text-white">Video final</h2>
                  <span className="ml-auto text-xs text-zinc-500">1080×1920 · MP4</span>
                </div>
                <div className="max-w-xs mx-auto">
                  <video
                    src={displayFinalUrl}
                    className="w-full aspect-[9/16] object-cover rounded-xl border border-zinc-700"
                    controls playsInline
                  />
                  <div className="flex gap-2 mt-3">
                    <a
                      href={displayFinalUrl}
                      download
                      className="flex-1 text-center py-2 px-3 bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium rounded-lg transition-colors"
                    >
                      ⬇ Descargar MP4
                    </a>
                    <a
                      href={displayFinalUrl}
                      target="_blank" rel="noopener noreferrer"
                      className="py-2 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg transition-colors"
                    >
                      ↗ Abrir
                    </a>
                  </div>
                </div>
              </Card>
            )}

            {/* Story overview */}
            <Card>
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-4 h-4 text-violet-400" />
                <h2 className="text-sm font-semibold text-white">Historia</h2>
                <span className="ml-auto text-xs text-zinc-500">
                  {story.scene_count} escenas · {story.total_duration_seconds}s · {story.voice_style ?? "neutral"}
                </span>
              </div>
              <div className="space-y-3">
                <div className="bg-zinc-800/60 rounded-lg p-3">
                  <p className="text-xs font-medium text-violet-400 mb-1">Hook</p>
                  <p className="text-sm text-zinc-200">{story.hook}</p>
                </div>
                <div className="bg-zinc-800/60 rounded-lg p-3">
                  <p className="text-xs font-medium text-zinc-400 mb-1">Narrativa completa</p>
                  <p className="text-sm text-zinc-300 whitespace-pre-line leading-relaxed">{story.full_narrative}</p>
                </div>
                <div className="bg-zinc-800/60 rounded-lg p-3">
                  <p className="text-xs font-medium text-emerald-400 mb-1">CTA</p>
                  <p className="text-sm text-zinc-200">{story.cta}</p>
                </div>
              </div>
            </Card>

            {/* Scenes */}
            <div>
              <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Film className="w-4 h-4 text-violet-400" />
                Escenas ({scenes.length})
              </h2>
              <div className="space-y-2">
                {scenes.map((scene) => {
                  const open = expandedScene === scene.scene_number;
                  return (
                    <Card key={scene.id} className="overflow-hidden p-0">
                      <button
                        className="w-full flex items-center gap-3 p-4 text-left hover:bg-zinc-800/30 transition-colors"
                        onClick={() => setExpandedScene(open ? null : scene.scene_number)}
                      >
                        <div className="w-7 h-7 rounded-lg bg-violet-600/10 border border-violet-700/30 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-violet-400">{scene.scene_number}</span>
                        </div>
                        <p className="text-sm text-zinc-300 flex-1 truncate">{scene.narration_text}</p>
                        <span className="text-xs text-zinc-500 shrink-0">{scene.duration_seconds}s</span>
                        {open ? <ChevronUp className="w-4 h-4 text-zinc-500 shrink-0" /> : <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />}
                      </button>
                      {open && (
                        <div className="border-t border-zinc-800 p-4 space-y-3">
                          <div className="bg-zinc-800/60 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-xs font-medium text-zinc-400 flex items-center gap-1">
                                <FileText className="w-3 h-3" /> Narración
                              </p>
                              <button onClick={() => copy(scene.narration_text, `nar-${scene.scene_number}`)} className="text-zinc-500 hover:text-zinc-300">
                                {copiedKey === `nar-${scene.scene_number}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                            <p className="text-sm text-zinc-200">{scene.narration_text}</p>
                            {scene.emotion && <p className="text-xs text-zinc-500 mt-1">Emoción: {scene.emotion} · Cámara: {scene.camera_move}</p>}
                          </div>
                          {scene.image_prompt && (
                            <div className="bg-zinc-800/60 rounded-lg p-3">
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-xs font-medium text-blue-400 flex items-center gap-1">
                                  <ImageIcon className="w-3 h-3" /> Prompt de imagen
                                </p>
                                <button onClick={() => copy(scene.image_prompt!, `img-${scene.scene_number}`)} className="text-zinc-500 hover:text-zinc-300">
                                  {copiedKey === `img-${scene.scene_number}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                              <p className="text-sm text-zinc-300">{scene.image_prompt}</p>
                            </div>
                          )}
                          {scene.animation_prompt && (
                            <div className="bg-zinc-800/60 rounded-lg p-3">
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-xs font-medium text-purple-400 flex items-center gap-1">
                                  <Zap className="w-3 h-3" /> Prompt de animación
                                </p>
                                <button onClick={() => copy(scene.animation_prompt!, `anim-${scene.scene_number}`)} className="text-zinc-500 hover:text-zinc-300">
                                  {copiedKey === `anim-${scene.scene_number}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                              <p className="text-sm text-zinc-300">{scene.animation_prompt}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            </div>

            {/* Generated Images */}
            {imageAssets.length > 0 && (
              <Card>
                <div className="flex items-center gap-2 mb-4">
                  <ImageIcon className="w-4 h-4 text-blue-400" />
                  <h2 className="text-sm font-semibold text-white">Imágenes</h2>
                  <span className="ml-auto text-xs text-zinc-500">{imageAssets.length} escenas</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {imageAssets.map((asset, i) => (
                    <div key={asset.id} className="relative group">
                      <img
                        src={asset.public_url!}
                        alt={`Escena ${i + 1}`}
                        className="w-full aspect-[9/16] object-cover rounded-lg border border-zinc-700"
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 rounded-b-lg opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="text-xs text-zinc-300">Escena {i + 1}</p>
                        <a href={asset.public_url!} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline">Ver ↗</a>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Generated Videos */}
            {videoAssets.length > 0 && (
              <Card>
                <div className="flex items-center gap-2 mb-4">
                  <Film className="w-4 h-4 text-purple-400" />
                  <h2 className="text-sm font-semibold text-white">Clips animados</h2>
                  <span className="ml-auto text-xs text-zinc-500">{videoAssets.length} clips</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {videoAssets.map((asset, i) => (
                    <div key={asset.id} className="relative group">
                      <video
                        src={asset.public_url!}
                        className="w-full aspect-[9/16] object-cover rounded-lg border border-zinc-700"
                        controls playsInline muted
                      />
                      <div className="absolute top-2 left-2 bg-black/60 rounded px-1.5 py-0.5">
                        <p className="text-xs text-zinc-300">Escena {i + 1}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* SEO */}
            {seo && (
              <Card>
                <div className="flex items-center gap-2 mb-4">
                  <Hash className="w-4 h-4 text-emerald-400" />
                  <h2 className="text-sm font-semibold text-white">Paquete SEO</h2>
                </div>
                <div className="space-y-3">
                  <div className="bg-zinc-800/60 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-medium text-zinc-400">Título</p>
                      <button onClick={() => copy(seo.title, "seo-title")} className="text-zinc-500 hover:text-zinc-300">
                        {copiedKey === "seo-title" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <p className="text-sm text-zinc-200">{seo.title}</p>
                  </div>
                  <div className="bg-zinc-800/60 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-medium text-zinc-400">Descripción</p>
                      <button onClick={() => copy(seo.description, "seo-desc")} className="text-zinc-500 hover:text-zinc-300">
                        {copiedKey === "seo-desc" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <p className="text-sm text-zinc-300">{seo.description}</p>
                  </div>
                  <div className="bg-zinc-800/60 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-medium text-zinc-400">Hashtags</p>
                      <button onClick={() => copy(seoHashtags.join(" "), "seo-hash")} className="text-zinc-500 hover:text-zinc-300">
                        {copiedKey === "seo-hash" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {seoHashtags.map((h) => (
                        <span key={h} className="text-xs bg-zinc-700 text-zinc-300 rounded-full px-2 py-0.5">{h}</span>
                      ))}
                    </div>
                  </div>
                  {seo.thumbnail_concept && (
                    <div className="bg-zinc-800/60 rounded-lg p-3">
                      <p className="text-xs font-medium text-zinc-400 mb-1">Concepto de miniatura</p>
                      <p className="text-sm text-zinc-300">{seo.thumbnail_concept}</p>
                    </div>
                  )}
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </>
  );
}
