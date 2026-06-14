"use client";
import { useSearchParams, useParams } from "next/navigation";
import { useState } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { StoryOutput } from "@/lib/validators/story.schema";
import {
  Download, FileText, Table, FileJson,
  Hash, CheckCircle, Copy, ChevronDown, ChevronUp,
} from "lucide-react";

export default function ExportPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [expandedScene, setExpandedScene] = useState<number | null>(1);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Get story data from query param (passed from wizard)
  const rawData = searchParams.get("data");
  const story: StoryOutput | null = rawData ? JSON.parse(decodeURIComponent(rawData)) as StoryOutput : null;

  if (!story) {
    return (
      <>
        <TopBar title="Exportar" />
        <div className="p-6">
          <Card>
            <p className="text-zinc-400 text-sm">No se encontraron datos del proyecto.</p>
          </Card>
        </div>
      </>
    );
  }

  async function downloadZip() {
    if (!story) return;
    setDownloading(true);
    try {
      const res = await fetch(`/api/export/${params.id as string}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(story),
      });
      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vynavo_${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setDownloaded(true);
    } catch {
      alert("Error al exportar. Intenta de nuevo.");
    } finally {
      setDownloading(false);
    }
  }

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  const totalPrompts = story.scenes.length * 2; // image + animation
  const pct = story.production_notes.total_duration_seconds;

  return (
    <>
      <TopBar title="Exportar proyecto" subtitle={story.meta.title} />
      <div className="max-w-3xl mx-auto p-6 space-y-6">

        {/* Header Card */}
        <Card className="bg-gradient-to-r from-violet-900/40 to-zinc-900 border-violet-700/30">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h2 className="text-lg font-bold text-white mb-1">{story.meta.title}</h2>
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge variant="purple">{story.meta.niche}</Badge>
                <Badge variant="info">{story.meta.tone}</Badge>
                <Badge variant="default">{story.meta.duration_target}</Badge>
                <Badge variant="default">{story.meta.visual_style}</Badge>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                {[
                  { label: "Escenas", value: story.scenes.length },
                  { label: "Prompts", value: totalPrompts },
                  { label: "Duración", value: `${pct}s` },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-zinc-800/50 rounded-lg py-2">
                    <p className="text-lg font-bold text-violet-400">{value}</p>
                    <p className="text-xs text-zinc-500">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Download ZIP */}
        <Card>
          <h3 className="text-base font-semibold text-white mb-1">Descargar paquete completo</h3>
          <p className="text-sm text-zinc-400 mb-4">Un ZIP con todos los archivos organizados y listos para usar.</p>

          <div className="grid grid-cols-2 gap-3 mb-5">
            {[
              { icon: FileText,  label: "script.txt",      desc: "Guion completo" },
              { icon: Table,     label: "prompts.csv",     desc: `${totalPrompts} prompts` },
              { icon: FileJson,  label: "metadata.json",   desc: "Datos completos" },
              { icon: Hash,      label: "seo.txt",         desc: "Título, hashtags, tags" },
            ].map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex items-center gap-3 bg-zinc-800/50 rounded-lg p-3">
                <Icon className="w-5 h-5 text-violet-400 shrink-0" />
                <div>
                  <p className="text-xs font-mono font-medium text-zinc-200">{label}</p>
                  <p className="text-xs text-zinc-500">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          {downloaded ? (
            <div className="flex items-center gap-2 text-emerald-400 text-sm">
              <CheckCircle className="w-5 h-5" />
              <span>ZIP descargado correctamente</span>
            </div>
          ) : (
            <Button size="lg" className="w-full" loading={downloading} onClick={downloadZip}>
              <Download className="w-5 h-5" />
              {downloading ? "Generando ZIP…" : "Descargar ZIP completo"}
            </Button>
          )}
        </Card>

        {/* Hook & CTA */}
        <Card>
          <h3 className="text-base font-semibold text-white mb-4">Historia</h3>
          <div className="space-y-3">
            <CopyBlock label="🎣 Gancho de apertura" text={story.story.hook} onCopy={(t) => copyText(t, "hook")} copied={copiedKey === "hook"} />
            <CopyBlock label="📢 Call to Action" text={story.story.cta} onCopy={(t) => copyText(t, "cta")} copied={copiedKey === "cta"} />
          </div>
        </Card>

        {/* Scenes */}
        <Card>
          <h3 className="text-base font-semibold text-white mb-4">Escenas ({story.scenes.length})</h3>
          <div className="space-y-2">
            {story.scenes.map((scene) => (
              <div key={scene.scene_number} className="border border-zinc-800 rounded-lg overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-800/40 transition-colors"
                  onClick={() => setExpandedScene(expandedScene === scene.scene_number ? null : scene.scene_number)}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-violet-600/20 border border-violet-700/40 text-violet-400 text-xs font-bold flex items-center justify-center shrink-0">
                      {scene.scene_number}
                    </span>
                    <span className="text-sm text-zinc-300 text-left line-clamp-1">{scene.narration_text.slice(0, 60)}…</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="default">{scene.duration_seconds}s</Badge>
                    {expandedScene === scene.scene_number ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
                  </div>
                </button>

                {expandedScene === scene.scene_number && (
                  <div className="px-4 pb-4 space-y-3 border-t border-zinc-800 pt-3">
                    <CopyBlock label="🎙 Narración" text={scene.narration_text} onCopy={(t) => copyText(t, `narr-${scene.scene_number}`)} copied={copiedKey === `narr-${scene.scene_number}`} />
                    <CopyBlock label="🖼 Prompt de imagen (Midjourney)" text={scene.image_prompt} onCopy={(t) => copyText(t, `img-${scene.scene_number}`)} copied={copiedKey === `img-${scene.scene_number}`} mono />
                    <CopyBlock label="🎬 Prompt de animación (Kling/Runway)" text={scene.animation_prompt} onCopy={(t) => copyText(t, `anim-${scene.scene_number}`)} copied={copiedKey === `anim-${scene.scene_number}`} mono />
                    <div className="flex gap-2 text-xs text-zinc-500">
                      <span>Emoción: <span className="text-zinc-300">{scene.emotion}</span></span>
                      <span>·</span>
                      <span>Cámara: <span className="text-zinc-300">{scene.camera_move}</span></span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* SEO */}
        <Card>
          <h3 className="text-base font-semibold text-white mb-4">Paquete SEO</h3>
          <div className="space-y-3">
            <CopyBlock label="Título" text={story.seo.title} onCopy={(t) => copyText(t, "title")} copied={copiedKey === "title"} />
            <CopyBlock label="Descripción" text={story.seo.description} onCopy={(t) => copyText(t, "desc")} copied={copiedKey === "desc"} />
            <CopyBlock label="Hashtags" text={story.seo.hashtags.join(" ")} onCopy={(t) => copyText(t, "hashtags")} copied={copiedKey === "hashtags"} mono />
            <CopyBlock label="Tags" text={story.seo.tags.join(", ")} onCopy={(t) => copyText(t, "tags")} copied={copiedKey === "tags"} />
            <CopyBlock label="🖼 Prompt Miniatura" text={story.seo.thumbnail_prompt} onCopy={(t) => copyText(t, "thumb")} copied={copiedKey === "thumb"} mono />
          </div>
        </Card>

        {/* Production Notes */}
        <Card className="border-dashed border-zinc-700">
          <h3 className="text-sm font-semibold text-zinc-400 mb-3">Notas de producción</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-zinc-500">Voz:</span> <span className="text-zinc-200">{story.production_notes.voice_style}</span></div>
            <div><span className="text-zinc-500">Música:</span> <span className="text-zinc-200">{story.production_notes.music_mood}</span></div>
          </div>
        </Card>

      </div>
    </>
  );
}

// ── Shared CopyBlock component ────────────────────────────────────────────────

function CopyBlock({
  label, text, onCopy, copied, mono = false
}: {
  label: string; text: string; onCopy: (t: string) => void; copied: boolean; mono?: boolean;
}) {
  return (
    <div className="bg-zinc-800/50 rounded-lg p-3 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-400">{label}</span>
        <button
          onClick={() => onCopy(text)}
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-violet-400 transition-colors"
        >
          {copied ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
      <p className={`text-xs text-zinc-300 leading-relaxed ${mono ? "font-mono" : ""}`}>{text}</p>
    </div>
  );
}
