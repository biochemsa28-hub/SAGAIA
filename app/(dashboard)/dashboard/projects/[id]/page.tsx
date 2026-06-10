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

  const { project, story, scenes, seo } = detail;
  const seoHashtags: string[] = seo ? (JSON.parse(seo.hashtags) as string[]) : [];

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
