"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { TopBar } from "@/components/layout/TopBar";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, truncate } from "@/lib/utils";
import { Film, PlusCircle, Download } from "lucide-react";
import type { DbProject } from "@/lib/db/repository";

export default function LibraryPage() {
  const [projects, setProjects] = useState<DbProject[]>([]);
  const [loading, setLoading] = useState(true);

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

        <div className="flex items-center justify-between">
          <p className="text-sm text-zinc-400">{loading ? "…" : `${projects.length} proyectos`}</p>
          <Link href="/dashboard/projects/new">
            <Button size="sm">
              <PlusCircle className="w-4 h-4" /> Nuevo
            </Button>
          </Link>
        </div>

        {loading && (
          <div className="grid gap-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-zinc-800/50 animate-pulse" />)}
          </div>
        )}

        {!loading && projects.length === 0 && (
          <Card className="text-center py-12">
            <Film className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
            <p className="text-zinc-400 text-sm mb-4">No tienes proyectos aún.</p>
            <Link href="/dashboard/projects/new">
              <Button size="sm">Crear el primero</Button>
            </Link>
          </Card>
        )}

        {!loading && projects.length > 0 && (
          <div className="grid gap-3">
            {projects.map((p) => (
              <Link key={p.id} href={`/dashboard/projects/${p.id}`}>
                <Card hover className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-violet-600/10 border border-violet-700/30 flex items-center justify-center shrink-0">
                    <Film className="w-5 h-5 text-violet-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white">{truncate(p.title, 50)}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {p.niche} · {p.duration_target} · {(p.scene_count ?? 0)} escenas · {formatDate(p.created_at)}
                    </p>
                  </div>
                  <StatusBadge status={p.status} />
                  {p.status === "ready" && (
                    <div className="w-8 h-8 rounded-lg bg-emerald-600/10 border border-emerald-700/30 flex items-center justify-center shrink-0">
                      <Download className="w-4 h-4 text-emerald-400" />
                    </div>
                  )}
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
