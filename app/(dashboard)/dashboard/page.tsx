"use client";
import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import {
  PlusCircle, Film, Sparkles, Download,
  TrendingUp, Clock, CheckCircle, LogOut, PartyPopper,
  Mic, ImageIcon, Video, Zap, ArrowRight, Play,
} from "lucide-react";

// Isolated component so useSearchParams doesn't break SSR prerender
function PaymentBanner() {
  const params = useSearchParams();
  const paymentSuccess = params.get("payment") === "success";
  const paymentPlan = params.get("plan");
  if (!paymentSuccess) return null;
  return (
    <div className="flex items-center gap-3 bg-emerald-950/50 border border-emerald-700/40 rounded-xl px-4 py-3">
      <PartyPopper className="w-5 h-5 text-emerald-400 shrink-0" />
      <div>
        <p className="text-sm font-semibold text-emerald-300">¡Pago exitoso!</p>
        <p className="text-xs text-emerald-600">
          Tu plan <span className="capitalize font-medium text-emerald-400">{paymentPlan}</span> está activo — los créditos ya aparecen en tu cuenta.
        </p>
      </div>
    </div>
  );
}
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

        {/* Payment success banner */}
        <Suspense fallback={null}>
          <PaymentBanner />
        </Suspense>

        {/* Hero CTA — only shown when user already has projects */}
        {(data?.projects.length ?? 0) > 0 && (
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-900/60 to-purple-900/40 border border-violet-700/30 p-6">
            <div className="absolute inset-0 bg-gradient-to-r from-violet-600/5 to-transparent" />
            <div className="relative flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-5 h-5 text-violet-400" />
                  <span className="text-violet-400 text-sm font-medium">IA lista</span>
                </div>
                <h2 className="text-xl font-bold text-white mb-1">Crea tu próxima historia viral</h2>
                <p className="text-zinc-400 text-sm">De idea a video completo en menos de 5 minutos.</p>
              </div>
              <Link href="/dashboard/projects/new">
                <Button size="lg" className="shrink-0">
                  <PlusCircle className="w-5 h-5" />
                  Nueva historia
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* ── ONBOARDING: shown only when 0 projects ── */}
        {!loading && data?.projects.length === 0 && (
          <div className="space-y-6">

            {/* Hero */}
            <div className="relative overflow-hidden rounded-3xl border border-violet-700/30 bg-gradient-to-br from-violet-950/80 via-zinc-900 to-zinc-950 p-10 text-center">
              {/* Glow background */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-48 bg-violet-600/20 rounded-full blur-3xl" />
                <div className="absolute bottom-0 right-1/4 w-64 h-32 bg-pink-600/10 rounded-full blur-3xl" />
              </div>

              <div className="relative">
                {/* Animated badge */}
                <div className="inline-flex items-center gap-2 bg-violet-600/15 border border-violet-600/30 rounded-full px-4 py-1.5 mb-6">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                  <span className="text-xs text-violet-300 font-medium">IA lista para crear</span>
                </div>

                {/* Headline */}
                <h2 className="text-4xl font-extrabold text-white mb-3 leading-tight">
                  Tu primera historia viral<br />
                  <span className="bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent">
                    te está esperando
                  </span>
                </h2>
                <p className="text-zinc-400 text-base mb-8 max-w-md mx-auto">
                  Elige un tema, SAGAIA genera la historia, la voz, las imágenes y el video completo. Listo para publicar.
                </p>

                {/* Main CTA */}
                <Link href="/dashboard/projects/new">
                  <button className="inline-flex items-center gap-3 bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 text-white font-bold text-base px-8 py-4 rounded-2xl transition-all shadow-lg shadow-violet-900/40 hover:shadow-violet-900/60 hover:scale-[1.02] active:scale-[0.98]">
                    <Sparkles className="w-5 h-5" />
                    Generar mi primera historia
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </Link>

                <p className="text-xs text-zinc-600 mt-4">Tarda menos de 2 minutos · Consume 1 crédito</p>
              </div>
            </div>

            {/* What SAGAIA produces */}
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-widest font-semibold text-center mb-4">Lo que SAGAIA genera por ti</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { icon: Mic,       color: "text-emerald-400", bg: "bg-emerald-600/10 border-emerald-700/30", label: "Voz",         desc: "Narración profesional con ElevenLabs" },
                  { icon: ImageIcon, color: "text-blue-400",    bg: "bg-blue-600/10 border-blue-700/30",       label: "Imágenes",    desc: "Escenas visuales con Flux Schnell" },
                  { icon: Video,     color: "text-purple-400",  bg: "bg-purple-600/10 border-purple-700/30",   label: "Clips",       desc: "Animaciones cinematográficas Kling" },
                  { icon: Zap,       color: "text-pink-400",    bg: "bg-pink-600/10 border-pink-700/30",       label: "Video MP4",   desc: "Video final listo para publicar" },
                ].map(({ icon: Icon, color, bg, label, desc }) => (
                  <div key={label} className={`rounded-2xl border ${bg} p-4 text-center`}>
                    <div className={`w-10 h-10 rounded-xl ${bg} border flex items-center justify-center mx-auto mb-3`}>
                      <Icon className={`w-5 h-5 ${color}`} />
                    </div>
                    <p className="text-sm font-semibold text-white">{label}</p>
                    <p className="text-xs text-zinc-500 mt-1">{desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Niches inspiration */}
            <Card className="border-dashed border-zinc-700">
              <p className="text-xs text-zinc-500 uppercase tracking-widest font-semibold mb-4">Ideas de nichos populares</p>
              <div className="flex flex-wrap gap-2">
                {[
                  "😱 Terror psicológico", "💔 Romance prohibido", "🔍 Misterio sin resolver",
                  "💪 Historia de superación", "👻 Sobrenatural", "🕵️ Thriller",
                  "💡 Motivacional", "🧠 Conspiración", "❤️ Drama familiar",
                ].map((niche) => (
                  <Link key={niche} href="/dashboard/projects/new">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-500 text-xs text-zinc-300 hover:text-white transition-all cursor-pointer">
                      {niche}
                    </span>
                  </Link>
                ))}
              </div>
            </Card>

          </div>
        )}

        {/* ── NORMAL DASHBOARD: shown when has projects ── */}
        {(loading || (data?.projects.length ?? 0) > 0) && (
          <>
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
          </>
        )}
      </div>
    </>
  );
}
