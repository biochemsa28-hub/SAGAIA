"use client";
import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import confetti from "canvas-confetti";
import { track } from "@/components/providers/PostHogProvider";
import {
  ArrowLeft, Download, Loader2, Sparkles, CheckCircle2,
  Copy, Check, PlusCircle, Clock, TrendingUp, MessageSquare,
  Hash, Lightbulb, Target,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";
import type { ProjectDetail } from "@/lib/db/repository";

type StepId = "voice" | "images" | "clips" | "final";
type StepStatus = "pending" | "running" | "done" | "error";

const STEP_LABELS: Record<StepId, { emoji: string; label: string; tip: string }> = {
  voice:  { emoji: "🎤", label: "Creando la voz",       tip: "Narrando tu historia…"      },
  images: { emoji: "🖼️", label: "Generando escenas",    tip: "Visualizando cada momento…" },
  clips:  { emoji: "🎬", label: "Animando los clips",   tip: "Dando vida a las imágenes…" },
  final:  { emoji: "⚡", label: "Ensamblando el video", tip: "Últimos toques de magia…"   },
};

const STEP_IDS: StepId[] = ["voice", "images", "clips", "final"];

// Best posting times per platform
const PLATFORM_TIPS: Record<string, { icon: string; times: string; tip: string }> = {
  tiktok:    { icon: "🎵", times: "7–9 am · 12–3 pm · 7–11 pm",  tip: "Publica 1–3 veces al día. Responde comentarios en la primera hora." },
  instagram: { icon: "📸", times: "6–9 am · 12–2 pm · 5–8 pm",   tip: "Agrega a Reels para mayor alcance. Usa los primeros 3 seg para enganchar." },
  youtube:   { icon: "▶️", times: "2–4 pm · 8–11 pm",             tip: "Shorts de menos de 60 seg tienen prioridad en el algoritmo." },
  facebook:  { icon: "👥", times: "9 am · 1–3 pm · 7–9 pm",       tip: "Comparte en grupos de nicho para alcance orgánico extra." },
};

function CopyField({ label, value, copyKey, icon: Icon }: {
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
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);
  const [stepStatus, setStepStatus] = useState<Record<StepId, StepStatus>>({
    voice: "pending", images: "pending", clips: "pending", final: "pending",
  });
  const [producing, setProducing] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
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
        const assets = (d as ProjectDetail).assets ?? [];
        setStepStatus({
          voice:  assets.some((a) => a.asset_type === "audio")       ? "done" : "pending",
          images: assets.some((a) => a.asset_type === "image")       ? "done" : "pending",
          clips:  assets.some((a) => a.asset_type === "video")       ? "done" : "pending",
          final:  assets.some((a) => a.asset_type === "final_video") ? "done" : "pending",
        });
        const fv = assets.find((a) => a.asset_type === "final_video");
        if (fv?.public_url) setFinalVideoUrl(fv.public_url);
      })
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [id, router]);

  function setStep(step: StepId, status: StepStatus) {
    setStepStatus((p) => ({ ...p, [step]: status }));
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

  async function runClips() {
    setStep("clips", "running");
    const submitRes = await fetch("/api/videos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project_id: id, action: "submit" }) });
    const submitData = await submitRes.json() as { success: boolean; jobs: Array<{ scene_number: number; request_id: string; status: string; error?: string }>; error?: string };
    if (!submitRes.ok || !submitData.success) { setStep("clips", "error"); throw new Error(submitData.error ?? "Error al enviar clips"); }

    // Fail fast: if ALL jobs failed at submit, don't wait 200s
    let jobs = submitData.jobs.filter((j) => j.request_id);
    if (!jobs.length) {
      const firstError = submitData.jobs[0]?.error ?? "Fal.ai no aceptó los trabajos de video";
      setStep("clips", "error");
      throw new Error(`Clips fallaron al enviar: ${firstError}`);
    }

    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const collectRes = await fetch("/api/videos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project_id: id, action: "collect", jobs: jobs.map((j) => ({ scene_number: j.scene_number, request_id: j.request_id })) }) });
      const collectData = await collectRes.json() as { all_done: boolean; scenes: Array<{ scene_number: number; status: string }> };
      if (collectData.all_done) { setStep("clips", "done"); return; }
      jobs = jobs.filter((j) => { const s = collectData.scenes.find((s) => s.scene_number === j.scene_number); return s?.status !== "completed" && s?.status !== "failed"; });
      if (!jobs.length) { setStep("clips", "error"); throw new Error("Todos los clips fallaron"); }
    }
    setStep("clips", "error"); throw new Error("Clips timeout: Kling tardó más de lo esperado");
  }

  async function runFinal() {
    setStep("final", "running");
    setFinalVideoUrl(null);
    const submitRes = await fetch("/api/assemble", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project_id: id, action: "submit", add_subtitles: true }) });
    const submitData = await submitRes.json() as { render_id?: string; error?: string };
    if (!submitRes.ok || !submitData.render_id) { setStep("final", "error"); throw new Error(submitData.error); }
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const checkRes = await fetch("/api/assemble", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project_id: id, action: "check", render_id: submitData.render_id }) });
      const checkData = await checkRes.json() as { status: string; url?: string; error?: string };
      if (checkData.status === "done" && checkData.url) { setStep("final", "done"); setFinalVideoUrl(checkData.url); return; }
      if (checkData.status === "failed") { setStep("final", "error"); throw new Error("render failed"); }
    }
    setStep("final", "error"); throw new Error("final timeout");
  }

  async function produceAll() {
    track("production_started", { project_id: id });
    setProducing(true);
    setHasError(false);
    setErrorDetail(null);
    try {
      if (stepStatus.voice  !== "done") await runVoice();
      if (stepStatus.images !== "done") await runImages();
      if (stepStatus.clips  !== "done") await runClips();
      await runFinal();
      toast("🎉 ¡Tu video está listo!", "success");
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 }, colors: ["#7c3aed", "#ec4899", "#f59e0b", "#10b981", "#fff"] });
      setTimeout(() => confetti({ particleCount: 60, spread: 120, origin: { y: 0.4 }, colors: ["#7c3aed", "#ec4899", "#fff"] }), 300);
      setTimeout(() => window.location.reload(), 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setHasError(true);
      setErrorDetail(msg);
      toast("Algo salió mal. Ve el detalle abajo.", "error");
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

  const allDone = STEP_IDS.every((s) => stepStatus[s] === "done");
  const doneCount = STEP_IDS.filter((s) => stepStatus[s] === "done").length;
  const progress = Math.round((doneCount / STEP_IDS.length) * 100);
  const activeStep = STEP_IDS.find((s) => stepStatus[s] === "running");
  const activeMeta = activeStep ? STEP_LABELS[activeStep] : null;

  // Full caption for sharing: title + description + hashtags
  const fullCaption = seo
    ? `${clean(seo.title)}\n\n${clean(seo.description)}\n\n${seoHashtags.join(" ")}`
    : project.title;

  return (
    <>
      <TopBar title="Tu video" subtitle={project.niche} />
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

            {/* Crear otro */}
            <Link href="/dashboard/projects/new">
              <button className="w-full flex items-center justify-center gap-2 border border-zinc-700 hover:border-violet-600/60 text-zinc-400 hover:text-violet-300 font-medium py-3.5 rounded-xl transition-all text-sm">
                <PlusCircle className="w-4 h-4" />
                Crear otro video
              </button>
            </Link>
          </>
        )}

        {/* ── PRODUCIENDO ───────────────────────────────────────────────────── */}
        {producing && !finalVideoUrl && (
          <div className="space-y-5">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-950/80 to-zinc-900 border border-violet-700/30 p-8 text-center">
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-violet-600/20 rounded-full blur-3xl animate-pulse" />
              </div>
              <div className="relative">
                <div className="text-5xl mb-4">{activeMeta?.emoji ?? "✨"}</div>
                <h2 className="text-lg font-bold text-white mb-1">{activeMeta?.label ?? "Preparando…"}</h2>
                <p className="text-sm text-zinc-400">{activeMeta?.tip ?? "Esto puede tardar unos minutos"}</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-zinc-500">
                <span>Creando tu video</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-violet-500 to-pink-500 rounded-full transition-all duration-700"
                  style={{ width: `${progress}%` }}
                />
              </div>
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
                    : "Toca el botón para crear tu video con IA. Tarda unos 7 minutos."}
                </p>
                {hasError && errorDetail && (
                  <div className="mb-4 text-left bg-red-950/40 border border-red-800/40 rounded-xl px-4 py-3">
                    <p className="text-xs font-semibold text-red-400 mb-1">Detalle del error:</p>
                    <p className="text-xs text-red-300 font-mono break-words">{errorDetail}</p>
                  </div>
                )}
                <button
                  onClick={produceAll}
                  className="inline-flex items-center gap-3 bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 text-white font-bold text-base px-8 py-4 rounded-2xl transition-all shadow-lg shadow-violet-900/40 hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Sparkles className="w-5 h-5" />
                  {hasError ? "Reintentar" : "Crear mi video"}
                </button>
                <p className="text-xs text-zinc-600 mt-4">~7 minutos · Completamente automático</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {STEP_IDS.map((sid) => {
                const meta = STEP_LABELS[sid];
                const st = stepStatus[sid];
                return (
                  <div key={sid} className={`rounded-xl p-3.5 border text-center ${
                    st === "done"    ? "bg-emerald-950/20 border-emerald-800/30" :
                    st === "error"   ? "bg-red-950/20 border-red-800/30" :
                    st === "running" ? "bg-violet-950/20 border-violet-700/30" :
                    "bg-zinc-900 border-zinc-800"
                  }`}>
                    <div className="text-2xl mb-1.5">
                      {st === "done" ? "✅" : st === "error" ? "❌" : st === "running" ? "⏳" : meta.emoji}
                    </div>
                    <p className={`text-xs font-medium ${
                      st === "done"    ? "text-emerald-400" :
                      st === "error"   ? "text-red-400" :
                      st === "running" ? "text-violet-400" :
                      "text-zinc-400"
                    }`}>{meta.label}</p>
                  </div>
                );
              })}
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
