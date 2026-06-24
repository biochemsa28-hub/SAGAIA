"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Zap, Check, ArrowLeft, Clock, Shield, X, ChevronDown, TrendingUp, Video, Mic, Image, Film } from "lucide-react";
import { track } from "@/components/providers/PostHogProvider";

// ─── Plans data (decoy strategy: Creador is bad value to push Pro) ────────────
const PLANS = [
  {
    id: "starter",
    name: "Starter",
    navos: 9000,
    videos: 1,
    monthly: 9,
    annual: 7,
    perVideo: { monthly: "9.00", annual: "7.00" },
    accent: "from-zinc-700 to-zinc-800",
    border: "border-zinc-700",
    glow: "",
    badge: null as string | null,
    badgeColor: "",
    features: ["1 video premium / mes", "Personajes que HABLAN (lip-sync)", "Elenco IA + voz por personaje", "Subtítulos karaoke + kit de publicación"],
    locked: ["Más volumen", "Soporte prioritario"],
    cta: "Comenzar",
    ctaStyle: "bg-zinc-700 hover:bg-zinc-600 text-white",
  },
  {
    id: "creator",
    name: "Creador",
    navos: 29000,
    videos: 3,
    monthly: 29,
    annual: 24,
    perVideo: { monthly: "9.67", annual: "8.00" },
    accent: "from-blue-900 to-blue-950",
    border: "border-blue-800/50",
    glow: "",
    badge: null as string | null,
    badgeColor: "",
    features: ["3 videos premium / mes", "Personajes recurrentes guardados", "Sube tu producto a los anuncios", "Todo lo de Starter"],
    locked: ["Soporte prioritario"],
    cta: "Elegir Creador",
    ctaStyle: "bg-blue-700 hover:bg-blue-600 text-white",
  },
  {
    id: "pro",
    name: "Pro",
    navos: 49000,
    videos: 5,
    monthly: 49,
    annual: 39,
    perVideo: { monthly: "9.80", annual: "7.80" },
    accent: "from-violet-900/80 to-purple-950",
    border: "border-violet-500",
    glow: "shadow-[0_0_40px_rgba(139,92,246,0.35)]",
    badge: "⚡ MÁS ELEGIDO",
    badgeColor: "bg-violet-600 text-white",
    features: ["5 videos premium / mes", "Máxima calidad visual y de voz", "Personajes y anuncios UGC", "Soporte prioritario + acceso anticipado"],
    locked: [] as string[],
    cta: "Empezar con Pro",
    ctaStyle: "bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white shadow-lg shadow-violet-900/50",
  },
  {
    id: "studio",
    name: "Estudio",
    navos: 99000,
    videos: 11,
    monthly: 99,
    annual: 79,
    perVideo: { monthly: "9.00", annual: "7.18" },
    accent: "from-amber-900/60 to-zinc-900",
    border: "border-amber-700/50",
    glow: "",
    badge: null as string | null,
    badgeColor: "",
    features: ["11 videos premium / mes", "Máximo volumen, misma calidad", "Soporte 24/7 + facturación empresarial", "Acceso API (próximamente)"],
    locked: [] as string[],
    cta: "Elegir Estudio",
    ctaStyle: "bg-amber-700 hover:bg-amber-600 text-white",
  },
];

function useCountdown() {
  const [secs, setSecs] = useState(() => {
    if (typeof window === "undefined") return 82800;
    const key = "navos_offer_v2";
    const stored = localStorage.getItem(key);
    if (stored) {
      const left = Math.floor((Number(stored) - Date.now()) / 1000);
      if (left > 0) return left;
    }
    const expires = Date.now() + 23 * 60 * 60 * 1000;
    localStorage.setItem(key, String(expires));
    return 82800;
  });
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  const h = String(Math.floor(secs / 3600)).padStart(2, "0");
  const m = String(Math.floor((secs % 3600) / 60)).padStart(2, "0");
  const s = String(secs % 60).padStart(2, "0");
  return { h, m, s, active: secs > 0 };
}

export default function PricingPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [annual, setAnnual] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const { h, m, s, active } = useCountdown();

  async function buy(plan: typeof PLANS[0]) {
    track("checkout_started", { plan: plan.id, billing: annual ? "annual" : "monthly" });
    if (!session?.user) { router.push("/register"); return; }
    setLoading(plan.id);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: plan.id, billing: annual ? "annual" : "monthly" }),
      });
      const data = await res.json() as { url?: string };
      if (data.url) window.location.href = data.url;
    } catch {
      alert("Error al procesar. Intenta de nuevo.");
    } finally {
      setLoading(null);
    }
  }

  const price = (plan: typeof PLANS[0]) => annual ? plan.annual : plan.monthly;
  const perVideo = (plan: typeof PLANS[0]) => annual ? plan.perVideo.annual : plan.perVideo.monthly;

  return (
    <div className="bg-zinc-950 flex flex-col">

      {/* ── Top bar ─────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800/60 shrink-0">
        <button onClick={() => router.back()} className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 text-xs transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Volver
        </button>

        {/* Urgency bar */}
        {active && (
          <div className="flex items-center gap-2 bg-amber-950/50 border border-amber-800/40 rounded-full px-3.5 py-1.5">
            <Clock className="w-3 h-3 text-amber-400 shrink-0" />
            <span className="text-[10px] text-amber-400 font-medium">Precio anual con descuento expira en</span>
            <span className="font-mono text-xs font-bold text-amber-300 tabular-nums">{h}:{m}:{s}</span>
          </div>
        )}

        <div className="flex items-center gap-1 text-[10px] text-zinc-600">
          <Shield className="w-3 h-3" />
          <span>Cancela cuando quieras</span>
        </div>
      </header>

      {/* ── Hero text ────────────────────────────────────── */}
      <div className="text-center pt-8 pb-5 px-4 shrink-0">
        <p className="text-xs font-bold text-violet-400 uppercase tracking-widest mb-2">NAVOS Mensuales</p>
        <h1 className="text-2xl md:text-3xl font-extrabold text-white mb-1">
          Elige tu plan — crea sin límites
        </h1>
        <p className="text-sm text-zinc-500">Elenco IA · Voz por personaje · Lip-sync · Video MP4 listo para publicar</p>

        {/* Monthly / Annual toggle */}
        <div className="flex items-center justify-center gap-3 mt-5">
          <button
            onClick={() => setAnnual(false)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${!annual ? "bg-zinc-700 text-white" : "text-zinc-500"}`}
          >
            Mensual
          </button>
          <button
            onClick={() => setAnnual(true)}
            className={`relative px-4 py-1.5 rounded-full text-xs font-bold transition-all ${annual ? "bg-violet-700 text-white" : "text-zinc-500"}`}
          >
            Anual
            <span className="absolute -top-2.5 -right-2 bg-emerald-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap">
              -20%
            </span>
          </button>
        </div>
      </div>

      {/* ── Plans — horizontal grid ──────────────────────── */}
      <div className="grid grid-cols-4 gap-3 px-4 pb-4 items-stretch" style={{ minHeight: 420 }}>
        {PLANS.map((plan) => {
          const isHero = plan.id === "pro";
          const p = price(plan);
          const pv = perVideo(plan);
          const isLoading = loading === plan.id;

          return (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-2xl border bg-gradient-to-b ${plan.accent} ${plan.border} ${plan.glow} ${isHero ? "scale-[1.03] z-10" : ""} transition-transform`}
            >
              {/* Popular badge */}
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20">
                  <span className={`${plan.badgeColor} text-[10px] font-extrabold px-4 py-1 rounded-full whitespace-nowrap tracking-wide`}>
                    {plan.badge}
                  </span>
                </div>
              )}

              <div className="flex flex-col flex-1 p-4 pt-5">
                {/* Name */}
                <p className={`text-xs font-bold uppercase tracking-widest mb-3 ${isHero ? "text-violet-300" : "text-zinc-500"}`}>
                  {plan.name}
                </p>

                {/* Price */}
                <div className="mb-1">
                  {annual && (
                    <span className="text-xs text-zinc-600 line-through block mb-0.5">${plan.monthly}/mo</span>
                  )}
                  <div className="flex items-end gap-1">
                    <span className={`text-4xl font-extrabold leading-none ${isHero ? "text-white" : "text-zinc-200"}`}>
                      ${p}
                    </span>
                    <span className="text-xs text-zinc-500 mb-1">/mes</span>
                  </div>
                </div>
                {annual && (
                  <p className="text-[10px] text-emerald-500 font-semibold mb-1">Facturado anualmente</p>
                )}

                {/* Per video metric */}
                <div className={`text-[10px] font-bold mb-3 ${isHero ? "text-violet-300" : "text-zinc-500"}`}>
                  <span className={`text-base font-extrabold ${isHero ? "text-violet-200" : "text-zinc-400"}`}>${pv}</span>
                  {" "}/ video
                </div>

                {/* NAVOS pill */}
                <div className={`flex items-center gap-1.5 rounded-xl px-3 py-2 mb-4 ${isHero ? "bg-violet-800/40 border border-violet-700/40" : "bg-zinc-800/60 border border-zinc-700/40"}`}>
                  <Zap className={`w-3.5 h-3.5 shrink-0 ${isHero ? "text-violet-400" : "text-zinc-500"}`} />
                  <span className={`text-lg font-extrabold ${isHero ? "text-violet-200" : "text-zinc-300"}`}>{plan.navos.toLocaleString("es")}</span>
                  <span className={`text-[10px] font-bold ${isHero ? "text-violet-400" : "text-zinc-500"}`}>NAVOS / mes</span>
                </div>

                {/* Video count */}
                <p className="text-[11px] text-zinc-400 mb-3 -mt-1">
                  <span className="font-bold text-zinc-200">{plan.videos}</span> {plan.videos === 1 ? "video premium" : "videos premium"} / mes
                </p>

                {/* Features */}
                <ul className="space-y-1.5 flex-1">
                  {plan.features.slice(2).map((f) => (
                    <li key={f} className="flex items-start gap-1.5">
                      <Check className={`w-3 h-3 shrink-0 mt-0.5 ${isHero ? "text-violet-400" : "text-emerald-600"}`} />
                      <span className={`text-[11px] leading-snug ${isHero ? "text-zinc-200" : "text-zinc-400"}`}>{f}</span>
                    </li>
                  ))}
                  {plan.locked.map((f) => (
                    <li key={f} className="flex items-start gap-1.5 opacity-35">
                      <X className="w-3 h-3 shrink-0 mt-0.5 text-zinc-600" />
                      <span className="text-[11px] text-zinc-600 leading-snug line-through">{f}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <button
                  onClick={() => buy(plan)}
                  disabled={isLoading}
                  className={`mt-4 w-full py-3 rounded-xl text-xs font-extrabold tracking-wide transition-all active:scale-[0.97] disabled:opacity-50 ${plan.ctaStyle}`}
                >
                  {isLoading ? (
                    <span className="inline-flex items-center gap-1.5 justify-center">
                      <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Procesando…
                    </span>
                  ) : plan.cta}
                </button>

                {isHero && (
                  <p className="text-center text-[9px] text-violet-500 mt-1.5 font-medium">
                    Más obras de arte al mes · el mejor costo por video
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Scroll indicator ────────────────────────────── */}
      <div className="flex flex-col items-center py-3 text-zinc-700 shrink-0">
        <span className="text-[10px] mb-1">¿Tienes dudas? Te ayudamos</span>
        <ChevronDown className="w-4 h-4 animate-bounce" />
      </div>

      {/* ══════════════════════════════════════════════════
          BELOW THE FOLD — closing section
      ══════════════════════════════════════════════════ */}
      <div className="border-t border-zinc-800/40 bg-zinc-950">

        {/* ── 1. ROI CALCULATOR ───────────────────────── */}
        <RoiCalculator onSelectPlan={() => window.scrollTo({ top: 0, behavior: "smooth" })} />

        {/* ── 2. VS HIRING ────────────────────────────── */}
        <VsHiring />

        {/* ── 3. WHAT YOU GET ─────────────────────────── */}
        <WhatYouGet />

        {/* ── 4. TESTIMONIALS ─────────────────────────── */}
        <Testimonials />

        {/* ── 5. FAQ ──────────────────────────────────── */}
        <Faq />

        {/* ── 6. FINAL CTA ────────────────────────────── */}
        <FinalCta onCta={() => window.scrollTo({ top: 0, behavior: "smooth" })} />

        {/* Footer */}
        <div className="border-t border-zinc-800/60 px-5 py-4 flex items-center justify-between">
          <p className="text-[10px] text-zinc-700">© 2025 VYNAVO · Todos los derechos reservados</p>
          <div className="flex items-center gap-3 text-[10px] text-zinc-700">
            <Link href="/terms" className="hover:text-zinc-500">Términos</Link>
            <Link href="/privacy" className="hover:text-zinc-500">Privacidad</Link>
            <Link href="/dashboard" className="hover:text-zinc-400">Volver al estudio →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROI CALCULATOR
// "Antes de decidir, calcula si vale la pena"
// ─────────────────────────────────────────────────────────────────────────────
function RoiCalculator({ onSelectPlan }: { onSelectPlan: () => void }) {
  const [videos, setVideos] = useState(8);
  const [rpm, setRpm] = useState(3);
  const [views, setViews] = useState(10000);

  const editorCost = videos * 280;
  const vynavoCost = 49;
  const saved = editorCost - vynavoCost;
  const adRevenue = Math.round((views / 1000) * rpm * videos);

  return (
    <section className="max-w-3xl mx-auto px-5 py-12">
      <div className="text-center mb-8">
        <span className="text-xs font-bold text-violet-400 uppercase tracking-widest">Herramienta gratuita</span>
        <h2 className="text-xl font-extrabold text-white mt-1 mb-1">Calcula cuánto vale crear con IA</h2>
        <p className="text-sm text-zinc-500">Mueve los controles y ve el impacto real en tu bolsillo</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-5">
        {/* Sliders */}
        {[
          { label: "Videos que publicas al mes", value: videos, min: 1, max: 30, step: 1, set: setVideos, unit: "videos/mes" },
          { label: "Vistas promedio por video", value: views, min: 1000, max: 500000, step: 1000, set: setViews, unit: views >= 1000 ? `${(views/1000).toFixed(0)}k vistas` : `${views}` },
          { label: "RPM estimado (ingresos por 1000 vistas)", value: rpm, min: 1, max: 15, step: 0.5, set: (v: number) => setRpm(v), unit: `$${rpm}/1000 vistas` },
        ].map(({ label, value, min, max, step, set, unit }) => (
          <div key={label}>
            <div className="flex justify-between mb-1.5">
              <span className="text-xs text-zinc-400">{label}</span>
              <span className="text-xs font-bold text-violet-300">{unit}</span>
            </div>
            <input
              type="range" min={min} max={max} step={step} value={value}
              onChange={e => set(Number(e.target.value))}
              className="w-full accent-violet-500 h-1.5"
            />
          </div>
        ))}

        {/* Results */}
        <div className="grid grid-cols-3 gap-3 pt-2">
          {[
            { label: "Editor freelance te costaría", value: `$${editorCost.toLocaleString("es")}`, color: "text-red-400", sub: "al mes en producción" },
            { label: "Con VYNAVO Pro pagas", value: `$${vynavoCost}`, color: "text-violet-300", sub: "al mes — todo incluido" },
            { label: "Ahorras cada mes", value: `$${saved.toLocaleString("es")}`, color: "text-emerald-400", sub: "+ ingresos por ads" },
          ].map(({ label, value, color, sub }) => (
            <div key={label} className="bg-zinc-800/60 rounded-xl p-3 text-center">
              <p className="text-[10px] text-zinc-500 mb-1">{label}</p>
              <p className={`text-2xl font-extrabold ${color}`}>{value}</p>
              <p className="text-[10px] text-zinc-600 mt-0.5">{sub}</p>
            </div>
          ))}
        </div>

        {adRevenue > 0 && (
          <div className="flex items-center gap-3 bg-emerald-950/40 border border-emerald-800/30 rounded-xl px-4 py-3">
            <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
            <p className="text-xs text-emerald-300">
              Con {videos} videos y {(views/1000).toFixed(0)}k vistas cada uno, podrías generar{" "}
              <span className="font-bold text-emerald-200">${adRevenue.toLocaleString("es")}/mes</span>{" "}
              solo en ingresos por publicidad.
            </p>
          </div>
        )}

        <button
          onClick={onSelectPlan}
          className="w-full py-3 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white text-sm font-extrabold rounded-xl transition-all active:scale-[0.98]"
        >
          Elegir mi plan ahora →
        </button>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VS HIRING
// ─────────────────────────────────────────────────────────────────────────────
function VsHiring() {
  const rows = [
    { feature: "Costo por video", editor: "$200–$500", vynavo: "$9 (calidad cine)", win: true },
    { feature: "Tiempo de entrega", editor: "3–7 días", vynavo: "~minutos", win: true },
    { feature: "Disponible 24/7", editor: "No", vynavo: "Sí", win: true },
    { feature: "Escala sin límite", editor: "No", vynavo: "Sí", win: true },
    { feature: "Kit de publicación incluido", editor: "No", vynavo: "Sí", win: true },
    { feature: "Costo mensual (20 videos)", editor: "$4,000–$10,000", vynavo: "$49", win: true },
  ];

  return (
    <section className="max-w-3xl mx-auto px-5 pb-12">
      <div className="text-center mb-6">
        <span className="text-xs font-bold text-amber-500 uppercase tracking-widest">Comparativa honesta</span>
        <h2 className="text-xl font-extrabold text-white mt-1">Editor freelance vs VYNAVO</h2>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="grid grid-cols-3 bg-zinc-800/60 px-4 py-2.5">
          <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider"></span>
          <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider text-center">Editor freelance</span>
          <span className="text-[11px] font-bold text-violet-400 uppercase tracking-wider text-center">VYNAVO Pro</span>
        </div>
        {rows.map((r, i) => (
          <div key={r.feature} className={`grid grid-cols-3 px-4 py-3 ${i % 2 === 0 ? "" : "bg-zinc-800/20"}`}>
            <span className="text-xs text-zinc-400">{r.feature}</span>
            <span className="text-xs text-red-400 text-center">{r.editor}</span>
            <span className="text-xs font-bold text-emerald-400 text-center flex items-center justify-center gap-1">
              <Check className="w-3 h-3" />{r.vynavo}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WHAT YOU GET
// ─────────────────────────────────────────────────────────────────────────────
function WhatYouGet() {
  const steps = [
    { icon: Mic, color: "bg-violet-800/40 text-violet-300", label: "Elenco con voz propia", desc: "La IA diseña tus personajes y cada uno actúa con su propia voz (10 arquetipos)" },
    { icon: Image, color: "bg-blue-800/40 text-blue-300", label: "Misma cara en todo", desc: "Imágenes de cine con realismo y el mismo personaje en cada escena" },
    { icon: Film, color: "bg-pink-800/40 text-pink-300", label: "Personajes que hablan", desc: "Lip-sync de alta calidad: la boca se mueve con la voz — listo para TikTok/Reels/Shorts" },
    { icon: Video, color: "bg-emerald-800/40 text-emerald-300", label: "Kit de publicación", desc: "Subtítulos karaoke, caption, hook, CTA, hashtags y estrategia" },
  ];

  return (
    <section className="max-w-3xl mx-auto px-5 pb-12">
      <div className="text-center mb-6">
        <span className="text-xs font-bold text-pink-400 uppercase tracking-widest">Todo incluido</span>
        <h2 className="text-xl font-extrabold text-white mt-1">Lo que incluye cada microserie</h2>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {steps.map(({ icon: Icon, color, label, desc }) => (
          <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-start gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-white mb-0.5">{label}</p>
              <p className="text-xs text-zinc-500 leading-relaxed">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TESTIMONIALS
// ─────────────────────────────────────────────────────────────────────────────
function Testimonials() {
  const items = [
    { name: "Laura M.", handle: "@lauracrea", niche: "Terror psicológico", avatar: "LM", color: "bg-red-800", result: "12k seguidores en 3 semanas", quote: "Publiqué 4 videos en un día. Antes me tardaba una semana en editar uno solo. VYNAVO cambió mi ritmo completamente." },
    { name: "Carlos R.", handle: "@carlosdigital", niche: "Finanzas personales", avatar: "CR", color: "bg-emerald-800", result: "$820 en ingresos el primer mes", quote: "No sé editar video. Literalmente entro, escribo mi idea y en minutos tengo el video listo para subir con todo el copy incluido." },
    { name: "Daniela V.", handle: "@daniviral", niche: "Romance & drama", avatar: "DV", color: "bg-pink-800", result: "340k vistas en su primer video", quote: "El kit de publicación es lo que más me ayudó. Los hashtags y el hook me los da todo automatizado. Ya no improviso." },
  ];

  return (
    <section className="max-w-3xl mx-auto px-5 pb-12">
      <div className="text-center mb-6">
        <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Creadores reales</span>
        <h2 className="text-xl font-extrabold text-white mt-1">Lo que están logrando otros como tú</h2>
      </div>
      <div className="space-y-3">
        {items.map(({ name, handle, niche, avatar, color, result, quote }) => (
          <div key={name} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-full ${color} flex items-center justify-center shrink-0 text-xs font-bold text-white`}>
                {avatar}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <p className="text-sm font-bold text-white">{name}</p>
                    <p className="text-[10px] text-zinc-500">{handle} · {niche}</p>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/50 border border-emerald-800/30 px-2.5 py-1 rounded-full whitespace-nowrap">
                    {result}
                  </span>
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed italic">"{quote}"</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FAQ — objection killing disguised as help
// ─────────────────────────────────────────────────────────────────────────────
function Faq() {
  const [open, setOpen] = useState<number | null>(null);
  const items = [
    { q: "¿Puedo cancelar cuando quiera?", a: "Sí, sin penalización y sin preguntas. Si cancelas antes de tu siguiente ciclo, conservas tus NAVOS hasta que se agoten. No hay contratos mínimos ni letra pequeña." },
    { q: "¿Qué pasa si se me acaban los NAVOS antes de fin de mes?", a: "Puedes upgradearte a un plan superior en cualquier momento y los NAVOS nuevos se acreditan de inmediato. También puedes comprar un paquete adicional si prefieres no cambiar de plan." },
    { q: "¿El video es realmente mío para monetizar?", a: "100%. Descargas el archivo MP4 y puedes publicarlo en TikTok, Instagram, YouTube o cualquier plataforma, monetizarlo con ads, incluirlo en cursos o venderlo a clientes. Sin restricciones de licencia." },
    { q: "¿Necesito saber editar video o tener equipo?", a: "No. Solo necesitas una idea o un tema. La IA diseña el elenco, escribe el guion actuado, le da voz a cada personaje, genera las imágenes y arma el video completo. Solo escribes y descargas. Cero habilidades técnicas." },
    { q: "¿Funciona para cualquier nicho o idioma?", a: "Sí en ambos casos. Optimizado para español con 10 arquetipos de voz por personaje. Los nichos incluyen terror, romance, misterio, inspiracional, thriller, comedia, documental y fantasía." },
    { q: "¿Qué diferencia hay entre el plan Pro y el Estudio?", a: "Todos los planes producen la misma calidad premium (personajes que hablan, calidad obra de arte). Se diferencian por volumen: Pro rinde 5 videos al mes con soporte prioritario; Estudio rinde 11 videos al mes con soporte 24/7 y facturación empresarial." },
  ];

  return (
    <section className="max-w-3xl mx-auto px-5 pb-12">
      <div className="text-center mb-6">
        <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Resolvemos tus dudas</span>
        <h2 className="text-xl font-extrabold text-white mt-1">Preguntas frecuentes</h2>
      </div>
      <div className="space-y-2">
        {items.map(({ q, a }, i) => (
          <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <button
              onClick={() => setOpen(open === i ? null : i)}
              className="w-full flex items-center justify-between px-4 py-3.5 text-left"
            >
              <span className="text-sm font-medium text-zinc-200">{q}</span>
              <ChevronDown className={`w-4 h-4 text-zinc-500 shrink-0 ml-3 transition-transform ${open === i ? "rotate-180" : ""}`} />
            </button>
            {open === i && (
              <div className="px-4 pb-4">
                <p className="text-sm text-zinc-400 leading-relaxed">{a}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FINAL CTA
// ─────────────────────────────────────────────────────────────────────────────
function FinalCta({ onCta }: { onCta: () => void }) {
  return (
    <section className="max-w-3xl mx-auto px-5 pb-16">
      <div className="relative bg-gradient-to-br from-violet-950/80 to-zinc-900 border border-violet-700/30 rounded-2xl p-8 text-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-tr from-violet-600/5 to-pink-600/5 pointer-events-none" />
        <div className="relative z-10">
          <p className="text-3xl mb-3">⚡</p>
          <h2 className="text-2xl font-extrabold text-white mb-2">
            Cada día sin VYNAVO es un video que no publicaste
          </h2>
          <p className="text-sm text-zinc-400 mb-6 max-w-lg mx-auto">
            El algoritmo premia la consistencia. Los creadores que publican más, crecen más. Empieza hoy — el primer video lo produces en menos de 10 minutos.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button
              onClick={onCta}
              className="px-8 py-3.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-extrabold rounded-xl text-sm transition-all active:scale-[0.98] shadow-lg shadow-violet-900/40"
            >
              Ver los planes →
            </button>
            <Link
              href="/dashboard"
              className="px-8 py-3.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold rounded-xl text-sm transition-all border border-zinc-700"
            >
              Probar gratis primero
            </Link>
          </div>
          <div className="flex items-center justify-center gap-4 mt-5">
            {["Sin tarjeta para el trial", "Cancela cuando quieras", "NAVOS sin vencimiento"].map(t => (
              <span key={t} className="flex items-center gap-1 text-[10px] text-zinc-600">
                <Shield className="w-2.5 h-2.5" />{t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
