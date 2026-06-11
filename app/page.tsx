import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SAGAIA — Crea microdramas virales con IA en minutos",
  description:
    "SAGAIA convierte tu idea en un microdrama completo: voz profesional, imágenes generadas, clips animados y video final MP4 listo para TikTok, Reels e YouTube Shorts. Sin edición. Sin equipos.",
  keywords: [
    "microdrama IA", "crear videos con inteligencia artificial", "generador de videos cortos",
    "TikTok automatizado", "Reels IA", "YouTube Shorts IA", "storytelling automatizado",
    "producción de contenido IA", "SAGAIA"
  ],
  openGraph: {
    title: "SAGAIA — Microdramas IA listos para publicar",
    description: "De idea a video viral en 7 minutos. Voz · Imágenes · Clips · Video MP4.",
    url: "https://sagaia.vercel.app",
    siteName: "SAGAIA Studio",
    type: "website",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SAGAIA — Microdramas IA en minutos",
    description: "Crea microdramas completos con IA: voz, imágenes, clips y video final.",
    images: ["/og-image.png"],
  },
  alternates: { canonical: "https://sagaia.vercel.app" },
  robots: { index: true, follow: true },
};

const FEATURES = [
  {
    icon: "🎤", color: "emerald", title: "Voz profesional",
    desc: "ElevenLabs genera narración natural en tu idioma con el tono exacto de tu historia.",
  },
  {
    icon: "🖼️", color: "blue", title: "Imágenes cinematográficas",
    desc: "Flux Schnell crea imágenes 9:16 ultra-realistas adaptadas a cada escena.",
  },
  {
    icon: "🎬", color: "purple", title: "Clips animados",
    desc: "Kling v1.6 anima cada imagen con movimiento de cámara cinematográfico.",
  },
  {
    icon: "⚡", color: "pink", title: "Video final MP4",
    desc: "Shotstack ensambla todo en un video 1080×1920 con subtítulos y audio sincronizado.",
  },
];

const NICHES = ["💔 Dramas de pareja", "👻 Terror psicológico", "💼 Negocios & éxito", "🌍 Historias reales", "🧠 Motivación", "💋 Romance"];

const STATS = [
  { value: "7 min", label: "Tiempo promedio de producción" },
  { value: "1 crédito", label: "Por microdrama completo" },
  { value: "9:16", label: "Formato vertical optimizado" },
  { value: "3 plataformas", label: "TikTok · Reels · Shorts" },
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
            <span className="font-bold text-white text-lg">SAGAIA</span>
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
            ✦ Producción IA completa · Sin experiencia requerida
          </div>

          <h1 className="text-5xl md:text-6xl font-extrabold leading-tight mb-6 tracking-tight">
            De idea a{" "}
            <span className="bg-gradient-to-r from-violet-400 via-pink-400 to-orange-400 bg-clip-text text-transparent">
              microdrama viral
            </span>
            {" "}en 7 minutos
          </h1>

          <p className="text-xl text-zinc-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            SAGAIA produce todo automáticamente — voz, imágenes, clips animados y video MP4 final
            listo para publicar en TikTok, Reels y YouTube Shorts.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/register"
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 text-white font-bold px-8 py-4 rounded-xl text-base transition-all shadow-xl shadow-violet-900/30"
            >
              ⚡ Crear mi primer microdrama gratis
            </Link>
            <Link
              href="/login"
              className="w-full sm:w-auto text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Ya tengo cuenta →
            </Link>
          </div>

          <p className="text-xs text-zinc-600 mt-4">5 créditos gratis al registrarte · Sin tarjeta</p>
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
            <h2 className="text-3xl font-bold mb-3">Todo incluido en un solo clic</h2>
            <p className="text-zinc-400">Cada crédito activa el pipeline completo de producción</p>
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
          <p className="text-zinc-500 text-sm mb-8">Elige tu género y SAGAIA adapta todo — tono, imágenes, narrativa</p>
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
          <p className="text-zinc-400 mb-8">5 microdramas gratis. Sin tarjeta de crédito.</p>
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
            <span className="font-bold text-white">SAGAIA</span>
            <span className="text-zinc-600 text-sm">· Studio AI</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-zinc-600">
            <Link href="/pricing" className="hover:text-zinc-400 transition-colors">Precios</Link>
            <Link href="/login" className="hover:text-zinc-400 transition-colors">Login</Link>
            <span>© 2026 SAGAIA. Todos los derechos reservados.</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
