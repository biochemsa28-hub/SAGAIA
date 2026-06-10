"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Download, Loader2, Film, FileText,
  Image as ImageIcon, Zap, Hash, ChevronDown, ChevronUp, Copy, Check, Mic,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import type { ProjectDetail } from "@/lib/db/repository";

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedScene, setExpandedScene] = useState<number | null>(1);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [generatingVoice, setGeneratingVoice] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const [generatingImages, setGeneratingImages] = useState(false);
  const [imageStatus, setImageStatus] = useState<string | null>(null);
  const [generatingVideos, setGeneratingVideos] = useState(false);
  const [videoStatus, setVideoStatus] = useState<string | null>(null);
  const [assembling, setAssembling] = useState(false);
  const [assembleStatus, setAssembleStatus] = useState<string | null>(null);
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${id}`)
      .then((r) => {
        if (r.status === 404) { router.push("/dashboard/library"); return null; }
        return r.json();
      })
      .then((d) => { if (d) setDetail(d as ProjectDetail); })
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [id, router]);

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  async function assembleVideo() {
    setAssembling(true);
    setAssembleStatus("Enviando a Creatomate…");
    setFinalVideoUrl(null);
    try {
      // Step 1: submit
      const submitRes = await fetch("/api/assemble", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: id, action: "submit", add_subtitles: true }),
      });
      const submitData = (await submitRes.json()) as { render_id?: string; output_url?: string; error?: string };
      if (!submitRes.ok || !submitData.render_id) {
        setAssembleStatus(submitData.error ?? "Error al enviar");
        return;
      }

      setAssembleStatus("⏳ Ensamblando video… (1-2 min)");
      const renderId = submitData.render_id;

      // Step 2: poll every 5s
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 5000));
        const checkRes = await fetch("/api/assemble", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project_id: id, action: "check", render_id: renderId }),
        });
        const checkData = (await checkRes.json()) as { status: string; url?: string; error?: string };

        if (checkData.status === "done" && checkData.url) {
          setAssembleStatus("✓ Video final listo");
          setFinalVideoUrl(checkData.url);
          return;
        }
        if (checkData.status === "failed") {
          setAssembleStatus(`Error: ${checkData.error ?? "render fallido"}`);
          return;
        }
        setAssembleStatus(`⏳ Ensamblando… (${checkData.status})`);
      }
      setAssembleStatus("Tiempo agotado — intenta de nuevo");
    } catch {
      setAssembleStatus("Error de conexión");
    } finally {
      setAssembling(false);
    }
  }

  async function generateVideos() {
    setGeneratingVideos(true);
    setVideoStatus("Enviando a Kling…");
    try {
      // Step 1: submit jobs (fast, returns request IDs)
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
        setVideoStatus(submitData.error ?? "Error al enviar");
        return;
      }

      const pendingJobs = submitData.jobs.filter((j) => j.request_id);
      setVideoStatus(`⏳ Animando ${pendingJobs.length} clips… (puede tardar 2-3 min)`);

      // Step 2: poll until all done
      let jobs = pendingJobs;
      let attempts = 0;
      while (attempts < 40) {
        await new Promise((r) => setTimeout(r, 5000)); // wait 5s between polls
        attempts++;

        const collectRes = await fetch("/api/videos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: id,
            action: "collect",
            jobs: jobs.map((j) => ({ scene_number: j.scene_number, request_id: j.request_id })),
          }),
        });
        const collectData = (await collectRes.json()) as {
          all_done: boolean;
          scenes: Array<{ scene_number: number; status: string }>;
        };

        const done = collectData.scenes.filter((s) => s.status === "completed").length;
        const total = jobs.length;
        setVideoStatus(`⏳ ${done}/${total} clips listos…`);

        if (collectData.all_done) {
          setVideoStatus(`✓ ${done}/${total} videos animados`);
          window.location.reload();
          return;
        }

        // Only keep pending jobs
        jobs = jobs.filter((j) => {
          const s = collectData.scenes.find((s) => s.scene_number === j.scene_number);
          return s?.status !== "completed" && s?.status !== "failed";
        });
      }

      setVideoStatus("Tiempo de espera agotado — recarga la página para ver resultados");
    } catch {
      setVideoStatus("Error de conexión");
    } finally {
      setGeneratingVideos(false);
    }
  }

  async function generateImages() {
    setGeneratingImages(true);
    setImageStatus(null);
    try {
      const res = await fetch("/api/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: id }),
      });
      const data = (await res.json()) as { success: boolean; succeeded: number; total: number; mock?: boolean };
      if (res.ok && data.success) {
        setImageStatus(`✓ ${data.succeeded}/${data.total} imágenes${data.mock ? " (mock)" : " generadas"}`);
      } else {
        setImageStatus("Error al generar imágenes");
      }
    } catch {
      setImageStatus("Error de conexión");
    } finally {
      setGeneratingImages(false);
    }
  }

  async function generateVoice() {
    setGeneratingVoice(true);
    setVoiceStatus(null);
    try {
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: id }),
      });
      const data = (await res.json()) as { success: boolean; succeeded: number; total: number; voice?: string; mock?: boolean };
      if (res.ok && data.success) {
        setVoiceStatus(`✓ ${data.succeeded}/${data.total} escenas${data.mock ? " (mock)" : ` — ${data.voice ?? ""}`}`);
      } else {
        setVoiceStatus("Error al generar voz");
      }
    } catch {
      setVoiceStatus("Error de conexión");
    } finally {
      setGeneratingVoice(false);
    }
  }

  async function downloadZip() {
    if (!detail?.story) return;
    setDownloading(true);
    try {
      // Reconstruct StoryOutput shape for the ZIP API
      const storyOutput = {
        meta: {
          title: detail.project.title,
          niche: detail.project.niche,
          tone: detail.project.tone,
          duration_target: detail.project.duration_target,
          language: detail.project.language,
          visual_style: detail.project.visual_style,
        },
        story: {
          hook: detail.story.hook,
          full_narrative: detail.story.full_narrative,
          cta: detail.story.cta,
        },
        scenes: detail.scenes.map((s) => ({
          scene_number: s.scene_number,
          narration_text: s.narration_text,
          duration_seconds: s.duration_seconds,
          image_prompt: s.image_prompt ?? "",
          animation_prompt: s.animation_prompt ?? "",
          emotion: s.emotion ?? "",
          camera_move: s.camera_move ?? "",
        })),
        seo: detail.seo
          ? {
              title: detail.seo.title,
              description: detail.seo.description,
              hashtags: JSON.parse(detail.seo.hashtags) as string[],
              tags: JSON.parse(detail.seo.tags) as string[],
              thumbnail_concept: detail.seo.thumbnail_concept ?? "",
              thumbnail_prompt: detail.seo.thumbnail_prompt ?? "",
            }
          : undefined,
        production_notes: {
          total_duration_seconds: detail.story.total_duration_seconds,
          scene_count: detail.story.scene_count,
          voice_style: detail.story.voice_style ?? "neutral",
          music_mood: detail.story.music_mood ?? "neutral",
        },
      };

      const res = await fetch(`/api/export/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

  return (
    <>
      <TopBar title={project.title} subtitle={`${project.niche} · ${project.duration_target}`} />
      <div className="p-6 space-y-6">

        {/* Back + Header */}
        <div className="flex items-start justify-between gap-4">
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
                <span className="text-xs text-zinc-600">·</span>
                <span className="text-xs text-zinc-500 capitalize">{project.ai_provider}</span>
              </div>
              <h1 className="text-lg font-bold text-white">{project.title}</h1>
            </div>
          </div>

          {story && (
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex gap-2 flex-wrap justify-end">
                <Button
                  onClick={assembleVideo}
                  disabled={assembling}
                  className="shrink-0 bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500"
                >
                  {assembling
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Zap className="w-4 h-4" />}
                  Video final
                </Button>
                <Button
                  onClick={generateVideos}
                  disabled={generatingVideos}
                  variant="outline"
                  className="shrink-0"
                >
                  {generatingVideos
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Film className="w-4 h-4" />}
                  Animar clips
                </Button>
                <Button
                  onClick={generateImages}
                  disabled={generatingImages}
                  variant="outline"
                  className="shrink-0"
                >
                  {generatingImages
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <ImageIcon className="w-4 h-4" />}
                  Generar imágenes
                </Button>
                <Button
                  onClick={generateVoice}
                  disabled={generatingVoice}
                  variant="outline"
                  className="shrink-0"
                >
                  {generatingVoice
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Mic className="w-4 h-4" />}
                  Generar voz
                </Button>
                <Button onClick={downloadZip} disabled={downloading} className="shrink-0">
                  {downloading
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Download className="w-4 h-4" />}
                  Exportar ZIP
                </Button>
              </div>
              {assembleStatus && <p className="text-xs text-zinc-400">{assembleStatus}</p>}
              {videoStatus && <p className="text-xs text-zinc-400">{videoStatus}</p>}
              {imageStatus && <p className="text-xs text-zinc-400">{imageStatus}</p>}
              {voiceStatus && <p className="text-xs text-zinc-400">{voiceStatus}</p>}
            </div>
          )}
        </div>

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
            {/* Story overview */}
            <Card>
              <div className="flex items-center gap-2 mb-4">
                <FileText className="w-4 h-4 text-violet-400" />
                <h2 className="text-sm font-semibold text-white">Historia</h2>
                <span className="ml-auto text-xs text-zinc-500">
                  {story.scene_count} escenas · {story.total_duration_seconds}s · {story.voice_style ?? "neutral"} · {story.music_mood ?? ""}
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
                  <h2 className="text-sm font-semibold text-white">Imágenes generadas</h2>
                  <span className="ml-auto text-xs text-zinc-500">{imageAssets.length} imágenes · Flux Schnell</span>
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
                        <a
                          href={asset.public_url!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-400 hover:underline"
                        >
                          Ver original ↗
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Final assembled video */}
            {displayFinalUrl && (
              <Card>
                <div className="flex items-center gap-2 mb-4">
                  <Zap className="w-4 h-4 text-pink-400" />
                  <h2 className="text-sm font-semibold text-white">Video final</h2>
                  <span className="ml-auto text-xs text-zinc-500">Creatomate · 1080×1920</span>
                </div>
                <div className="max-w-xs mx-auto">
                  <video
                    src={displayFinalUrl}
                    className="w-full aspect-[9/16] object-cover rounded-xl border border-zinc-700"
                    controls
                    playsInline
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
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-2 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg transition-colors"
                    >
                      ↗ Abrir
                    </a>
                  </div>
                </div>
              </Card>
            )}

            {/* Generated Videos */}
            {videoAssets.length > 0 && (
              <Card>
                <div className="flex items-center gap-2 mb-4">
                  <Film className="w-4 h-4 text-purple-400" />
                  <h2 className="text-sm font-semibold text-white">Videos animados</h2>
                  <span className="ml-auto text-xs text-zinc-500">{videoAssets.length} clips · Kling v1.6</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {videoAssets.map((asset, i) => (
                    <div key={asset.id} className="relative group">
                      <video
                        src={asset.public_url!}
                        className="w-full aspect-[9/16] object-cover rounded-lg border border-zinc-700"
                        controls
                        playsInline
                        muted
                      />
                      <div className="absolute top-2 left-2 bg-black/60 rounded px-1.5 py-0.5">
                        <p className="text-xs text-zinc-300">Escena {i + 1}</p>
                      </div>
                      <a
                        href={asset.public_url!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="absolute top-2 right-2 bg-black/60 rounded px-1.5 py-0.5 text-xs text-blue-400 hover:text-blue-300"
                      >
                        ↗
                      </a>
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
