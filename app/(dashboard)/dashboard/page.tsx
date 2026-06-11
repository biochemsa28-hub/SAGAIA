"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import {
  PlusCircle, Film, Sparkles, Download,
  TrendingUp, Clock, CheckCircle, LogOut,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { formatDate, truncate } from "@/lib/utils";
import type { DbProject } from "@/lib/db/repository";

interface DashboardData {
  projects: DbProject[];
  stats: { total: number; ready: number; generating: number; scenes: number };
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d: DashboardData) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const stats = data?.stats ?? { total: 0, ready: 0, generating: 0, scenes: 0 };
  const STATS = [
    { label: "Proyectos totales",    value: String(stats.total),      icon: Film,        color: "text-violet-400" },
    { label: "Listos para exportar", value: String(stats.ready),      icon: CheckCircle, color: "text-emerald-400" },
    { label: "En progreso",          value: String(stats.generating), icon: Clock,       color: "text-amber-400" },
    { label: "Escenas generadas",    value: String(stats.scenes),     icon: TrendingUp,  color: "text-blue-400" },
  ];

  return (
    <>
      <TopBar
        title="Dashboard"
        subtitle={`Bienvenido, ${session?.user?.name ?? ""}`.trim()}
        actions={
          <button onClick={() => signOut({ callbackUrl: "/login" })} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
            <LogOut className="w-3.5 h-3.5" />
            Salir
          </button>
        }
      />
      <div className="p-6 space-y-6">

        {/* Hero CTA */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-900/60 to-purple-900/40 border border-violet-700/30 p-6">
          <div className="absolute inset-0 bg-gradient-to-r from-violet-600/5 to-transparent" />
          <div className="relative flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-5 h-5 text-violet-400" />
                <span className="text-violet-400 text-sm font-medium">IA lista</span>
              </div>
              <h2 className="text-xl font-bold text-white mb-1">Crea tu próxima microhistoria</h2>
              <p className="text-zinc-400 text-sm">De idea a paquete completo en menos de 5 minutos.</p>
            </div>
            <Link href="/dashboard/projects/new">
              <Button size="lg" className="shrink-0">
                <PlusCircle className="w-5 h-5" />
                Nuevo proyecto
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {STATS.map(({ label, value, icon: Icon, color }) => (
            <Card key={label} className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{value}</p>
                <p className="text-xs text-zinc-500">{label}</p>
              </div>
            </Card>
          ))}
        </div>

        {/* Recent Projects */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-white">Proyectos recientes</h3>
            <Link href="/dashboard/library" className="text-xs text-violet-400 hover:text-violet-300 transition-colors">
              Ver todos →
            </Link>
          </div>

          {loading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-xl bg-zinc-800/50 animate-pulse" />
              ))}
            </div>
          )}

          {!loading && data?.projects.length === 0 && (
            <Card className="text-center py-10">
              <Film className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
              <p className="text-zinc-400 text-sm">Aún no tienes proyectos.</p>
              <Link href="/dashboard/projects/new">
                <Button size="sm" className="mt-4">Crear el primero</Button>
              </Link>
            </Card>
          )}

          {!loading && data && data.projects.length > 0 && (
            <div className="space-y-3">
              {data.projects.slice(0, 5).map((p) => (
                <Link key={p.id} href={`/dashboard/projects/${p.id}`}>
                  <Card hover className="flex items-center gap-4 py-4">
                    <div className="w-10 h-10 rounded-lg bg-violet-600/10 border border-violet-700/30 flex items-center justify-center shrink-0">
                      <Film className="w-5 h-5 text-violet-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{truncate(p.title, 48)}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {p.niche} · {p.duration_target} · {formatDate(p.created_at)}
                      </p>
                    </div>
                    <StatusBadge status={p.status} />
                    {p.status === "ready" && (
                      <button
                        className="w-8 h-8 rounded-lg bg-emerald-600/10 border border-emerald-700/30 flex items-center justify-center hover:bg-emerald-600/20 transition-colors"
                        onClick={(e) => { e.preventDefault(); }}
                      >
                        <Download className="w-4 h-4 text-emerald-400" />
                      </button>
                    )}
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Quick Tips */}
        <Card className="border-dashed border-zinc-700">
          <h4 className="text-sm font-semibold text-zinc-300 mb-3">🚀 Flujo de producción</h4>
          <div className="grid grid-cols-3 gap-4">
            {[
              { step: "1", label: "Elige nicho y tema",     desc: "Terror, romance, misterio, inspiracional…" },
              { step: "2", label: "SAGAIA lo produce todo", desc: "Voz, imágenes, clips animados y video final con IA" },
              { step: "3", label: "Descarga y publica",    desc: "Video MP4 listo para TikTok, Reels e YouTube Shorts" },
            ].map(({ step, label, desc }) => (
              <div key={step} className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-violet-600/20 border border-violet-700/40 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-violet-400">{step}</span>
                </div>
                <div>
                  <p className="text-xs font-medium text-zinc-300">{label}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
