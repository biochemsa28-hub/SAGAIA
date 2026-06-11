"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { TopBar } from "@/components/layout/TopBar";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, truncate } from "@/lib/utils";
import { Film, PlusCircle, Zap, LayoutGrid, List } from "lucide-react";
import type { DbProject } from "@/lib/db/repository";

type ViewMode = "grid" | "list";

const STATUS_PROGRESS: Record<string, number> = {
  draft: 0, generating: 10, story_done: 20,
  voice_pending: 30, voice_done: 40,
  images_done: 60, videos_done: 80, ready: 100,
};

function ProgressPips({ status }: { status: string }) {
  const steps = [
    { key: "story",  label: "Historia", done: ["story_done","voice_pending","voice_done","images_done","videos_done","ready"].includes(status) },
    { key: "voice",  label: "Voz",      done: ["voice_done","images_done","videos_done","ready"].includes(status) },
    { key: "images", label: "Imágenes", done: ["images_done","videos_done","ready"].includes(status) },
    { key: "video",  label: "Video",    done: ["ready"].includes(status) },
  ];
  return (
    <div className="flex items-center gap-1">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-1">
          <div className={`w-1.5 h-1.5 rounded-full ${s.done ? "bg-emerald-400" : "bg-zinc-700"}`} />
          {i < steps.length - 1 && <div className={`w-3 h-px ${s.done ? "bg-emerald-700" : "bg-zinc-800"}`} />}
        </div>
      ))}
    </div>
  );
}

export default function LibraryPage() {
  const [projects, setProjects] = useState<DbProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("grid");

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d: { projects: DbProject[] }) => setProjects(d.projects ?? []))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <TopBar title="Biblioteca" subtitle="Todos tus proyectos" />
      <div className="p-6 space-y-5">

        {/* Header row */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-zinc-400">
            {loading ? "…" : `${projects.length} proyecto${projects.length !== 1 ? "s" : ""}`}
          </p>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center bg-zinc-800 rounded-lg p-1 gap-0.5">
              <button
                onClick={() => setView("grid")}
                className={`p-1.5 rounded-md transition-colors ${view === "grid" ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
                title="Vista grid"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setView("list")}
                className={`p-1.5 rounded-md transition-colors ${view === "list" ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
                title="Vista lista"
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
            <Link href="/dashboard/projects/new">
              <Button size="sm">
                <PlusCircle className="w-4 h-4" /> Nueva historia
              </Button>
            </Link>
          </div>
        </div>

        {/* Loading skeletons */}
        {loading && view === "grid" && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[1,2,3,4,5,6].map((i) => (
              <div key={i} className="rounded-2xl overflow-hidden bg-zinc-800/50 animate-pulse">
                <div className="aspect-[9/16] bg-zinc-700/50" />
                <div className="p-3 space-y-2">
                  <div className="h-3 bg-zinc-700 rounded w-3/4" />
                  <div className="h-2 bg-zinc-800 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {loading && view === "list" && (
          <div className="space-y-2">
            {[1,2,3].map((i) => <div key={i} className="h-16 rounded-xl bg-zinc-800/50 animate-pulse" />)}
          </div>
        )}

        {/* Empty state */}
        {!loading && projects.length === 0 && (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center mx-auto mb-4">
              <Film className="w-8 h-8 text-zinc-600" />
            </div>
            <p className="text-zinc-400 text-sm mb-1">No tienes historias aún</p>
            <p className="text-zinc-600 text-xs mb-5">Crea tu primera historia viral con IA</p>
            <Link href="/dashboard/projects/new">
              <Button size="sm">Crear ahora</Button>
            </Link>
          </div>
        )}

        {/* ── GRID VIEW ── */}
        {!loading && projects.length > 0 && view === "grid" && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {projects.map((p) => (
              <Link key={p.id} href={`/dashboard/projects/${p.id}`}>
                <div className="group rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-900 hover:border-violet-700/50 transition-all hover:shadow-lg hover:shadow-violet-900/10 cursor-pointer">

                  {/* Thumbnail — 9:16 */}
                  <div className="relative aspect-[9/16] bg-zinc-800 overflow-hidden">
                    {p.thumbnail_url ? (
                      <img
                        src={p.thumbnail_url}
                        alt={p.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-violet-950/50 to-zinc-900">
                        <Film className="w-8 h-8 text-zinc-700" />
                        <span className="text-xs text-zinc-600">Sin imagen</span>
                      </div>
                    )}

                    {/* Overlay top: status badge */}
                    <div className="absolute top-2 left-2">
                      <StatusBadge status={p.status} />
                    </div>

                    {/* Overlay bottom: progress pips */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-3">
                      <ProgressPips status={p.status} />
                    </div>

                    {/* Final video indicator */}
                    {p.final_video_url && (
                      <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-pink-600/90 flex items-center justify-center">
                        <Zap className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <p className="text-xs font-semibold text-white leading-tight line-clamp-2">{p.title}</p>
                    <p className="text-[10px] text-zinc-500 mt-1.5 flex items-center gap-1.5">
                      <span className="capitalize">{p.niche}</span>
                      <span className="text-zinc-700">·</span>
                      <span>{p.duration_target}</span>
                      <span className="text-zinc-700">·</span>
                      <span>{formatDate(p.created_at)}</span>
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* ── LIST VIEW ── */}
        {!loading && projects.length > 0 && view === "list" && (
          <div className="space-y-2">
            {projects.map((p) => (
              <Link key={p.id} href={`/dashboard/projects/${p.id}`}>
                <div className="flex items-center gap-3 p-3 rounded-xl border border-zinc-800 bg-zinc-900 hover:border-violet-700/40 hover:bg-zinc-800/60 transition-all cursor-pointer">

                  {/* Mini thumbnail */}
                  <div className="w-10 h-14 rounded-lg overflow-hidden bg-zinc-800 shrink-0">
                    {p.thumbnail_url ? (
                      <img src={p.thumbnail_url} alt={p.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Film className="w-4 h-4 text-zinc-600" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{truncate(p.title, 50)}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {p.niche} · {p.duration_target} · {(p.scene_count ?? 0)} escenas · {formatDate(p.created_at)}
                    </p>
                    <div className="mt-1.5">
                      <ProgressPips status={p.status} />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {p.final_video_url && (
                      <div className="w-6 h-6 rounded-full bg-pink-600/20 border border-pink-700/40 flex items-center justify-center">
                        <Zap className="w-3 h-3 text-pink-400" />
                      </div>
                    )}
                    <StatusBadge status={p.status} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

      </div>
    </>
  );
}
