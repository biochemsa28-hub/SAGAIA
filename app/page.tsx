import Link from "next/link";
import type { Metadata } from "next";
import { getAnimationTier } from "@/lib/config";

// This is a server component, so it can read the tier the pipeline ACTUALLY runs.
// Lip-sync only exists on the talking tier; with FORCE_TIER=kenburns the landing
// was promising talking characters three separate times for a video that has
// none. The headline claim on a landing page is a contract, not decoration.
const HAS_LIPSYNC = getAnimationTier() === "talking";
const HERO_FEATURE = HAS_LIPSYNC ? "Lip-sync" : "Gancho animado";
const HERO_FEATURE_LABEL = HAS_LIPSYNC ? "Personajes que hablan" : "Movimiento real donde importa";

export const metadata: Metadata = {
  title: "VYNAVO — Microseries virales con personajes que actúan, con IA",
  description:
    `VYNAVO diseña tu elenco, le da voz propia a cada personaje y produce la microserie completa: guion actuado, imágenes consistentes, ${HAS_LIPSYNC ? "lip-sync" : "gancho animado"}, subtítulos y video MP4 listo para TikTok, Reels y YouTube Shorts.`,
  keywords: [
    "microserie IA", "telenovela IA", "personajes IA que hablan",
    "crear videos con IA", "TikTok automatizado", "Reels IA", "YouTube Shorts IA",
    "elenco IA", "voces por personaje", "VYNAVO"
  ],
  openGraph: {
    title: "VYNAVO — Microseries IA con elenco y voces propias",
    description: `De idea a microserie viral en minutos. Elenco IA · Voz por personaje · ${HERO_FEATURE} · MP4.`,
    url: "https://vynavo.vercel.app",
    siteName: "VYNAVO Studio",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "VYNAVO — Microseries IA con personajes que actúan",
    description: "Elenco diseñado por IA, voz por personaje y video final listo para publicar.",
    images: ["/og-image.png"],
  },
  alternates: { canonical: "https://vynavo.vercel.app" },
  robots: { index: true, follow: true },
};

const FEATURES = [
  {
    icon: "🎭", title: "Elenco diseñado por IA",
    desc: "La IA crea los personajes que tu historia necesita y tú eliges sus caras. Un elenco que tu audiencia reconoce y quiere seguir.",
  },
  {
    icon: "🗣️", title: "Cada personaje con su voz",
    desc: "Voces distintas por personaje — hombre, mujer, niño, villano — que ACTÚAN su diálogo. No un narrador plano, una micronovela.",
  },
  {
    icon: "🎬", title: "Calidad obra de arte",
    desc: HAS_LIPSYNC
      ? "Un solo nivel: el mejor. Cada video se produce en máxima calidad con lip-sync — personajes que de verdad hablan a cámara."
      : "Un solo nivel: el mejor. Cada video se produce en máxima calidad, con el gancho animado en movimiento real y la misma cara en cada escena.",
  },
  {
    icon: "🖼️", title: "Misma cara en todo",
    desc: "Imágenes de cine con capa de realismo y el MISMO personaje en cada escena — y en todos tus videos. Tu sello propio.",
  },
  {
    icon: "💬", title: "Subtítulos karaoke",
    desc: "Subtítulos palabra por palabra, sincronizados al audio real, que disparan la retención en los primeros segundos.",
  },
  {
    icon: "⚡", title: "Video MP4 + kit viral",
    desc: "Video 9:16 final con SEO, hashtags, hook y estrategia de publicación lista para TikTok, Reels y Shorts.",
  },
];

const NICHES = ["💔 Dramas de pareja", "👻 Terror psicológico", "💼 Negocios & éxito", "🌍 Historias reales", "🧠 Motivación", "💋 Romance"];

const STATS = [
  { value: "Obra de arte", label: "Calidad en cada video" },
  { value: "10 voces", label: "Arquetipos por personaje" },
  { value: HERO_FEATURE, label: HERO_FEATURE_LABEL },
  { value: "9:16", label: "TikTok · Reels · Shorts" },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">

      {/* ── Nav ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800/50">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center text-sm">
              ✦
            </div>
            <span className="font-bold text-white text-lg">VYNAVO</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-zinc-400 hover:text-white transition-colors">
              Iniciar sesión
            </Link>
            <Link
              href="/register"
              className="text-sm bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Empezar gratis
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="pt-32 pb-20 px-4 text-center relative overflow-hidden">
        {/* Glow bg */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full bg-violet-600/10 blur-3xl" />
        </div>

        <div className="relative max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-violet-600/10 border border-violet-700/30 rounded-full px-4 py-1.5 mb-8 text-xs text-violet-300 font-medium">
            ✦ Elenco IA · Voz por personaje · {HERO_FEATURE}
          </div>

          <h1 className="text-5xl md:text-6xl font-extrabold leading-tight mb-6 tracking-tight">
            Microseries con{" "}
            <span className="bg-gradient-to-r from-violet-400 via-pink-400 to-orange-400 bg-clip-text text-transparent">
              personajes que actúan
            </span>
            {" "}— creados con IA
          </h1>

          <p className="text-xl text-zinc-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            VYNAVO diseña tu elenco, le da voz propia a cada personaje y produce la microserie completa:
            guion actuado, imágenes consistentes, subtítulos y video MP4 listo para publicar.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/register"
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 text-white font-bold px-8 py-4 rounded-xl text-base transition-all shadow-xl shadow-violet-900/30"
            >
              ⚡ Crear mi primera microserie gratis
            </Link>
            <Link
              href="/login"
              className="w-full sm:w-auto text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Ya tengo cuenta →
            </Link>
          </div>

          <p className="text-xs text-zinc-600 mt-4">NAVOS de regalo al registrarte · Sin tarjeta</p>
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="py-12 px-4 border-y border-zinc-800/50">
        <div className="max-w-3xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {STATS.map((s) => (
            <div key={s.value}>
              <p className="text-2xl font-bold text-white">{s.value}</p>
              <p className="text-xs text-zinc-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">Un estudio completo, en un solo clic</h2>
            <p className="text-zinc-400">Tu idea entra como texto y sale como microserie lista para viralizar</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="flex gap-4 p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800/60 hover:border-zinc-700/60 transition-colors"
              >
                <span className="text-3xl shrink-0">{f.icon}</span>
                <div>
                  <h3 className="font-semibold text-white mb-1">{f.title}</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Niches ── */}
      <section className="py-16 px-4 bg-zinc-900/30">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-bold mb-2">Para cualquier nicho de contenido</h2>
          <p className="text-zinc-500 text-sm mb-8">Elige tu género y VYNAVO adapta todo — tono, imágenes, narrativa</p>
          <div className="flex flex-wrap justify-center gap-3">
            {NICHES.map((n) => (
              <span key={n} className="px-4 py-2 rounded-full bg-zinc-800 border border-zinc-700 text-sm text-zinc-300">
                {n}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA final ── */}
      <section className="py-24 px-4 text-center">
        <div className="max-w-xl mx-auto">
          <h2 className="text-4xl font-extrabold mb-4 leading-tight">
            Empieza a producir hoy
          </h2>
          <p className="text-zinc-400 mb-8">NAVOS de regalo al registrarte. Sin tarjeta de crédito.</p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 text-white font-bold px-10 py-4 rounded-xl text-base transition-all shadow-xl shadow-violet-900/30"
          >
            ⚡ Crear cuenta gratis
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-zinc-800/50 py-8 px-4">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white">VYNAVO</span>
            <span className="text-zinc-600 text-sm">· Studio AI</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-zinc-600">
            <Link href="/pricing" className="hover:text-zinc-400 transition-colors">Precios</Link>
            <Link href="/login" className="hover:text-zinc-400 transition-colors">Login</Link>
            <span>© 2026 VYNAVO. Todos los derechos reservados.</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
