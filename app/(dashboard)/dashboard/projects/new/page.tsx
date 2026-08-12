"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import confetti from "canvas-confetti";
import {
  NICHOS, TONES, DURATION_OPTIONS, VISUAL_STYLES, PLATFORMS,
} from "@/lib/constants/nichos";
import {
  Sparkles, CheckCircle, AlertCircle, ArrowRight, ArrowLeft,
  Zap, RefreshCw, TrendingUp, Flame, Loader2, Users,
} from "lucide-react";
import type { StoryOutput } from "@/lib/validators/story.schema";
import type { HookVariant } from "@/app/api/generate/hooks/route";
import { CREDIT_COST_BY_TIER } from "@/lib/config";
import { CinematicLoader } from "@/components/ui/CinematicLoader";

interface CastCharacterOption {
  name: string;
  role: string;
  gender: string;
  age: string;
  kind: string;
  personality: string;
  visual_description: string;
  voice_profile: string;
  options: string[];
  selectedIdx: number;
}

const VOICE_PROFILE_LABELS: Record<string, string> = {
  male_young: "Hombre joven", male_adult: "Hombre adulto", male_elderly: "Hombre mayor",
  male_villain: "Villano", female_young: "Mujer joven", female_adult: "Mujer adulta",
  female_elderly: "Mujer mayor", child: "Niño/a", narrator: "Narrador", creature: "Criatura",
};

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
  { key: "story",   label: "Encendiendo la chispa de la historia…",  pct: 20, icon: "✍️" },
  { key: "scenes",  label: "Dirigiendo el ritmo de cada escena…",     pct: 45, icon: "🎬" },
  { key: "prompts", label: "Pintando cada cuadro como cine…",         pct: 68, icon: "🎨" },
  { key: "seo",     label: "Afilando el gancho viral…",               pct: 88, icon: "🪝" },
  { key: "done",    label: "¡La obra está lista!",                     pct: 100, icon: "✨" },
];

// Wizard journey — 5 steps. Cada paso es un acto de la creación.
const WIZARD_STEPS = ["El Universo", "La Trama", "El Estilo", "El Reparto", "El Estreno"];

// Real AI-generated reference frame per visual style — the SAME scene rendered in
// each style so the user sees exactly how their microseries will look.
// Images live in /public/style-previews (generated once via fal). Fallback bg shows
// while the image loads.
const STYLE_THUMB: Record<string, { img: string; bg: string }> = {
  cinematic: { img: "/style-previews/cinematic.jpg", bg: "#0f3a47" },
  anime:     { img: "/style-previews/anime.jpg",     bg: "#1e2740" },
  realistic: { img: "/style-previews/realistic.jpg", bg: "#8a96a3" },
  cartoon:   { img: "/style-previews/cartoon.jpg",   bg: "#f472b6" },
  vintage:   { img: "/style-previews/vintage.jpg",   bg: "#9a8455" },
};

// Tiny aspect-ratio frame mock per platform (vertical phone vs widescreen).
const PLATFORM_THUMB: Record<string, { ratio: string; tint: string; icon: string }> = {
  tiktok:         { ratio: "9 / 16", tint: "linear-gradient(160deg,#25f4ee,#fe2c55)", icon: "🎵" },
  instagram:      { ratio: "9 / 16", tint: "linear-gradient(160deg,#feda75,#d62976,#962fbf)", icon: "📸" },
  youtube_shorts: { ratio: "9 / 16", tint: "linear-gradient(160deg,#ff4e45,#b31217)", icon: "▶️" },
  youtube_long:   { ratio: "16 / 9", tint: "linear-gradient(160deg,#ff4e45,#b31217)", icon: "▶️" },
};

// When the user picks a niche, pre-select the matching emotion so they don't have to
// choose the same genre twice (they can still override). Removes the nicho/tono overlap.
const NICHE_DEFAULT_TONE: Record<string, string> = {
  terror:       "horror",
  romance:      "romance",
  misterio:     "mystery",
  inspiracional:"inspirational",
  fantasia:     "fantasy",
  historia:     "documentary",
};

// Each emotion gets a face + color so the tone picker feels alive — and because the
// emotion now drives Claude's suggestions and the whole story's feeling.
const TONE_VISUAL: Record<string, { emoji: string; sub: string; active: string }> = {
  horror:        { emoji: "😱", sub: "Miedo real",     active: "bg-red-500/15 border-red-500/60 text-red-200" },
  romance:       { emoji: "💗", sub: "Ternura",        active: "bg-pink-500/15 border-pink-500/60 text-pink-200" },
  mystery:       { emoji: "🔍", sub: "Intriga",        active: "bg-blue-500/15 border-blue-500/60 text-blue-200" },
  inspirational: { emoji: "💪", sub: "Motivación",     active: "bg-emerald-500/15 border-emerald-500/60 text-emerald-200" },
  comedy:        { emoji: "😂", sub: "Risa",           active: "bg-amber-500/15 border-amber-500/60 text-amber-200" },
  thriller:      { emoji: "😰", sub: "Adrenalina",     active: "bg-orange-500/15 border-orange-500/60 text-orange-200" },
  documentary:   { emoji: "🎙️", sub: "Revelación",     active: "bg-teal-500/15 border-teal-500/60 text-teal-200" },
  fantasy:       { emoji: "🐉", sub: "Maravilla",      active: "bg-violet-500/15 border-violet-500/60 text-violet-200" },
  drama:         { emoji: "💔", sub: "Un nudo",        active: "bg-rose-500/15 border-rose-500/60 text-rose-200" },
  chisme:        { emoji: "🤫", sub: "Te cuento algo",  active: "bg-pink-500/15 border-pink-500/60 text-pink-200" },
  confesion:     { emoji: "😶‍🌫️", sub: "Nunca lo dije",   active: "bg-slate-500/15 border-slate-500/60 text-slate-200" },
};

// Hook type metadata for UI display
const HOOK_META: Record<string, { icon: string; color: string; bg: string; border: string }> = {
  question:      { icon: "❓", color: "text-blue-300",   bg: "bg-blue-950/50",   border: "border-blue-700/50" },
  in_medias_res: { icon: "⚡", color: "text-orange-300", bg: "bg-orange-950/50", border: "border-orange-700/50" },
  shocking_fact: { icon: "💥", color: "text-red-300",    bg: "bg-red-950/50",    border: "border-red-700/50" },
};

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

// Recharge modal — shown when a step returns 402 (out of NAVOS). Captures the sale
// at peak intention with a clear CTA instead of a buried error message.
function RechargeModal({ info, onClose }: { info: { required: number; have: number }; onClose: () => void }) {
  const missing = Math.max(0, info.required - info.have);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="vy-pop relative max-w-sm w-full rounded-3xl vy-grad-bg p-[1.5px] vy-glow" onClick={(e) => e.stopPropagation()}>
        <div className="rounded-3xl bg-zinc-950 p-7 text-center">
          <div className="w-16 h-16 rounded-2xl vy-grad-bg flex items-center justify-center mx-auto mb-4 vy-float2">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-xl font-extrabold vy-grad-text mb-1">¡Tu historia está lista para nacer!</h2>
          <p className="text-sm text-zinc-400 mb-5">Solo te faltan unos NAVOS para terminarla 🎬</p>

          <div className="vy-glass rounded-2xl p-4 mb-5 flex items-center justify-around">
            <div>
              <p className="text-lg font-extrabold text-white">{info.have.toLocaleString("es")}</p>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">tienes</p>
            </div>
            <div className="text-zinc-700">→</div>
            <div>
              <p className="text-lg font-extrabold text-violet-300">{info.required.toLocaleString("es")}</p>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">necesitas</p>
            </div>
            <div className="text-zinc-700">=</div>
            <div>
              <p className="text-lg font-extrabold text-pink-400">+{missing.toLocaleString("es")}</p>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">faltan</p>
            </div>
          </div>

          <Link href="/pricing">
            <button className="w-full flex items-center justify-center gap-2 vy-grad-bg text-white font-extrabold py-3.5 rounded-2xl text-sm vy-press mb-2">
              <Zap className="w-4 h-4" /> Recargar NAVOS y terminar
            </button>
          </Link>
          <button onClick={onClose} className="w-full text-xs text-zinc-500 hover:text-zinc-300 py-2 transition-colors">
            Quizás elija un tipo de video más económico
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const [generating, setGenerating] = useState(false);
  const [genStep, setGenStep] = useState(0);
  const [genError, setGenError] = useState<string | null>(null);
  const [result, setResult] = useState<StoryOutput | null>(null);
  const [dbProjectId, setDbProjectId] = useState<string | null>(null);
  // Casting selection state (step 4 — "Elenco" screen before hook)
  const [castingStep, setCastingStep] = useState(false);
  const [castingLoading, setCastingLoading] = useState(false);
  const [castCharacters, setCastCharacters] = useState<CastCharacterOption[]>([]);
  const [castError, setCastError] = useState<string | null>(null);
  // Hook selection state (step 5 — hook picker)
  const [hookStep, setHookStep] = useState(false);
  const [hooks, setHooks] = useState<HookVariant[]>([]);
  const [hooksLoading, setHooksLoading] = useState(false);
  const [selectedHook, setSelectedHook] = useState<HookVariant | null>(null);
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [savedCharacters, setSavedCharacters] = useState<Array<{ id: string; name: string; reference_image_url: string | null }>>([]);
  const [characterId, setCharacterId] = useState<string | null>(null);
  // Claude story suggestions based on the chosen emotion (Historia step)
  const [aiSuggestions, setAiSuggestions] = useState<Array<{ emoji: string; title: string; premise: string }>>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [userPlan, setUserPlan] = useState<string>("free");
  // Single premium tier — every video is the high-end "talking" obra de arte.
  const [tier] = useState<"kenburns" | "cinematic" | "talking">("talking");
  // "Sin NAVOS" recharge modal — shown when any step returns 402 so we capture the
  // sale at peak intention instead of dropping a plain error.
  const [rechargeInfo, setRechargeInfo] = useState<{ required: number; have: number } | null>(null);
  // Inline production — run the whole pipeline on THIS page (no redirect to the
  // project page). The user watches the live build and the final reveal here.
  const [prod, setProd] = useState<{
    active: boolean;
    phase: "voice" | "images" | "clips" | "final" | "done" | "error";
    error: string | null;
    videoUrl: string | null;
    projectId: string | null;
  } | null>(null);
  // Live scene previews — images fill in as the AI generates them (scene_number → url).
  const [scenePreviews, setScenePreviews] = useState<Record<number, string>>({});

  // Poll the project while it's producing so generated scene images appear LIVE.
  useEffect(() => {
    if (!prod?.active || !prod.projectId) return;
    if (!["voice", "images", "clips"].includes(prod.phase)) return;
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch(`/api/projects/${prod.projectId}`);
        if (!r.ok) return;
        const d = await r.json() as { scenes?: Array<{ id: string; scene_number: number }>; assets?: Array<{ asset_type: string; scene_id: string | null; public_url: string | null }> };
        const sceneById = new Map((d.scenes ?? []).map(s => [s.id, s.scene_number]));
        const map: Record<number, string> = {};
        for (const a of d.assets ?? []) {
          if (a.asset_type === "image" && a.public_url && a.scene_id) {
            const n = sceneById.get(a.scene_id);
            if (n) map[n] = a.public_url;
          }
        }
        if (alive && Object.keys(map).length) setScenePreviews(prev => ({ ...prev, ...map }));
      } catch { /* keep polling */ }
    };
    void poll();
    const iv = setInterval(poll, 2500);
    return () => { alive = false; clearInterval(iv); };
  }, [prod?.active, prod?.phase, prod?.projectId]);

  useEffect(() => {
    fetch("/api/credits").then(r => r.json())
      .then((d: { credits?: number; plan?: string }) => {
        if (typeof d.credits === "number") setCredits(d.credits);
        if (d.plan) setUserPlan(d.plan);
      })
      .catch(() => null);
    // Load saved recurring characters so the user can reuse one in this story.
    fetch("/api/characters").then(r => r.json())
      .then((d: { characters?: Array<{ id: string; name: string; reference_image_url: string | null }> }) => {
        if (Array.isArray(d.characters)) setSavedCharacters(d.characters);
      })
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

  // Ask Claude for 3 fresh story premises tuned to the chosen emotion (tone).
  async function suggestStories() {
    if (suggestLoading) return;
    setSuggestLoading(true);
    setSuggestError(null);
    try {
      const res = await fetch("/api/generate/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche: form.niche || "drama",
          tone: form.tone || "drama",
          sub_niche: form.sub_niche || undefined,
          language: form.language || "es",
        }),
      });
      const data = await res.json() as { suggestions?: Array<{ emoji: string; title: string; premise: string }>; error?: string };
      if (!res.ok || !data.suggestions?.length) throw new Error(data.error ?? "No se pudieron generar ideas");
      setAiSuggestions(data.suggestions);
    } catch (err) {
      setSuggestError(err instanceof Error ? err.message : "Error al sugerir");
    } finally {
      setSuggestLoading(false);
    }
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

  async function loadCasting() {
    setCastingLoading(true);
    setCastError(null);
    try {
      const res = await fetch("/api/casting/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche: form.niche,
          topic: form.topic,
          tone: form.tone,
          language: form.language,
          visual_style: form.visual_style,
        }),
      });
      if (res.status === 402) {
        const e = await res.json() as { required?: number; credits?: number };
        setRechargeInfo({ required: e.required ?? CREDIT_COST_BY_TIER[tier], have: e.credits ?? credits ?? 0 });
        return;
      }
      if (!res.ok) throw new Error("No se pudo diseñar el elenco");
      const data = await res.json() as { characters?: CastCharacterOption[] };
      const chars = (data.characters ?? []).map(c => ({ ...c, selectedIdx: 0 }));
      setCastCharacters(chars);
      setCastingStep(true);
    } catch (err) {
      setCastError(err instanceof Error ? err.message : "Error generando el elenco");
    } finally {
      setCastingLoading(false);
    }
  }

  async function loadHooks() {
    if (!validateStep(1)) return;
    setHooksLoading(true);
    setGenError(null);
    try {
      const res = await fetch("/api/generate/hooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche: form.niche,
          tone: form.tone,
          topic: form.topic,
          language: form.language,
          duration_target: form.duration_target,
        }),
      });
      if (!res.ok) throw new Error("No se pudieron generar los hooks");
      const data = await res.json() as { hooks: HookVariant[] };
      setHooks(data.hooks);
      setSelectedHook(data.hooks[0] ?? null);
      setHookStep(true);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Error");
    } finally {
      setHooksLoading(false);
    }
  }

  async function generate(hookOverride?: HookVariant | null) {
    if (!validateStep(1)) { setStep(1); return; }
    setGenerating(true);
    setGenError(null);
    setGenStep(0);

    // Inject chosen hook + cast design into additional_instructions
    const hook = hookOverride !== undefined ? hookOverride : selectedHook;
    const castContext = castCharacters.length > 0
      ? `\n[ELENCO DISEÑADO]: ${castCharacters.map(c => `${c.name} (${c.role}, ${c.voice_profile}): ${(c.personality ?? "").slice(0, 120)}`).join(" | ")}`
      : "";
    const extraInstructions = hook
      ? `[HOOK ELEGIDO]: ${hook.text}${castContext}${form.additional_instructions ? `\n${form.additional_instructions}` : ""}`
      : `${castContext.trimStart()}${form.additional_instructions ? (castContext ? `\n${form.additional_instructions}` : form.additional_instructions) : ""}`;

    let si = 0;
    const iv = setInterval(() => { if (si < GEN_STEPS.length - 2) { si++; setGenStep(si); } }, 1100);
    try {
      // The cast the user designed/selected on the "Elenco" screen — each member
      // carries the portrait they picked, so production can match face↔speaker.
      const castPayload = castCharacters.length > 0
        ? castCharacters.map((c) => ({
            name: c.name,
            role: c.role,
            voice_profile: c.voice_profile,
            reference_image_url: c.options[c.selectedIdx] || undefined,
          }))
        : undefined;
      const res = await fetch("/api/generate/story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, additional_instructions: extraInstructions, character_id: characterId ?? undefined, animation_tier: tier, cast: castPayload }),
      });
      clearInterval(iv);
      if (res.status === 402) {
        const e = await res.json() as { required?: number; credits?: number };
        setGenerating(false);
        setRechargeInfo({ required: e.required ?? 0, have: e.credits ?? credits ?? 0 });
        return;
      }
      if (!res.ok) { const e = await res.json() as { error?: string }; throw new Error(e.error ?? "Error"); }
      const data = await res.json() as { project_id: string | null; data: StoryOutput };
      setGenStep(GEN_STEPS.length - 1);
      setResult(data.data);
      setDbProjectId(data.project_id);
      // Produce the video RIGHT HERE — no page change. The user watches the live
      // build and the final reveal on this same screen.
      if (data.project_id) {
        setGenerating(false);
        void produceInline(data.project_id, tier);
      }
    } catch (err) {
      clearInterval(iv);
      setGenError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setGenerating(false);
    }
  }

  // Run the full production pipeline inline (voice + images → clips → final),
  // updating `prod` so the live screen reflects progress. No navigation.
  async function produceInline(projectId: string, animTier: "kenburns" | "cinematic" | "talking") {
    const post = (url: string, body: object) =>
      fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    try {
      setScenePreviews({});
      setProd({ active: true, phase: "voice", error: null, videoUrl: null, projectId });

      // Voice + images in parallel
      setProd(p => p && { ...p, phase: "voice" });
      const [voiceRes, imgRes] = await Promise.all([
        post("/api/voice", { project_id: projectId }),
        post("/api/images", { project_id: projectId }),
      ]);
      const voiceOk = (await voiceRes.json() as { success?: boolean }).success;
      const imgOk = (await imgRes.json() as { success?: boolean }).success;
      if (!voiceOk || !imgOk) throw new Error("No se pudo generar la voz o las imágenes");
      setProd(p => p && { ...p, phase: "images" });

      // Poll a set of jobs until all complete; returns the completed {scene,url} list.
      const pollStage = async (initial: Array<{ scene_number: number; request_id: string }>, stage?: "motion" | "lipsync") => {
        let jobs = initial.filter(j => j.request_id);
        if (!jobs.length) throw new Error("La animación no se pudo enviar");
        const urls: Array<{ scene_number: number; video_url: string }> = [];
        for (let i = 0; i < 200 && jobs.length; i++) {
          await new Promise(r => setTimeout(r, 6000));
          const col = await (await post("/api/videos", { project_id: projectId, action: "collect", stage, jobs: jobs.map(j => ({ scene_number: j.scene_number, request_id: j.request_id })) })).json() as
            { all_done: boolean; scenes: Array<{ scene_number: number; status: string; url?: string }> };
          for (const s of col.scenes) if (s.status === "completed" && s.url) urls.push({ scene_number: s.scene_number, video_url: s.url });
          // RETURN, not break: breaking leaves the pending list populated and the
          // check after the loop reads that as a timeout — so a fully successful
          // animation reported failure and refunded a video that already existed.
          if (col.all_done) return urls;
          jobs = jobs.filter(j => { const s = col.scenes.find(s => s.scene_number === j.scene_number); return s?.status !== "completed" && s?.status !== "failed"; });
        }
        if (jobs.length) throw new Error("La animación tardó demasiado. Intenta de nuevo en un momento.");
        return urls;
      };

      // Clips — the server decides: every scene, only the hero beats (hybrid), or
      // none. It answers "skipped" when there's nothing to animate.
      {
        setProd(p => p && { ...p, phase: "clips" });
        const subData = await (await post("/api/videos", { project_id: projectId, action: "submit" })).json() as
          { action?: string; pipeline?: string; jobs?: Array<{ scene_number: number; request_id: string; error?: string }> };
        if (subData.action !== "skipped") {
          const motionUrls = await pollStage(subData.jobs ?? [], subData.pipeline === "pro" ? "motion" : undefined);
          // PRO pipeline stage 2: lip-sync the moving clips.
          if (subData.pipeline === "pro") {
            const ls = await (await post("/api/videos", { project_id: projectId, action: "lipsync_submit", motion: motionUrls })).json() as
              { jobs?: Array<{ scene_number: number; request_id: string }> };
            await pollStage(ls.jobs ?? [], "lipsync");
          }
        }
      }

      // Final assembly (Shotstack)
      setProd(p => p && { ...p, phase: "final" });
      const subFinal = await (await post("/api/assemble", { project_id: projectId, action: "submit", add_subtitles: true })).json() as { render_id?: string; error?: string };
      if (!subFinal.render_id) throw new Error(subFinal.error ?? "No se pudo iniciar el montaje");
      let videoUrl: string | null = null;
      for (let i = 0; i < 96; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const chk = await (await post("/api/assemble", { project_id: projectId, action: "check", render_id: subFinal.render_id })).json() as { status: string; url?: string };
        if (chk.status === "done" && chk.url) { videoUrl = chk.url; break; }
        if (chk.status === "failed") throw new Error("El montaje final falló");
      }
      if (!videoUrl) throw new Error("El montaje final tardó demasiado. Intenta de nuevo.");

      setProd(p => p && { ...p, phase: "done", videoUrl });
      const colors = ["#7c3aed", "#ec4899", "#f59e0b", "#10b981", "#fff"];
      confetti({ particleCount: 140, spread: 90, origin: { y: 0.6 }, colors });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setProd(p => p ? { ...p, phase: "error", error: msg } : p);
      // Refund the credit since production failed (server-side guarded).
      try { await post("/api/credits/refund", { project_id: projectId }); } catch {}
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
          {/* Cinematic 3D loader — rotating holographic cube + orbiting particles */}
          <CinematicLoader icon={GEN_STEPS[genStep]?.icon} />

          <div>
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">VYNAVO está creando</p>
            <h2 className="text-xl font-extrabold text-white vy-glowtext">{GEN_STEPS[genStep]?.label}</h2>
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

  // ── PRODUCCIÓN INLINE (sin cambiar de página) ────────────────────────────────
  if (prod) {
    const phases = [
      { key: "voice",  emoji: "🎙️", label: "Dando voz a tu elenco" },
      { key: "images", emoji: "🎨", label: "Pintando las escenas" },
      ...(tier !== "kenburns" ? [{ key: "clips", emoji: "🎬", label: "Dando movimiento" }] : []),
      { key: "final",  emoji: "✨", label: "Montando tu microserie" },
    ];
    const curIdx = Math.max(0, phases.findIndex(p => p.key === prod.phase));
    const cur = phases[curIdx] ?? phases[phases.length - 1]!;
    const pct = prod.phase === "done" ? 100 : Math.round(((curIdx + 0.5) / phases.length) * 100);

    // ── REVEAL del video listo ──
    if (prod.phase === "done" && prod.videoUrl) {
      return (
        <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4 py-10">
          <div className="vy-pop max-w-sm w-full rounded-3xl vy-grad-bg p-[1.5px] vy-glow">
            <div className="rounded-3xl bg-zinc-950 p-6 text-center">
              <h2 className="text-2xl font-extrabold vy-grad-text mb-1">¡Tu microserie está lista! 🎉</h2>
              <p className="text-sm text-zinc-400 mb-4">Descárgala y conquista el feed</p>
              <video src={prod.videoUrl} controls playsInline className="w-40 mx-auto rounded-xl border border-zinc-700 mb-4 aspect-[9/16] object-cover bg-black" />
              <a href={prod.videoUrl} download className="w-full flex items-center justify-center gap-2 vy-grad-bg text-white font-extrabold py-3.5 rounded-2xl text-sm vy-press mb-2">
                Descargar MP4
              </a>
              <button onClick={() => { setProd(null); setResult(null); setHookStep(false); setCastingStep(false); setCastCharacters([]); setStep(0); }} className="w-full border border-violet-700/50 text-violet-300 hover:bg-violet-950/40 font-semibold py-2.5 rounded-2xl text-xs transition-all mb-2">
                ✨ Crear otra microserie
              </button>
              {prod.projectId && (
                <Link href={`/dashboard/projects/${prod.projectId}`}>
                  <button className="w-full text-xs text-zinc-500 hover:text-zinc-300 py-1.5 transition-colors">Ver detalle y kit de publicación →</button>
                </Link>
              )}
            </div>
          </div>
        </div>
      );
    }

    // ── ERROR ──
    if (prod.phase === "error") {
      return (
        <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4 text-center">
          <div className="max-w-sm w-full vy-glass rounded-3xl p-7">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
            <h2 className="text-lg font-extrabold text-white mb-1">Algo se atascó</h2>
            <p className="text-xs text-red-300 mb-1">{prod.error}</p>
            <p className="text-[11px] text-zinc-500 mb-5">Te devolvimos tus NAVOS. Puedes reintentar.</p>
            <button onClick={() => prod.projectId && produceInline(prod.projectId, tier)} className="w-full vy-grad-bg text-white font-extrabold py-3 rounded-2xl text-sm vy-press mb-2">
              Reintentar
            </button>
            {prod.projectId && (
              <Link href={`/dashboard/projects/${prod.projectId}`}>
                <button className="w-full text-xs text-zinc-500 hover:text-zinc-300 py-1.5">Abrir en el estudio →</button>
              </Link>
            )}
          </div>
        </div>
      );
    }

    // ── LIVE (en producción) ──
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4">
        <div className="relative max-w-sm w-full vy-glass rounded-3xl p-7 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-300 mb-1">VYNAVO está creando</p>
          <div className="relative">
            <CinematicLoader icon={cur.emoji} />
            <div className="absolute top-2 right-1/2 translate-x-16 w-10 h-10 rounded-full bg-zinc-950 border-2 border-cyan-400 flex items-center justify-center vy-pulse-soft">
              <span className="text-xs font-bold text-cyan-300">{pct}</span>
            </div>
          </div>
          <h2 className="text-lg font-bold vy-grad-text mb-1">{cur.label}…</h2>
          <p className="text-sm text-fuchsia-200 mb-5">✨ Tu historia cobra vida en tiempo real</p>
          <div className="space-y-2.5 text-left">
            {phases.map((ph, i) => (
              <div key={ph.key} className={`flex items-center gap-2.5 text-xs ${i === curIdx ? "vy-rise" : ""}`}>
                {i < curIdx ? <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                  : i === curIdx ? <Loader2 className="w-4 h-4 text-violet-400 animate-spin shrink-0" />
                  : <span className="w-4 h-4 rounded-full border border-zinc-700 shrink-0" />}
                <span className={i < curIdx ? "text-emerald-300" : i === curIdx ? "text-white font-semibold" : "text-zinc-600"}>{ph.label}</span>
              </div>
            ))}
          </div>

          {/* ── Preview EN VIVO de las escenas — aparecen al generarse ── */}
          {(() => {
            const total = result?.scenes?.length || Math.max(Object.keys(scenePreviews).length, 3);
            const ready = Object.keys(scenePreviews).length;
            return (
              <div className="mt-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Tus escenas</p>
                  <p className="text-[10px] font-bold text-violet-300">{ready}/{total} listas</p>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {Array.from({ length: total }, (_, k) => {
                    const n = k + 1;
                    const url = scenePreviews[n];
                    return (
                      <div key={n} className="relative aspect-[9/16] rounded-lg overflow-hidden border border-zinc-800 bg-zinc-900">
                        {url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={url} alt={`Escena ${n}`} className="vy-pop w-full h-full object-cover" />
                        ) : (
                          <div className="absolute inset-0 vy-shimmer2 flex items-center justify-center">
                            <span className="text-[10px] font-bold text-zinc-600">{n}</span>
                          </div>
                        )}
                        {url && <span className="absolute bottom-0.5 left-1 text-[8px] font-bold text-white/90 drop-shadow">{n}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          <p className="text-[11px] text-zinc-600 mt-5">No cierres esta pantalla mientras se crea tu video</p>
        </div>
      </div>
    );
  }

  // ── HOOK SELECTION ──────────────────────────────────────────────────────────
  if (hookStep && !generating) {
    const hookStepIdx = WIZARD_STEPS.length - 1; // "Gancho" is the last step
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col">
        {rechargeInfo && <RechargeModal info={rechargeInfo} onClose={() => setRechargeInfo(null)} />}
        {/* Header */}
        <div className={`relative overflow-hidden border-b border-zinc-800/60`}>
          <div className={`absolute inset-0 bg-gradient-to-r ${theme.card} opacity-80 pointer-events-none`} />
          <div className="relative px-4 pt-4 pb-5">
            {/* Step indicator — "Gancho" active (5/5) */}
            <div className="flex items-center justify-center gap-1.5 mb-4">
              {WIZARD_STEPS.map((label, i) => {
                const active = i === hookStepIdx;
                return (
                  <div key={label} className="flex items-center gap-1.5">
                    <div className="flex flex-col items-center gap-1">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-extrabold transition-all duration-300 ${
                        active ? "bg-white text-zinc-900" : "bg-emerald-600 text-white"
                      }`}>
                        {active ? i + 1 : <CheckCircle className="w-3.5 h-3.5" />}
                      </div>
                      <span className={`text-[8px] font-bold uppercase tracking-wider ${active ? "text-white" : "text-zinc-600"}`}>{label}</span>
                    </div>
                    {i < WIZARD_STEPS.length - 1 && (
                      <div className={`w-6 h-0.5 mb-4 rounded-full ${theme.bar}`} />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900/80 border border-zinc-700 mb-3">
                <Flame className="w-3.5 h-3.5 text-orange-400" />
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Último paso · el hook = el 80% de tu viral</span>
              </div>
              <h1 className="text-xl font-extrabold text-white">Elige tu gancho de apertura</h1>
              <p className="text-xs text-zinc-500 mt-1">Toca el que más te guste y genera tu video</p>
            </div>
          </div>
        </div>

        <div className="flex-1 max-w-lg mx-auto w-full px-4 py-5 space-y-4 pb-32">

          {/* Hook cards */}
          {hooks.map((hook) => {
            const meta = HOOK_META[hook.type] ?? HOOK_META["question"]!;
            const isSelected = selectedHook?.id === hook.id;
            return (
              <button
                key={hook.id}
                onClick={() => setSelectedHook(hook)}
                className={`w-full text-left rounded-2xl border-2 p-5 transition-all duration-200 ${
                  isSelected
                    ? `${meta.bg} ${meta.border} scale-[1.01] shadow-xl`
                    : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"
                }`}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">{meta.icon}</span>
                  <span className={`text-[10px] font-bold uppercase tracking-widest ${isSelected ? meta.color : "text-zinc-500"}`}>
                    {hook.type_label}
                  </span>
                  {isSelected && (
                    <CheckCircle className="w-4 h-4 text-emerald-400 ml-auto shrink-0" />
                  )}
                </div>

                {/* Hook text — the star of the show */}
                <p className={`text-base font-bold leading-snug mb-3 ${isSelected ? "text-white" : "text-zinc-200"}`}>
                  &ldquo;{hook.text}&rdquo;
                </p>

                {/* Why it works */}
                <div className={`flex items-start gap-1.5 px-3 py-2 rounded-lg ${isSelected ? "bg-black/30" : "bg-zinc-800/50"}`}>
                  <span className="text-[10px] text-zinc-500 mt-0.5">💡</span>
                  <p className={`text-[11px] leading-relaxed ${isSelected ? meta.color : "text-zinc-500"}`}>{hook.why}</p>
                </div>
              </button>
            );
          })}

          {/* Skip hook */}
          <button
            onClick={() => void generate(null)}
            className="w-full py-3 rounded-xl border border-zinc-800 text-zinc-600 text-xs hover:border-zinc-700 hover:text-zinc-400 transition-all"
          >
            Saltar — dejar que la IA elija el hook
          </button>

          {genError && (
            <div className="flex items-start gap-2 p-3 bg-red-950/40 border border-red-700/40 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{genError}</p>
            </div>
          )}
        </div>

        {/* Fixed bottom CTA */}
        <div className="fixed bottom-0 left-0 right-0 z-20">
          <div className={`absolute inset-0 bg-gradient-to-t ${theme.card} opacity-30 pointer-events-none`} />
          <div className="relative bg-zinc-950/95 backdrop-blur-sm border-t border-zinc-800/60 px-4 py-3 max-w-lg mx-auto">
            <div className="flex gap-3">
              <button
                onClick={() => { setHookStep(false); setCastingStep(true); }}
                className="flex items-center gap-1.5 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 text-sm font-medium hover:border-zinc-700 transition-all shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => void generate(selectedHook)}
                disabled={credits === 0}
                className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-extrabold text-white transition-all active:scale-[0.98] shadow-lg ${theme.glow} bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                <Sparkles className="w-5 h-5" />
                Generar mi video
                <span className="text-[10px] font-normal opacity-70 ml-1">
                  · {credits !== null ? `${credits} NAVOS` : "…"}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── CASTING SELECTION ────────────────────────────────────────────────────────
  if (castingStep && !hookStep && !generating) {
    const castingStepIdx = 3; // "Elenco" is index 3 in WIZARD_STEPS
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col">
        {rechargeInfo && <RechargeModal info={rechargeInfo} onClose={() => setRechargeInfo(null)} />}
        {/* Header */}
        <div className="relative overflow-hidden border-b border-zinc-800/60">
          <div className={`absolute inset-0 bg-gradient-to-r ${theme.card} opacity-80 pointer-events-none`} />
          <div className="relative px-4 pt-4 pb-5">
            {/* Step indicator */}
            <div className="flex items-center justify-center gap-1.5 mb-4">
              {WIZARD_STEPS.map((label, i) => {
                const active = i === castingStepIdx;
                return (
                  <div key={label} className="flex items-center gap-1.5">
                    <div className="flex flex-col items-center gap-1">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-extrabold transition-all duration-300 ${
                        i < castingStepIdx ? "bg-emerald-600 text-white" :
                        active ? "bg-white text-zinc-900" :
                        "bg-zinc-800 text-zinc-600"
                      }`}>
                        {i < castingStepIdx ? <CheckCircle className="w-3.5 h-3.5" /> : i + 1}
                      </div>
                      <span className={`text-[8px] font-bold uppercase tracking-wider ${active ? "text-white" : "text-zinc-600"}`}>{label}</span>
                    </div>
                    {i < WIZARD_STEPS.length - 1 && (
                      <div className={`w-6 h-0.5 mb-4 rounded-full ${i < castingStepIdx ? theme.bar : "bg-zinc-800"}`} />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900/80 border border-zinc-700 mb-3">
                <Users className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Tu elenco · Elige el retrato de cada personaje</span>
              </div>
              <h1 className="text-xl font-extrabold text-white">Conoce a tus personajes</h1>
              <p className="text-xs text-zinc-500 mt-1">La IA diseñó este elenco para tu historia. Elige el aspecto de cada uno.</p>
            </div>
          </div>
        </div>

        <div className="flex-1 max-w-lg mx-auto w-full px-4 py-5 space-y-6 pb-32">

          {castError && (
            <div className="flex items-start gap-2 p-3 bg-red-950/40 border border-red-700/40 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{castError}</p>
            </div>
          )}

          {castCharacters.map((char, ci) => (
            <div key={char.name} className="space-y-3">
              {/* Character header */}
              <div className={`flex items-start gap-3 p-4 rounded-2xl border bg-gradient-to-br ${theme.card} ${theme.border}`}>
                <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-extrabold text-lg bg-zinc-900 border ${theme.border}`}>
                  {char.gender === "female" ? "👩" : char.gender === "male" ? "👨" : "🧑"}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-extrabold text-white text-sm">{char.name}</p>
                    <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${theme.pill}`}>{char.role}</span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed line-clamp-2">{char.personality}</p>
                  <p className={`text-[10px] font-medium mt-1 ${theme.accent}`}>
                    🎙 {VOICE_PROFILE_LABELS[char.voice_profile] ?? char.voice_profile}
                  </p>
                </div>
              </div>

              {/* Portrait grid */}
              {char.options.length > 0 ? (
                <div>
                  <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-2">Elige su aspecto</p>
                  <div className="grid grid-cols-2 gap-2">
                    {char.options.map((url, oi) => (
                      <button
                        key={oi}
                        onClick={() => setCastCharacters(prev =>
                          prev.map((c, idx) => idx === ci ? { ...c, selectedIdx: oi } : c)
                        )}
                        className={`relative rounded-xl overflow-hidden aspect-square border-2 transition-all duration-200 ${
                          char.selectedIdx === oi
                            ? `${theme.selected} scale-[1.03] shadow-xl`
                            : "border-zinc-800 hover:border-zinc-600"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={`${char.name} opción ${oi + 1}`} className="w-full h-full object-cover" />
                        {char.selectedIdx === oi && (
                          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg">
                            <CheckCircle className="w-4 h-4 text-white" />
                          </div>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                          <p className="text-[9px] font-bold text-zinc-300">Opción {oi + 1}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="py-3 text-center text-xs text-zinc-600 bg-zinc-900 rounded-xl border border-zinc-800">
                  Sin opciones de retrato generadas
                </div>
              )}
            </div>
          ))}

          {/* Divider + skip */}
          <button
            onClick={() => void loadHooks()}
            className="w-full py-3 rounded-xl border border-zinc-800 text-zinc-600 text-xs hover:border-zinc-700 hover:text-zinc-400 transition-all"
          >
            Saltar selección de retratos
          </button>
        </div>

        {/* Fixed bottom CTA */}
        <div className="fixed bottom-0 left-0 right-0 z-20">
          <div className={`absolute inset-0 bg-gradient-to-t ${theme.card} opacity-30 pointer-events-none`} />
          <div className="relative bg-zinc-950/95 backdrop-blur-sm border-t border-zinc-800/60 px-4 py-3 max-w-lg mx-auto">
            <div className="flex gap-3">
              <button
                onClick={() => setCastingStep(false)}
                className="flex items-center gap-1.5 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 text-sm font-medium hover:border-zinc-700 transition-all shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => void loadHooks()}
                disabled={hooksLoading}
                className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-extrabold text-white transition-all active:scale-[0.98] shadow-lg ${theme.glow} bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 disabled:opacity-40`}
              >
                {hooksLoading ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Generando gancho…</>
                ) : (
                  <>Confirmar elenco <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── RESULT — auto-redirect splash ───────────────────────────────────────────
  if (result) {
    const sceneCount = result.production_notes?.scene_count ?? result.scenes.length;
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4 relative overflow-hidden">
        <div className={`absolute inset-0 bg-gradient-to-br ${theme.card} opacity-40 pointer-events-none`} />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full blur-3xl opacity-10 pointer-events-none bg-emerald-500" />

        <div className="relative z-10 max-w-sm w-full text-center space-y-6">
          {/* Success icon */}
          <div className="relative mx-auto w-20 h-20">
            <div className="w-20 h-20 rounded-3xl bg-emerald-900/60 border border-emerald-600/40 flex items-center justify-center shadow-2xl">
              <CheckCircle className="w-10 h-10 text-emerald-400" />
            </div>
            <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-400 animate-ping" />
          </div>

          <div>
            <h2 className="text-2xl font-extrabold text-white">¡Historia lista!</h2>
            <p className="text-sm text-zinc-400 mt-1">
              {sceneCount} escenas · {result.production_notes?.total_duration_seconds}s ·{" "}
              <span className={`${theme.accent} capitalize font-medium`}>{result.meta.tone}</span>
            </p>
          </div>

          {/* Hook preview */}
          <div className={`bg-gradient-to-br ${theme.card} border ${theme.border} rounded-2xl p-4 text-left`}>
            <p className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 ${theme.accent}`}>🎣 Tu hook</p>
            <p className="text-sm text-white italic leading-relaxed line-clamp-3">&ldquo;{result.story.hook}&rdquo;</p>
          </div>

          {/* Countdown + status */}
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2 text-zinc-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
              <span>
                {redirectCountdown !== null && redirectCountdown > 0
                  ? `Iniciando producción en ${redirectCountdown}s…`
                  : "Iniciando producción…"}
              </span>
            </div>

            {/* Progress bar countdown */}
            <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-600 to-pink-600 rounded-full transition-all duration-1000"
                style={{ width: redirectCountdown === 2 ? "0%" : redirectCountdown === 1 ? "50%" : "100%" }}
              />
            </div>

            {/* Manual override */}
            <button
              onClick={() => {
                if (redirectTimer.current) clearInterval(redirectTimer.current);
                router.push(dbProjectId ? `/dashboard/projects/${dbProjectId}?autostart=1` : "/dashboard");
              }}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 text-white text-sm font-extrabold shadow-lg"
            >
              <Zap className="w-4 h-4" /> Ir ahora <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── FORM WIZARD ─────────────────────────────────────────────────────────────
  const STEPS = WIZARD_STEPS;

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {rechargeInfo && <RechargeModal info={rechargeInfo} onClose={() => setRechargeInfo(null)} />}

      {/* ── Dynamic header with theme color ── */}
      <div className={`relative overflow-hidden border-b border-zinc-800/60 transition-all duration-500`}>
        <div className={`absolute inset-0 bg-gradient-to-r ${theme.card} opacity-80 pointer-events-none transition-all duration-500`} />
        <div className="relative px-4 pt-4 pb-5">
          {/* Step indicator */}
          <div className="flex items-center justify-center gap-1.5 mb-4">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className="flex flex-col items-center gap-1">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-extrabold transition-all duration-300 ${
                    i < step ? "bg-emerald-600 text-white" :
                    i === step ? "bg-white text-zinc-900" :
                    "bg-zinc-800 text-zinc-600"
                  }`}>
                    {i < step ? <CheckCircle className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  <span className={`text-[8px] font-bold uppercase tracking-wider transition-colors ${i === step ? "text-white" : "text-zinc-600"}`}>{label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-6 h-0.5 mb-4 rounded-full transition-all duration-500 ${i < step ? theme.bar : "bg-zinc-800"}`} />
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

      {/* ── STEP 0: Universo ─────────────────────────────────────────────────────
          Horizontal y cinematográfico. Elegir el nicho es elegir el MUNDO de una
          película, no llenar un formulario: cada tarjeta lleva el aura de su
          género (el mismo color que después tiñe subtítulos, música e imagen), un
          "telón" que respira, y la selección se siente física — la tarjeta se
          adelanta y las demás se apagan. Ancho completo: en desktop el paso vive
          en una sola pantalla, sin scroll. */}
      {step === 0 && (
        <div className="flex-1 max-w-5xl mx-auto w-full px-4 py-5 space-y-6 pb-32">

          {/* Trending */}
          <div>
            <div className="flex items-center gap-1.5 mb-2.5">
              <TrendingUp className="w-3.5 h-3.5 text-pink-400" />
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Trending ahora</p>
              <span className="w-1.5 h-1.5 rounded-full bg-pink-500 vy-pulse-soft" />
            </div>
            <div className="flex gap-2 flex-wrap">
              {TRENDING.map(t => (
                <button
                  key={t.label}
                  onClick={() => { set("niche")(t.niche); set("tone")(t.tone); const ideas = QUICK_IDEAS[t.niche] ?? []; if (ideas.length) set("topic")(ideas[0] ?? ""); }}
                  className="vy-press flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900/80 border border-zinc-800 hover:border-pink-600/70 hover:bg-zinc-800/80 text-xs text-zinc-400 hover:text-white transition-all"
                >
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Nicho — pósters horizontales, 3 columnas */}
          <div>
            <p className="text-xs font-bold text-zinc-400 mb-3">Elige tu universo <span className="text-red-400">*</span></p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {NICHOS.map(n => {
                const t = NICHO_THEME[n.id] ?? DEFAULT_THEME;
                const active = form.niche === n.id;
                const dimmed = Boolean(form.niche) && !active;
                return (
                  <button
                    key={n.id}
                    onClick={() => { set("niche")(n.id); set("sub_niche")(""); setIdeaIdx(0); const dt = NICHE_DEFAULT_TONE[n.id]; if (dt) set("tone")(dt); }}
                    className={`vy-press relative overflow-hidden rounded-2xl border text-left transition-all duration-300 group ${
                      active
                        ? `bg-gradient-to-br ${t.card} ${t.selected} shadow-2xl scale-[1.03] z-10`
                        : dimmed
                          ? `bg-zinc-900/60 ${t.border} opacity-55 hover:opacity-100 hover:scale-[1.01]`
                          : `bg-zinc-900 ${t.border} hover:scale-[1.02] hover:-translate-y-0.5 hover:shadow-xl`
                    }`}
                  >
                    {/* Aura del género: respira detrás del contenido. En hover se
                        enciende aunque la tarjeta no esté elegida — un vistazo de
                        cómo se siente ese mundo antes de comprometerse. */}
                    <div
                      className={`absolute inset-0 bg-gradient-to-br ${t.card} transition-opacity duration-500 ${active ? "opacity-100" : "opacity-0 group-hover:opacity-60"}`}
                      aria-hidden
                    />
                    <div
                      className={`absolute -top-8 -right-8 w-28 h-28 rounded-full blur-2xl transition-opacity duration-500 ${t.bar} ${active ? "opacity-25 vy-pulse-soft" : "opacity-0 group-hover:opacity-15"}`}
                      style={active ? { animationDuration: "3.2s" } : undefined}
                      aria-hidden
                    />

                    <div className="relative flex items-center gap-3.5 p-4">
                      <span className={`text-4xl shrink-0 transition-transform duration-300 ${active ? "vy-float2 scale-110" : "group-hover:scale-110"}`}>
                        {t.emoji}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold text-white leading-tight">{n.label}</p>
                        <p className={`text-[10px] mt-0.5 transition-colors ${active ? t.accent : "text-zinc-500 group-hover:text-zinc-400"}`}>{t.tagline}</p>
                      </div>
                      {active && <CheckCircle className={`w-4.5 h-4.5 ml-auto shrink-0 ${t.accent}`} style={{ animation: "vyPop .3s ease-out" }} />}
                    </div>

                    {/* Barra de firma: el color del género recorriendo la base,
                        vivo solo en la tarjeta elegida. */}
                    <div className={`relative h-0.5 ${active ? "" : "opacity-0"}`} aria-hidden>
                      <div
                        className={`absolute inset-0 ${t.bar}`}
                        style={{
                          backgroundImage: "linear-gradient(90deg, transparent, rgba(255,255,255,.55), transparent)",
                          backgroundSize: "200% 100%",
                          animation: active ? "vyShimmer2 2.4s linear infinite" : undefined,
                        }}
                      />
                    </div>
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

          {/* Tono emocional — visual: cada emoción con su cara y color */}
          <div>
            <p className="text-xs font-bold text-zinc-400 mb-1">Tono emocional <span className="text-zinc-600 font-normal">· se ajusta solo, cámbialo si quieres</span></p>
            <p className="text-[10px] text-zinc-600 mb-3">¿Qué quieres que SIENTA quien lo vea? Esto guía toda la historia.</p>
            {/* Cinta horizontal: los nueve tonos en una sola fila en desktop.
                Antes era una grilla 3x3 que estiraba la página hacia abajo y
                dejaba los costados vacíos — justo al revés de cómo se lee una
                pantalla ancha. */}
            <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
              {TONES.map(t => {
                const v = TONE_VISUAL[t.id] ?? { emoji: "🎬", sub: "", active: theme.pill };
                const active = form.tone === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => set("tone")(t.id)}
                    className={`vy-press flex flex-col items-center gap-0.5 px-1.5 py-2.5 rounded-xl border transition-all duration-200 ${
                      active
                        ? `${v.active} scale-[1.06] shadow-lg`
                        : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:-translate-y-0.5"
                    }`}
                  >
                    <span className={`text-xl transition-transform duration-200 ${active ? "scale-125" : ""}`}>{v.emoji}</span>
                    <span className={`text-[11px] font-bold ${active ? "" : "text-zinc-300"}`}>{t.label}</span>
                    <span className={`text-[9px] leading-none ${active ? "opacity-80" : "text-zinc-600"}`}>{v.sub}</span>
                  </button>
                );
              })}
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

          {/* ── Claude sugiere historias según la emoción elegida ── */}
          <div className="rounded-2xl border border-violet-800/40 bg-gradient-to-br from-violet-950/40 to-zinc-900/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg vy-grad-bg grid place-items-center text-sm shrink-0">✨</span>
                <div>
                  <p className="text-sm font-bold text-white leading-tight">¿No sabes qué contar?</p>
                  <p className="text-[11px] text-zinc-400 leading-tight">Claude te sugiere historias de <span className="text-violet-300 font-semibold">{form.tone || "tu emoción"}</span></p>
                </div>
              </div>
              <button
                onClick={() => void suggestStories()}
                disabled={suggestLoading}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-extrabold text-white vy-grad-bg vy-press disabled:opacity-50"
              >
                {suggestLoading
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Pensando…</>
                  : <><Sparkles className="w-3.5 h-3.5" /> {aiSuggestions.length ? "Otra vez" : "Sugerir"}</>}
              </button>
            </div>

            {suggestError && <p className="text-[11px] text-red-400 mt-2">{suggestError}</p>}

            {aiSuggestions.length > 0 && (
              <div className="space-y-2 mt-3">
                {aiSuggestions.map((s, i) => {
                  const active = form.topic === s.premise;
                  return (
                    <button
                      key={i}
                      onClick={() => set("topic")(s.premise)}
                      style={{ animationDelay: `${i * 90}ms` }}
                      className={`vy-fadeup opacity-0 w-full text-left rounded-xl border p-3 transition-all ${
                        active ? `bg-gradient-to-r ${theme.card} ${theme.border}` : "bg-zinc-900/80 border-zinc-800 hover:border-violet-700/50"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="text-lg shrink-0">{s.emoji}</span>
                        <div className="min-w-0">
                          <p className={`text-xs font-bold leading-tight ${active ? "text-white" : "text-violet-200"}`}>{s.title}</p>
                          <p className="text-[11px] text-zinc-400 leading-snug mt-0.5">{s.premise}</p>
                        </div>
                        {active && <CheckCircle className="w-4 h-4 text-violet-300 shrink-0 ml-auto" />}
                      </div>
                    </button>
                  );
                })}
                <p className="text-[10px] text-zinc-600 text-center">Toca una para usarla · puedes editarla arriba</p>
              </div>
            )}
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

          {/* Estilo visual — con mini frame cinematográfico de referencia */}
          <div>
            <p className="text-xs font-bold text-zinc-400 mb-3">Estilo visual</p>
            <div className="grid grid-cols-3 gap-2.5">
              {VISUAL_STYLES.map(v => {
                const active = form.visual_style === v.id;
                const thumb = STYLE_THUMB[v.id] ?? STYLE_THUMB.cinematic!;
                return (
                  <button
                    key={v.id}
                    onClick={() => set("visual_style")(v.id)}
                    className={`group rounded-xl border overflow-hidden text-left transition-all ${
                      active ? `${theme.border} ring-2 ring-violet-500/40` : "border-zinc-800 hover:border-zinc-600"
                    }`}
                  >
                    {/* Real AI reference frame — same scene in this style */}
                    <div className="relative aspect-video overflow-hidden" style={{ background: thumb.bg }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={thumb.img} alt={`Estilo ${v.label}`} loading="lazy"
                        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      {/* letterbox bars = sello de cine */}
                      <span className="absolute top-0 inset-x-0 h-1.5 bg-black/60" />
                      <span className="absolute bottom-0 inset-x-0 h-1.5 bg-black/60" />
                      {active && <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-violet-500 border-2 border-white/90 shadow-lg" />}
                    </div>
                    <div className={`px-2 py-1.5 ${active ? `bg-gradient-to-br ${theme.card}` : "bg-zinc-900"}`}>
                      <p className={`text-[11px] font-extrabold leading-tight ${active ? "text-white" : "text-zinc-300"}`}>{v.label}</p>
                      <p className="text-[9px] text-zinc-500 leading-tight truncate">{v.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Calidad premium — un solo nivel, el mejor */}
          <div className="vy-glass rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl vy-grad-bg flex items-center justify-center shrink-0 text-xl">🗣️</div>
            <p className="flex-1 text-sm font-bold vy-grad-text">Generar video</p>
            <span className="text-[11px] font-bold text-violet-300 shrink-0">{CREDIT_COST_BY_TIER.talking.toLocaleString("es")} NAVOS</span>
          </div>

          {/* Personaje recurrente (opcional) */}
          {savedCharacters.length > 0 && (
            <div>
              <p className="text-xs font-bold text-zinc-400 mb-3">
                Personaje <span className="text-zinc-600 font-normal">· reusa el mismo en esta historia (opcional)</span>
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                <button
                  onClick={() => setCharacterId(null)}
                  className={`flex-shrink-0 w-20 rounded-xl border p-2 text-center transition-all ${
                    characterId === null ? `bg-gradient-to-br ${theme.card} ${theme.border}` : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"
                  }`}
                >
                  <div className="w-full aspect-square rounded-lg bg-zinc-800 grid place-items-center mb-1">
                    <span className="text-lg">✨</span>
                  </div>
                  <p className="text-[10px] font-semibold text-zinc-300 truncate">Nuevo</p>
                </button>
                {savedCharacters.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCharacterId(c.id)}
                    className={`flex-shrink-0 w-20 rounded-xl border p-2 text-center transition-all ${
                      characterId === c.id ? `bg-gradient-to-br ${theme.card} ${theme.border}` : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"
                    }`}
                  >
                    <div className="w-full aspect-square rounded-lg bg-zinc-950 overflow-hidden mb-1">
                      {c.reference_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.reference_image_url} alt={c.name} className="w-full h-full object-cover" />
                      ) : null}
                    </div>
                    <p className="text-[10px] font-semibold text-white truncate">{c.name}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Platform + Language */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-bold text-zinc-400 mb-2.5">Plataforma</p>
              <div className="space-y-1.5">
                {PLATFORMS.map(p => {
                  const active = form.target_platform === p.id;
                  const t = PLATFORM_THUMB[p.id] ?? PLATFORM_THUMB.tiktok!;
                  return (
                    <button
                      key={p.id}
                      onClick={() => set("target_platform")(p.id)}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl border text-xs font-medium text-left transition-all ${
                        active ? `${theme.pill} border font-bold` : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                      }`}
                    >
                      {/* Mini frame con la proporción real de la plataforma */}
                      <span className="relative h-7 grid place-items-center shrink-0" style={{ width: 28 }}>
                        <span className="grid place-items-center rounded-[3px] text-[9px]"
                          style={{ aspectRatio: t.ratio, height: t.ratio === "16 / 9" ? 16 : 28, background: t.tint }}>
                          {t.icon}
                        </span>
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block truncate">{p.label}</span>
                        <span className={`block text-[9px] ${active ? "opacity-70" : "text-zinc-600"}`}>{p.aspect_ratio}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-zinc-400 mb-2.5">Idioma</p>
              <div className="space-y-1.5">
                {[{ value: "es", flag: "🇲🇽", label: "Español", native: "Latino" }, { value: "en", flag: "🇺🇸", label: "English", native: "US" }, { value: "pt", flag: "🇧🇷", label: "Português", native: "Brasil" }].map(l => {
                  const active = form.language === l.value;
                  return (
                    <button
                      key={l.value}
                      onClick={() => set("language")(l.value)}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl border text-xs font-medium text-left transition-all ${
                        active ? `${theme.pill} border font-bold` : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                      }`}
                    >
                      <span className="w-7 h-7 rounded-lg bg-zinc-950/60 grid place-items-center text-base shrink-0 border border-white/5">{l.flag}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block truncate">{l.label}</span>
                        <span className={`block text-[9px] ${active ? "opacity-70" : "text-zinc-600"}`}>{l.native}</span>
                      </span>
                    </button>
                  );
                })}
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
                onClick={() => void loadCasting()}
                disabled={credits === 0 || castingLoading}
                className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-extrabold text-white transition-all active:scale-[0.98] shadow-lg ${theme.glow} bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {castingLoading ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Diseñando el elenco…</>
                ) : (
                  <><Users className="w-4 h-4" /> Conocer mi elenco <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
