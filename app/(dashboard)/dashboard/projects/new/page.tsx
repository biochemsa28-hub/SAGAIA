"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  NICHOS, TONES, DURATION_OPTIONS, VISUAL_STYLES, PLATFORMS,
} from "@/lib/constants/nichos";
import {
  Sparkles, CheckCircle, AlertCircle, ArrowRight, ArrowLeft,
  Zap, RefreshCw, Copy, TrendingUp,
} from "lucide-react";
import type { StoryOutput } from "@/lib/validators/story.schema";

// ─── Per-nicho color themes ────────────────────────────────────────────────────
const NICHO_THEME: Record<string, {
  card: string; border: string; selected: string; accent: string;
  glow: string; pill: string; emoji: string; tagline: string; bar: string;
}> = {
  terror:       { card: "from-red-950/80 to-zinc-950",    border: "border-red-900/50",     selected: "border-red-500 shadow-red-900/60",   accent: "text-red-400",     glow: "shadow-red-900/50",    pill: "bg-red-950/60 border-red-800/50 text-red-300",    emoji: "😱", tagline: "Miedo que no se olvida",        bar: "bg-red-600" },
  romance:      { card: "from-rose-950/80 to-zinc-950",   border: "border-rose-900/50",    selected: "border-rose-400 shadow-rose-900/60",  accent: "text-rose-400",    glow: "shadow-rose-900/50",   pill: "bg-rose-950/60 border-rose-800/50 text-rose-300",  emoji: "💔", tagline: "Amor que duele y enamora",      bar: "bg-rose-500" },
  misterio:     { card: "from-blue-950/80 to-zinc-950",   border: "border-blue-900/50",    selected: "border-blue-400 shadow-blue-900/60",  accent: "text-blue-400",    glow: "shadow-blue-900/50",   pill: "bg-blue-950/60 border-blue-800/50 text-blue-300",  emoji: "🔍", tagline: "Preguntas sin respuesta",       bar: "bg-blue-500" },
  inspiracional: { card: "from-emerald-950/70 to-zinc-950", border: "border-emerald-900/50", selected: "border-emerald-400 shadow-emerald-900/60", accent: "text-emerald-400", glow: "shadow-emerald-900/50", pill: "bg-emerald-950/60 border-emerald-800/50 text-emerald-300", emoji: "💪", tagline: "Historias que cambian vidas", bar: "bg-emerald-500" },
  fantasia:     { card: "from-violet-950/80 to-zinc-950", border: "border-violet-900/50",  selected: "border-violet-400 shadow-violet-900/60", accent: "text-violet-400", glow: "shadow-violet-900/50", pill: "bg-violet-950/60 border-violet-800/50 text-violet-300", emoji: "✨", tagline: "Mundos imposibles, reales",    bar: "bg-violet-500" },
  historia:     { card: "from-amber-950/70 to-zinc-950",  border: "border-amber-900/50",   selected: "border-amber-400 shadow-amber-900/60",  accent: "text-amber-400",   glow: "shadow-amber-900/50",  pill: "bg-amber-950/60 border-amber-800/50 text-amber-300",  emoji: "📜", tagline: "Verdades más raras que la ficción", bar: "bg-amber-500" },
};
const DEFAULT_THEME = NICHO_THEME.fantasia!;

const QUICK_IDEAS: Record<string, string[]> = {
  terror: ["Una mujer escucha la voz de su hija llamándola... pero su hija lleva 3 años muerta", "Un hombre recibe fotos de su propia casa tomadas mientras dormía, pero vive solo", "Una niña dibuja el mismo monstruo cada noche. Sus padres descubren que existe", "El vecino que murió hace 3 años sigue encendiendo las luces a medianoche", "Una app de meditación le habla al usuario por su nombre aunque nunca se lo dijo"],
  romance: ["Dos rivales quedan atrapados en un ascensor durante un apagón de 8 horas", "Una mujer descubre que su marido tiene una segunda familia — y se enamora del detective", "El ex que la destrozó aparece en su boda como el mejor amigo del novio", "Dos personas intercambian accidentalmente los celulares y empiezan a leer sus vidas", "Una viuda encuentra cartas de su marido dirigidas a otra mujer... escritas antes de conocerla"],
  misterio: ["Una aldea entera desaparece en 24 horas y nadie en el mundo lo nota excepto una persona", "Un periodista recibe el diario de alguien que murió... con entradas del futuro", "Un detective descubre que todos los crímenes de la ciudad los cometió la misma persona: él mismo", "Una cámara de seguridad graba la misma escena todos los días exactamente a las 3:17am", "Cada vez que llueve en el pueblo, alguien pierde su memoria de los últimos 10 años"],
  inspiracional: ["Un mendigo rechaza millones de dólares por una razón que nadie entiende hasta el final", "Una madre de 58 años aprende a leer para leerle cuentos a su nieto antes de morir", "Un atleta paralímpico entrena en secreto durante 10 años para un único momento", "Un chef sin manos gana el campeonato mundial con una técnica que inventó él solo", "Una mujer con cáncer terminal decide vivir como nunca lo hizo en 40 años"],
  fantasia: ["Un hombre puede ver cómo va a morir cada persona que mira — excepto él mismo", "En un mundo donde los sueños son colectivos, alguien empieza a contaminarlos", "Una chica puede detener el tiempo, pero cada segundo le cuesta un recuerdo", "Un artista descubre que todo lo que pinta se vuelve real 48 horas después", "Los fantasmas solo son visibles para niños menores de 7 años. Una niña tiene que salvar el mundo"],
  historia: ["El guardia que salvó a Miles Davis en 1969 y nunca recibió crédito", "La ciudad que desapareció del mapa oficial durante 40 años sin que nadie lo supiera", "La mujer que engañó a toda la industria farmacéutica durante 15 años", "El experimento psicológico más perturbador de la historia que aún no tiene respuestas", "El soldado que siguió combatiendo 29 años después del fin de la guerra porque nadie le avisó"],
};

const TRENDING = [
  { emoji: "🔥", label: "Traición en familia",  niche: "drama",       tone: "drama" },
  { emoji: "💀", label: "Casa embrujada real",   niche: "terror",      tone: "horror" },
  { emoji: "❤️‍🔥", label: "Amor prohibido",      niche: "romance",     tone: "romance" },
  { emoji: "🧠", label: "Secreto de 20 años",    niche: "misterio",    tone: "mystery" },
  { emoji: "💪", label: "De cero a millonario",  niche: "inspiracional", tone: "inspirational" },
];

const GEN_STEPS = [
  { key: "story",   label: "Construyendo el arco narrativo…",       pct: 20, icon: "✍️" },
  { key: "scenes",  label: "Diseñando el ritmo por escenas…",        pct: 45, icon: "🎬" },
  { key: "prompts", label: "Creando imágenes cinematográficas…",     pct: 68, icon: "🖼️" },
  { key: "seo",     label: "Optimizando para viralidad…",            pct: 88, icon: "📈" },
  { key: "done",    label: "¡Tu historia está lista!",               pct: 100, icon: "⚡" },
];

interface FormState {
  niche: string; sub_niche: string; topic: string; tone: string;
  duration_target: string; language: string; visual_style: string;
  target_platform: string; additional_instructions: string;
}
const DEFAULTS: FormState = {
  niche: "", sub_niche: "", topic: "", tone: "",
  duration_target: "60s", language: "es",
  visual_style: "cinematic", target_platform: "tiktok",
  additional_instructions: "",
};

export default function NewProjectPage() {
  return <Suspense fallback={null}><NewProjectForm /></Suspense>;
}

function NewProjectForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(() => ({
    ...DEFAULTS,
    niche: searchParams.get("niche") ?? "",
    tone:  searchParams.get("tone")  ?? "",
    duration_target: searchParams.get("duration") ?? "60s",
    topic: searchParams.get("topic") ?? "",
  }));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [credits, setCredits] = useState<number | null>(null);
  const [ideaIdx, setIdeaIdx] = useState(0);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genStep, setGenStep] = useState(0);
  const [genError, setGenError] = useState<string | null>(null);
  const [result, setResult] = useState<StoryOutput | null>(null);
  const [dbProjectId, setDbProjectId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/credits").then(r => r.json())
      .then((d: { credits?: number }) => { if (typeof d.credits === "number") setCredits(d.credits); })
      .catch(() => null);
  }, []);

  // Auto-advance to step 1 if niche came from URL
  useEffect(() => {
    if (form.niche && form.tone && form.topic && step === 0) setStep(1);
  }, []);

  const theme = NICHO_THEME[form.niche] ?? DEFAULT_THEME;
  const set = (field: keyof FormState) => (value: string) => {
    setForm(f => ({ ...f, [field]: value }));
    setErrors(e => ({ ...e, [field]: undefined }));
  };
  const selectedNicho = NICHOS.find(n => n.id === form.niche);
  const nichoIdeas = QUICK_IDEAS[form.niche] ?? [];

  function nextIdea() {
    if (!nichoIdeas.length) return;
    const next = (ideaIdx + 1) % nichoIdeas.length;
    setIdeaIdx(next);
    set("topic")(nichoIdeas[next] ?? "");
  }

  function validateStep(s: number) {
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (s === 0) {
      if (!form.niche) errs.niche = "Elige un nicho para continuar";
      if (!form.tone)  errs.tone  = "Elige un tono";
    }
    if (s === 1) {
      if (!form.topic || form.topic.length < 5) errs.topic = "Describe el tema (mínimo 5 caracteres)";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function goNext() { if (validateStep(step)) setStep(s => s + 1); }
  function goBack() { setStep(s => Math.max(0, s - 1)); setErrors({}); }

  async function generate() {
    if (!validateStep(1)) { setStep(1); return; }
    setGenerating(true);
    setGenError(null);
    setGenStep(0);
    let si = 0;
    const iv = setInterval(() => { if (si < GEN_STEPS.length - 2) { si++; setGenStep(si); } }, 1100);
    try {
      const res = await fetch("/api/generate/story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      clearInterval(iv);
      if (!res.ok) { const e = await res.json() as { error?: string }; throw new Error(e.error ?? "Error"); }
      const data = await res.json() as { project_id: string | null; data: StoryOutput };
      setGenStep(GEN_STEPS.length - 1);
      setResult(data.data);
      setDbProjectId(data.project_id);
    } catch (err) {
      clearInterval(iv);
      setGenError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setGenerating(false);
    }
  }

  // ── GENERATING ──────────────────────────────────────────────────────────────
  if (generating) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4 relative overflow-hidden">
        {/* Atmospheric bg */}
        <div className={`absolute inset-0 bg-gradient-to-br ${theme.card} opacity-60 pointer-events-none`} />
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full blur-3xl opacity-10 pointer-events-none" style={{ background: "radial-gradient(circle, #7c3aed, transparent)" }} />

        <div className="relative z-10 max-w-sm w-full text-center space-y-8">
          {/* Icon */}
          <div className="relative mx-auto w-24 h-24">
            <div className="w-24 h-24 rounded-3xl bg-zinc-900 border border-zinc-700 flex items-center justify-center shadow-2xl">
              <span className="text-4xl">{GEN_STEPS[genStep]?.icon}</span>
            </div>
            <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-violet-500 animate-ping" />
            <div className="absolute -bottom-1 -left-1 w-3 h-3 rounded-full bg-pink-500 animate-ping" style={{ animationDelay: "0.5s" }} />
          </div>

          <div>
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">VYNAVO está creando</p>
            <h2 className="text-xl font-extrabold text-white">{GEN_STEPS[genStep]?.label}</h2>
          </div>

          {/* Progress bar */}
          <div className="space-y-2">
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 bg-gradient-to-r from-violet-600 to-pink-600"
                style={{ width: `${GEN_STEPS[genStep]?.pct ?? 0}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-zinc-600">
              <span>Generando</span>
              <span>{GEN_STEPS[genStep]?.pct ?? 0}%</span>
            </div>
          </div>

          {/* Steps checklist */}
          <div className="space-y-2 text-left">
            {GEN_STEPS.slice(0, genStep + 1).map((s, i) => (
              <div key={s.key} className="flex items-center gap-2.5">
                {i < genStep
                  ? <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                  : <div className="w-4 h-4 rounded-full border-2 border-violet-500 border-t-transparent animate-spin shrink-0" />}
                <span className={`text-xs ${i < genStep ? "text-zinc-600 line-through" : "text-white font-medium"}`}>{s.label}</span>
              </div>
            ))}
          </div>

          <p className="text-xs text-zinc-700">💡 Los creadores que publican a diario crecen 3× más rápido</p>
        </div>
      </div>
    );
  }

  // ── RESULT ──────────────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="min-h-screen bg-zinc-950">
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-emerald-950/30 to-transparent h-48 pointer-events-none" />
          <div className="relative max-w-lg mx-auto px-4 pt-8 pb-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-900/40 border border-emerald-700/30 flex items-center justify-center mx-auto mb-3">
              <CheckCircle className="w-8 h-8 text-emerald-400" />
            </div>
            <h1 className="text-2xl font-extrabold text-white mb-1">Historia creada</h1>
            <p className="text-sm text-zinc-500">
              {result.production_notes?.scene_count ?? result.scenes.length} escenas ·{" "}
              {result.production_notes?.total_duration_seconds}s ·{" "}
              <span className={theme.accent + " capitalize font-medium"}>{result.meta.tone}</span>
            </p>
          </div>
        </div>

        <div className="max-w-lg mx-auto px-4 pb-24 space-y-4">
          {/* Title */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-2">Título</p>
            <h2 className="text-lg font-extrabold text-white leading-tight">{result.meta.title}</h2>
          </div>

          {/* Hook */}
          <div className={`relative bg-gradient-to-br ${theme.card} border ${theme.border} rounded-2xl p-5`}>
            <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${theme.accent}`}>🎣 Hook de apertura</p>
            <p className="text-base text-white italic font-medium leading-relaxed">
              &ldquo;{result.story.hook}&rdquo;
            </p>
            <button
              onClick={() => { void navigator.clipboard.writeText(result.story.hook); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className="absolute top-4 right-4 p-2 rounded-lg bg-zinc-800/60 hover:bg-zinc-700/60 transition-colors"
            >
              {copied ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
            </button>
          </div>

          {/* Scenes preview */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
            <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Escenas</p>
            {result.scenes.slice(0, 4).map((s) => (
              <div key={s.scene_number} className="flex gap-3">
                <div className={`w-6 h-6 rounded-full ${theme.pill} border flex items-center justify-center shrink-0 text-[10px] font-extrabold`}>
                  {s.scene_number}
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2">{s.narration_text}</p>
              </div>
            ))}
            {result.scenes.length > 4 && (
              <p className="text-xs text-zinc-700 pl-9">+ {result.scenes.length - 4} escenas más…</p>
            )}
          </div>

          {/* SEO */}
          {result.seo && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-2">Hashtags generados</p>
              <div className="flex flex-wrap gap-1.5">
                {result.seo.hashtags.slice(0, 8).map(h => (
                  <span key={h} className="text-[10px] px-2.5 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400">{h}</span>
                ))}
              </div>
            </div>
          )}

          {/* CTAs */}
          <button
            onClick={() => router.push(dbProjectId ? `/dashboard/projects/${dbProjectId}` : "/dashboard")}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 text-white font-extrabold py-4 rounded-2xl text-sm transition-all shadow-lg shadow-violet-900/30 active:scale-[0.98]"
          >
            <Zap className="w-5 h-5" />
            Iniciar producción de video
            <ArrowRight className="w-5 h-5" />
          </button>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => { setResult(null); setDbProjectId(null); setForm(f => ({ ...DEFAULTS, niche: f.niche, tone: f.tone, duration_target: f.duration_target })); setStep(1); }}
              className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 text-xs font-medium transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Otro del mismo nicho
            </button>
            <button
              onClick={() => { setResult(null); setDbProjectId(null); setForm(DEFAULTS); setStep(0); }}
              className="flex items-center justify-center gap-1.5 py-3 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 text-xs font-medium transition-all"
            >
              <Sparkles className="w-3.5 h-3.5" /> Historia nueva
            </button>
          </div>

          {credits !== null && credits <= 3 && credits > 0 && (
            <div className="flex items-center gap-2 p-3 bg-amber-950/30 border border-amber-700/30 rounded-xl">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <p className="text-xs text-amber-300">
                Te quedan <strong>{credits} NAVOS</strong>.{" "}
                <a href="/pricing" className="underline">Recarga →</a>
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── FORM WIZARD ─────────────────────────────────────────────────────────────
  const STEPS = ["Universo", "Historia", "Visión"];

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">

      {/* ── Dynamic header with theme color ── */}
      <div className={`relative overflow-hidden border-b border-zinc-800/60 transition-all duration-500`}>
        <div className={`absolute inset-0 bg-gradient-to-r ${theme.card} opacity-80 pointer-events-none transition-all duration-500`} />
        <div className="relative px-4 pt-4 pb-5">
          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 mb-4">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center gap-2">
                <div className="flex flex-col items-center gap-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold transition-all duration-300 ${
                    i < step ? "bg-emerald-600 text-white" :
                    i === step ? "bg-white text-zinc-900" :
                    "bg-zinc-800 text-zinc-600"
                  }`}>
                    {i < step ? <CheckCircle className="w-4 h-4" /> : i + 1}
                  </div>
                  <span className={`text-[9px] font-bold uppercase tracking-wider transition-colors ${i === step ? "text-white" : "text-zinc-600"}`}>{label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-8 h-0.5 mb-4 rounded-full transition-all duration-500 ${i < step ? theme.bar : "bg-zinc-800"}`} />
                )}
              </div>
            ))}
          </div>

          {/* Title */}
          <div className="text-center">
            <h1 className="text-lg font-extrabold text-white">
              {step === 0 && "¿Qué universo quieres crear?"}
              {step === 1 && "Cuéntame tu historia"}
              {step === 2 && "Define tu visión"}
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              {step === 0 && "Elige el nicho y el tono emocional"}
              {step === 1 && "El tema y la duración de tu video"}
              {step === 2 && "Estilo visual, plataforma e idioma"}
            </p>
          </div>
        </div>
      </div>

      {/* ── STEP 0: Universo ── */}
      {step === 0 && (
        <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-5 space-y-5 pb-32">

          {/* Trending */}
          <div>
            <div className="flex items-center gap-1.5 mb-2.5">
              <TrendingUp className="w-3.5 h-3.5 text-pink-400" />
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Trending ahora</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {TRENDING.map(t => (
                <button
                  key={t.label}
                  onClick={() => { set("niche")(t.niche); set("tone")(t.tone); const ideas = QUICK_IDEAS[t.niche] ?? []; if (ideas.length) set("topic")(ideas[0] ?? ""); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 hover:border-pink-700/60 text-xs text-zinc-400 hover:text-white transition-all"
                >
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Nicho grid */}
          <div>
            <p className="text-xs font-bold text-zinc-400 mb-3">Elige tu nicho <span className="text-red-400">*</span></p>
            <div className="grid grid-cols-2 gap-3">
              {NICHOS.map(n => {
                const t = NICHO_THEME[n.id] ?? DEFAULT_THEME;
                const active = form.niche === n.id;
                return (
                  <button
                    key={n.id}
                    onClick={() => { set("niche")(n.id); set("sub_niche")(""); setIdeaIdx(0); }}
                    className={`relative overflow-hidden rounded-2xl border p-4 text-left transition-all duration-300 group ${
                      active
                        ? `bg-gradient-to-br ${t.card} ${t.selected} shadow-xl scale-[1.02]`
                        : `bg-zinc-900 ${t.border} hover:scale-[1.01] hover:brightness-110`
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-3xl">{t.emoji}</span>
                      {active && <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />}
                    </div>
                    <p className="text-sm font-extrabold text-white">{n.label}</p>
                    <p className={`text-[10px] mt-0.5 transition-colors ${active ? t.accent : "text-zinc-600"}`}>{t.tagline}</p>
                  </button>
                );
              })}
            </div>
            {errors.niche && <p className="text-xs text-red-400 mt-2">{errors.niche}</p>}
          </div>

          {/* Sub-nichos */}
          {selectedNicho && (
            <div>
              <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-2">Especialidad</p>
              <div className="flex flex-wrap gap-2">
                {selectedNicho.sub_nichos.map(s => (
                  <button
                    key={s.id}
                    onClick={() => set("sub_niche")(s.id === form.sub_niche ? "" : s.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                      form.sub_niche === s.id ? `${theme.pill} scale-105` : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tono */}
          <div>
            <p className="text-xs font-bold text-zinc-400 mb-3">Tono emocional <span className="text-red-400">*</span></p>
            <div className="flex flex-wrap gap-2">
              {TONES.map(t => (
                <button
                  key={t.id}
                  onClick={() => set("tone")(t.id)}
                  className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition-all ${
                    form.tone === t.id
                      ? `${theme.pill} scale-105 shadow-lg`
                      : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {errors.tone && <p className="text-xs text-red-400 mt-1.5">{errors.tone}</p>}
          </div>
        </div>
      )}

      {/* ── STEP 1: Historia ── */}
      {step === 1 && (
        <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-5 space-y-5 pb-32">

          {/* Nicho selected badge */}
          {form.niche && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${theme.pill} w-fit`}>
              <span>{theme.emoji}</span>
              <span className="text-xs font-bold capitalize">{form.niche}</span>
              <span className="text-[10px] opacity-60">· {form.tone}</span>
            </div>
          )}

          {/* Topic */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-zinc-400">Describe tu historia <span className="text-red-400">*</span></p>
              {nichoIdeas.length > 0 && (
                <button onClick={nextIdea} className={`flex items-center gap-1 text-xs ${theme.accent} hover:opacity-80 transition-opacity`}>
                  <RefreshCw className="w-3 h-3" /> Inspirarme
                </button>
              )}
            </div>
            <textarea
              value={form.topic}
              onChange={e => set("topic")(e.target.value)}
              rows={4}
              placeholder="Ej: Una mujer descubre que su marido lleva doble vida y decide vengarse de forma inesperada…"
              className={`w-full bg-zinc-900 border rounded-2xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none transition-all resize-none ${
                errors.topic ? "border-red-700" : `border-zinc-800 focus:${theme.border}`
              }`}
            />
            {errors.topic && <p className="text-xs text-red-400 mt-1">{errors.topic}</p>}
            <p className="text-[10px] text-zinc-700 mt-1">Cuanto más específico, más viral. La IA construye el resto.</p>
          </div>

          {/* Quick ideas */}
          {nichoIdeas.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-2.5">Ideas para {form.niche}</p>
              <div className="space-y-2">
                {nichoIdeas.slice(0, 3).map((idea, i) => (
                  <button
                    key={i}
                    onClick={() => { set("topic")(idea); setIdeaIdx(i); }}
                    className={`w-full text-left px-4 py-3 rounded-xl border transition-all group ${
                      form.topic === idea
                        ? `bg-gradient-to-r ${theme.card} ${theme.border}`
                        : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"
                    }`}
                  >
                    <span className={`text-[10px] font-bold uppercase mr-2 ${theme.accent}`}>Idea {i + 1}</span>
                    <span className="text-xs text-zinc-300 leading-relaxed">{idea}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Duration */}
          <div>
            <p className="text-xs font-bold text-zinc-400 mb-3">Duración del video</p>
            <div className="grid grid-cols-2 gap-2">
              {DURATION_OPTIONS.map(d => (
                <button
                  key={d.id}
                  onClick={() => set("duration_target")(d.id)}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    form.duration_target === d.id
                      ? `bg-gradient-to-br ${theme.card} ${theme.border} shadow-lg`
                      : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"
                  }`}
                >
                  <p className={`text-sm font-extrabold ${form.duration_target === d.id ? "text-white" : "text-zinc-300"}`}>
                    {d.label.split("(")[0]?.trim()}
                  </p>
                  <p className={`text-[10px] mt-0.5 ${form.duration_target === d.id ? theme.accent : "text-zinc-600"}`}>
                    {d.scenes} escenas
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 2: Visión ── */}
      {step === 2 && (
        <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-5 space-y-5 pb-32">

          {/* Estilo visual */}
          <div>
            <p className="text-xs font-bold text-zinc-400 mb-3">Estilo visual</p>
            <div className="grid grid-cols-3 gap-2">
              {VISUAL_STYLES.map(v => (
                <button
                  key={v.id}
                  onClick={() => set("visual_style")(v.id)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    form.visual_style === v.id
                      ? `bg-gradient-to-br ${theme.card} ${theme.border}`
                      : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"
                  }`}
                >
                  <p className={`text-xs font-extrabold ${form.visual_style === v.id ? "text-white" : "text-zinc-300"}`}>{v.label}</p>
                  <p className="text-[10px] text-zinc-600 mt-0.5 leading-tight">{v.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Platform + Language */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-bold text-zinc-400 mb-2.5">Plataforma</p>
              <div className="space-y-1.5">
                {PLATFORMS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => set("target_platform")(p.id)}
                    className={`w-full px-3 py-2.5 rounded-xl border text-xs font-medium text-left transition-all ${
                      form.target_platform === p.id
                        ? `${theme.pill} border font-bold`
                        : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-zinc-400 mb-2.5">Idioma</p>
              <div className="space-y-1.5">
                {[{ value: "es", label: "🇪🇸 Español" }, { value: "en", label: "🇺🇸 English" }, { value: "pt", label: "🇧🇷 Português" }].map(l => (
                  <button
                    key={l.value}
                    onClick={() => set("language")(l.value)}
                    className={`w-full px-3 py-2.5 rounded-xl border text-xs font-medium text-left transition-all ${
                      form.language === l.value
                        ? `${theme.pill} border font-bold`
                        : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700"
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Additional instructions */}
          <div>
            <p className="text-xs font-bold text-zinc-400 mb-2">Instrucciones adicionales <span className="text-zinc-700">(opcional)</span></p>
            <textarea
              value={form.additional_instructions}
              onChange={e => set("additional_instructions")(e.target.value)}
              rows={2}
              placeholder="Ej: La protagonista debe ser mayor de 50 años. Incluir giro inesperado al final."
              className="w-full bg-zinc-900 border border-zinc-800 focus:border-zinc-700 rounded-xl px-4 py-3 text-xs text-zinc-300 placeholder-zinc-700 focus:outline-none resize-none transition-all"
            />
          </div>

          {/* Error */}
          {genError && (
            <div className="flex items-start gap-2 p-3 bg-red-950/40 border border-red-700/40 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{genError}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Fixed bottom nav ── */}
      <div className="fixed bottom-0 left-0 right-0 z-20">
        <div className={`absolute inset-0 bg-gradient-to-t ${theme.card} opacity-30 pointer-events-none`} />
        <div className="relative bg-zinc-950/95 backdrop-blur-sm border-t border-zinc-800/60 px-4 py-3 max-w-2xl mx-auto">
          {credits === 0 && (
            <div className="flex items-center gap-2 mb-2.5 p-2.5 bg-red-950/40 border border-red-800/40 rounded-xl">
              <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <p className="text-xs text-red-300">Sin NAVOS. <a href="/pricing" className="underline font-bold">Recargar →</a></p>
            </div>
          )}
          <div className="flex gap-3">
            {step > 0 && (
              <button
                onClick={goBack}
                className="flex items-center gap-1.5 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 text-sm font-medium hover:border-zinc-700 transition-all shrink-0"
              >
                <ArrowLeft className="w-4 h-4" /> Atrás
              </button>
            )}
            {step < 2 ? (
              <button
                onClick={goNext}
                className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-extrabold text-white transition-all active:scale-[0.98] shadow-lg ${theme.glow} bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500`}
              >
                Continuar <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={generate}
                disabled={credits === 0}
                className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-extrabold text-white transition-all active:scale-[0.98] shadow-lg ${theme.glow} bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                <Sparkles className="w-5 h-5" />
                Generar historia con IA
                <span className="text-[10px] font-normal opacity-70 ml-1">
                  · {credits !== null ? `${credits} NAVOS` : "…"}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
