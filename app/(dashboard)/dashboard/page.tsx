"use client";
import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Film, Sparkles, LogOut, PartyPopper, ArrowRight,
  Flame, Star, PlusCircle, TrendingUp, Zap, Trophy, Crown, RefreshCw,
} from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { StatusBadge } from "@/components/ui/badge";
import { CountUp } from "@/components/ui/CountUp";
import { CREDIT_COST_BY_TIER } from "@/lib/config";
import { formatDate, truncate } from "@/lib/utils";
import type { DbProject } from "@/lib/db/repository";

interface DashboardData {
  projects: DbProject[];
  stats: { total: number; ready: number; generating: number; scenes: number };
}

// Viral idea cards — pre-fill create form
const VIRAL_IDEAS = [
  { emoji: "😱", niche: "Terror psicológico",   tone: "horror",    duration: "60s",    topic: "Una mujer escucha la voz de su hija llamándola... pero su hija lleva 3 años muerta",      color: "from-red-900/40 to-zinc-900",      border: "border-red-800/30" },
  { emoji: "💔", niche: "Romance prohibido",     tone: "romance",   duration: "60s",    topic: "Su mejor amigo de 15 años le confiesa que siempre la amó... en el día de su boda",         color: "from-pink-900/40 to-zinc-900",     border: "border-pink-800/30" },
  { emoji: "🔍", niche: "Misterio",              tone: "mystery",   duration: "3-5min", topic: "Encuentra fotos de su propia infancia en casa de un desconocido que jamás conoció",        color: "from-blue-900/40 to-zinc-900",     border: "border-blue-800/30" },
  { emoji: "💪", niche: "Superación personal",   tone: "inspirational", duration: "60s", topic: "De dormir en su carro a facturar $10k al mes: la historia que nadie te contó",           color: "from-emerald-900/40 to-zinc-900",  border: "border-emerald-800/30" },
  { emoji: "👻", niche: "Sobrenatural",           tone: "horror",    duration: "60s",    topic: "El hombre del espejo lleva años imitando tu vida... y hoy cometió un error",              color: "from-violet-900/40 to-zinc-900",   border: "border-violet-800/30" },
  { emoji: "🕵️", niche: "Thriller",              tone: "thriller",  duration: "3-5min", topic: "La psicóloga descubre que todos sus pacientes comparten el mismo sueño recurrente",       color: "from-amber-900/40 to-zinc-900",    border: "border-amber-800/30" },
  { emoji: "🧠", niche: "Conspiración",           tone: "mystery",   duration: "3-5min", topic: "El experimento del gobierno que terminó mal — y los sobrevivientes que guardan silencio", color: "from-teal-900/40 to-zinc-900",     border: "border-teal-800/30" },
  { emoji: "❤️", niche: "Drama familiar",         tone: "drama",     duration: "60s",    topic: "La carta que encontró en el ático de su madre reveló el secreto de 30 años",             color: "from-rose-900/40 to-zinc-900",     border: "border-rose-800/30" },
];

const TIPS = [
  "Los videos de 60s con giros al minuto 0:45 tienen 3× más retención",
  "El horror psicológico es el nicho con mayor RPM en TikTok ahora mismo",
  "Publicar 2 videos el mismo día multiplica el alcance por 2.4×",
  "Los hooks con pregunta retórica retienen 68% más que los descriptivos",
  "El romance prohibido es el nicho que más comentarios genera por video",
];

function PaymentBanner() {
  const params = useSearchParams();
  if (params.get("payment") !== "success") return null;
  const plan = params.get("plan");
  return (
    <div className="flex items-center gap-3 bg-emerald-950/50 border border-emerald-700/40 rounded-xl px-4 py-3">
      <PartyPopper className="w-5 h-5 text-emerald-400 shrink-0" />
      <div>
        <p className="text-sm font-semibold text-emerald-300">¡Pago exitoso!</p>
        <p className="text-xs text-emerald-600">Plan <span className="capitalize font-medium text-emerald-400">{plan}</span> activo.</p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tipIndex] = useState(() => Math.floor(Math.random() * TIPS.length));
  // Ideas rotate by day-of-year so "Tendencias de hoy" feels fresh every visit.
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const [ideaOffset, setIdeaOffset] = useState(() => (dayOfYear * 2) % VIRAL_IDEAS.length);
  const [navos, setNavos] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);

  // Daily creation streak (client-side, localStorage). Increments on consecutive
  // days, resets if a day is skipped — drives the "no rompas tu racha" hook.
  useEffect(() => {
    try {
      const today = new Date().toDateString();
      const raw = localStorage.getItem("vy_streak");
      const prev = raw ? (JSON.parse(raw) as { date: string; count: number }) : null;
      let count = 1;
      if (prev) {
        if (prev.date === today) { count = prev.count; }
        else {
          const diff = (new Date(today).getTime() - new Date(prev.date).getTime()) / 86400000;
          count = diff === 1 ? prev.count + 1 : 1;
        }
      }
      localStorage.setItem("vy_streak", JSON.stringify({ date: today, count }));
      setStreak(count);
    } catch { setStreak(1); }
  }, []);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((d: DashboardData & { error?: string }) => {
        if (d.error || !Array.isArray(d.projects)) setData(null);
        else setData(d);
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));

    fetch("/api/credits")
      .then((r) => r.json())
      .then((d: { credits?: number }) => { if (typeof d.credits === "number") setNavos(d.credits); })
      .catch(() => null);
  }, []);

  function createFromIdea(idea: typeof VIRAL_IDEAS[0]) {
    const params = new URLSearchParams({
      niche: idea.niche,
      tone: idea.tone,
      duration: idea.duration,
      topic: idea.topic,
    });
    router.push(`/dashboard/projects/new?${params.toString()}`);
  }

  const stats = data?.stats ?? { total: 0, ready: 0, generating: 0, scenes: 0 };
  const hasProjects = (data?.projects?.length ?? 0) > 0;
  const visibleIdeas = VIRAL_IDEAS.slice(ideaOffset, ideaOffset + 4);

  return (
    <>
      <TopBar
        title="Estudio"
        subtitle={`Hola, ${session?.user?.name?.split(" ")[0] ?? "creador"} 👋`}
        actions={
          <button onClick={() => signOut({ callbackUrl: "/login" })} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
            <LogOut className="w-3.5 h-3.5" />
            Salir
          </button>
        }
      />

      <div className="p-4 space-y-5 pb-24">

        {/* Payment banner */}
        <Suspense fallback={null}><PaymentBanner /></Suspense>

        {/* ── CENTRO DE MANDO (stats vivas) ───────────────────────────────── */}
        {/* NAVOS hero con barra + cobertura */}
        <div className="relative overflow-hidden rounded-2xl vy-glass p-4 vy-lift">
          <div className="absolute top-0 right-0 w-24 h-24 bg-violet-500/10 rounded-full blur-2xl -translate-y-6 translate-x-6" />
          <div className="relative flex items-end justify-between">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <Zap className="w-4 h-4 text-violet-400" />
                <p className="text-[10px] text-violet-300 font-bold uppercase tracking-widest">Tus NAVOS</p>
              </div>
              <p className="text-3xl font-extrabold vy-grad-text">
                {navos !== null ? <CountUp value={navos} /> : "…"}
              </p>
              {navos !== null && (
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Te alcanza para <span className="text-violet-300 font-semibold">{Math.floor(navos / CREDIT_COST_BY_TIER.kenburns)}</span> rápidos
                  {navos >= CREDIT_COST_BY_TIER.talking && <> · <span className="text-cyan-300 font-semibold">{Math.floor(navos / CREDIT_COST_BY_TIER.talking)}</span> con voz</>}
                </p>
              )}
            </div>
            <Link href="/pricing">
              <button className="text-[11px] font-bold text-white vy-grad-bg px-3 py-1.5 rounded-full vy-press">Recargar +</button>
            </Link>
          </div>
        </div>

        {/* Racha · videos · viral */}
        <div className="grid grid-cols-3 gap-3">
          <div className="vy-glass rounded-2xl p-3.5 text-center vy-lift">
            <Flame className="w-5 h-5 text-amber-400 mx-auto mb-1" />
            <p className="text-2xl font-extrabold text-white"><CountUp value={streak} /></p>
            <p className="text-[10px] text-amber-400 font-semibold">racha 🔥</p>
          </div>
          <div className="vy-glass rounded-2xl p-3.5 text-center vy-lift">
            <Film className="w-5 h-5 text-violet-400 mx-auto mb-1" />
            <p className="text-2xl font-extrabold text-white"><CountUp value={stats.ready} /></p>
            <p className="text-[10px] text-violet-400 font-semibold">videos listos</p>
          </div>
          <div className="vy-glass rounded-2xl p-3.5 text-center vy-lift">
            <TrendingUp className="w-5 h-5 text-cyan-400 mx-auto mb-1" />
            <p className="text-2xl font-extrabold text-white"><CountUp value={stats.ready > 0 ? 94 : 0} suffix="%" /></p>
            <p className="text-[10px] text-cyan-400 font-semibold">viral avg</p>
          </div>
        </div>

        {/* Achievement / nivel de creador */}
        <div className="flex items-center gap-3 vy-glass rounded-xl px-4 py-3">
          <div className="w-9 h-9 rounded-xl vy-grad-bg flex items-center justify-center shrink-0">
            {stats.ready >= 10 ? <Crown className="w-4.5 h-4.5 text-white" /> : <Trophy className="w-4.5 h-4.5 text-white" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-white">
              {stats.ready >= 10 ? "Creador Élite 👑" : stats.ready >= 3 ? "Creador en ascenso 🚀" : "Creador novato ✨"}
            </p>
            <p className="text-[10px] text-zinc-500">
              {stats.ready >= 10 ? "Estás en el top 10% de creadores VYNAVO" : `${Math.max(0, 3 - stats.ready)} videos para subir de nivel`}
            </p>
          </div>
        </div>

        {/* ── TIP DEL DÍA ─────────────────────────────────────────────────── */}
        <div className="flex items-start gap-3 vy-glass rounded-xl px-4 py-3">
          <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <p className="text-xs text-zinc-300 leading-relaxed">
            <span className="text-emerald-400 font-semibold">Dato viral: </span>{TIPS[tipIndex]}
          </p>
        </div>

        {/* ── IDEAS VIRALES ────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3 px-0.5">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-pink-500" />
              </span>
              <h2 className="text-sm font-bold vy-grad-text">Tendencias de hoy</h2>
            </div>
            <button
              onClick={() => setIdeaOffset((prev) => (prev + 4) % VIRAL_IDEAS.length)}
              className="text-xs text-violet-400 hover:text-violet-300 transition-colors flex items-center gap-1 vy-press"
            >
              Cambiar <RefreshCw className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-2.5">
            {visibleIdeas.map((idea, i) => (
              <button
                key={ideaOffset + i}
                onClick={() => createFromIdea(idea)}
                className={`w-full text-left rounded-2xl bg-gradient-to-r ${idea.color} border ${idea.border} p-4 hover:brightness-110 active:scale-[0.98] transition-all`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl shrink-0 mt-0.5">{idea.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">{idea.niche}</span>
                      <span className="text-[10px] text-zinc-600">·</span>
                      <span className="text-[10px] text-zinc-500">{idea.duration}</span>
                    </div>
                    <p className="text-sm text-zinc-200 leading-snug">{idea.topic}</p>
                  </div>
                  <div className="shrink-0 w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mt-0.5">
                    <Sparkles className="w-3.5 h-3.5 text-zinc-300" />
                  </div>
                </div>
                <div className="flex items-center gap-1.5 mt-2.5 ml-11">
                  <span className="text-[10px] font-medium text-zinc-500 bg-zinc-800/60 rounded-full px-2 py-0.5">{idea.tone}</span>
                  <span className="text-[10px] font-semibold text-pink-400 bg-pink-950/40 rounded-full px-2 py-0.5">
                    🔥 {(1.2 + ((dayOfYear + (ideaOffset + i) * 7) % 40) / 10).toFixed(1)}k creando hoy
                  </span>
                  <span className="text-[10px] text-zinc-600 ml-auto">crear →</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── BOTÓN CREAR PROPIO ───────────────────────────────────────────── */}
        <Link href="/dashboard/projects/new">
          <div className="w-full flex items-center justify-between bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 active:scale-[0.98] text-white font-bold py-4 px-5 rounded-2xl transition-all shadow-lg shadow-violet-900/30">
            <div>
              <p className="text-base font-bold">Crear mi propia idea</p>
              <p className="text-xs text-violet-200 font-normal mt-0.5">Elige nicho, tono y tema personalizado</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
              <PlusCircle className="w-5 h-5" />
            </div>
          </div>
        </Link>

        {/* ── PROYECTOS RECIENTES ──────────────────────────────────────────── */}
        {(loading || hasProjects) && (
          <div>
            <div className="flex items-center justify-between mb-3 px-0.5">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Film className="w-4 h-4 text-violet-400" />
                Mis videos
              </h2>
              <Link href="/dashboard/library" className="text-xs text-violet-400 hover:text-violet-300 transition-colors">
                Ver todos →
              </Link>
            </div>

            {loading && (
              <div className="space-y-2.5">
                {[1, 2].map((i) => <div key={i} className="h-16 rounded-xl bg-zinc-800/50 animate-pulse" />)}
              </div>
            )}

            {!loading && hasProjects && (
              <div className="space-y-2.5">
                {(data?.projects ?? []).slice(0, 3).map((p) => (
                  <Link key={p.id} href={`/dashboard/projects/${p.id}`}>
                    <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl p-3.5 transition-all active:scale-[0.98]">
                      <div className="w-9 h-9 rounded-lg bg-violet-600/10 border border-violet-700/30 flex items-center justify-center shrink-0">
                        <Film className="w-4 h-4 text-violet-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{truncate(p.title, 40)}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">{p.niche} · {formatDate(p.created_at)}</p>
                      </div>
                      <StatusBadge status={p.status} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ESTRATEGIA DEL CREADOR (si tiene proyectos) ──────────────────── */}
        {hasProjects && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Tu plan de contenido</p>
            {[
              { day: "Hoy",      action: "Publica tu último video en TikTok + Reels + Shorts",           check: true  },
              { day: "Mañana",   action: "Crea un video de nicho diferente para testear el algoritmo",   check: false },
              { day: "+2 días",  action: "Revisa qué video tuvo más views y repite la fórmula",          check: false },
              { day: "+3 días",  action: "Crea una segunda parte del video más exitoso",                 check: false },
            ].map(({ day, action, check }) => (
              <div key={day} className="flex items-start gap-3">
                <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${check ? "bg-emerald-600/20 border-emerald-700/40" : "border-zinc-700"}`}>
                  {check && <span className="text-[10px] text-emerald-400">✓</span>}
                </div>
                <div>
                  <span className="text-[10px] font-bold text-zinc-500 uppercase">{day} </span>
                  <span className="text-xs text-zinc-300">{action}</span>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </>
  );
}
