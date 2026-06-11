"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  NICHOS, TONES, DURATION_OPTIONS, VISUAL_STYLES, PLATFORMS,
} from "@/lib/constants/nichos";
import {
  Sparkles, CheckCircle, AlertCircle,
  ChevronDown, ChevronUp, ArrowRight,
} from "lucide-react";
import type { StoryOutput } from "@/lib/validators/story.schema";

// ─── Nicho icons ──────────────────────────────────────────────────────────────
const NICHO_ICONS: Record<string, string> = {
  terror: "😱", romance: "💔", misterio: "🔍",
  inspiracional: "💪", fantasia: "✨", historia: "📜",
};

// ─── Generation steps ─────────────────────────────────────────────────────────
const GEN_STEPS = [
  { key: "story",   label: "Generando historia y guion…",  pct: 30 },
  { key: "scenes",  label: "Estructurando escenas…",        pct: 55 },
  { key: "prompts", label: "Creando prompts visuales…",     pct: 75 },
  { key: "seo",     label: "Optimizando SEO y metadata…",   pct: 90 },
  { key: "done",    label: "¡Historia lista!",              pct: 100 },
];

interface FormState {
  niche: string;
  sub_niche: string;
  topic: string;
  tone: string;
  duration_target: string;
  language: string;
  visual_style: string;
  target_platform: string;
  additional_instructions: string;
}

const DEFAULTS: FormState = {
  niche: "", sub_niche: "", topic: "", tone: "",
  duration_target: "60s", language: "es",
  visual_style: "cinematic", target_platform: "tiktok",
  additional_instructions: "",
};

export default function NewProjectPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(DEFAULTS);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [genStep, setGenStep] = useState(0);
  const [genError, setGenError] = useState<string | null>(null);
  const [result, setResult] = useState<StoryOutput | null>(null);

  useEffect(() => {
    fetch("/api/credits").then((r) => r.json())
      .then((d: { credits?: number }) => { if (typeof d.credits === "number") setCredits(d.credits); })
      .catch(() => null);
  }, []);

  const set = (field: keyof FormState) => (value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const selectedNicho = NICHOS.find((n) => n.id === form.niche);

  function validate(): boolean {
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (!form.niche) errs.niche = "Elige un nicho";
    if (!form.topic || form.topic.length < 5) errs.topic = "Describe el tema (mínimo 5 caracteres)";
    if (!form.tone) errs.tone = "Elige un tono";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function generate() {
    if (!validate()) return;
    setGenerating(true);
    setGenError(null);
    setGenStep(0);

    let stepIdx = 0;
    const interval = setInterval(() => {
      if (stepIdx < GEN_STEPS.length - 2) { stepIdx++; setGenStep(stepIdx); }
    }, 900);

    try {
      const res = await fetch("/api/generate/story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      clearInterval(interval);
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? "Error al generar");
      }
      const data = await res.json() as { data: StoryOutput };
      setGenStep(GEN_STEPS.length - 1);
      setResult(data.data);
    } catch (err) {
      clearInterval(interval);
      setGenError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setGenerating(false);
    }
  }

  // ─── GENERATING state ─────────────────────────────────────────────────────
  if (generating) {
    return (
      <>
        <TopBar title="Nuevo proyecto" />
        <div className="max-w-lg mx-auto p-6 flex flex-col items-center justify-center min-h-[60vh] text-center space-y-8">
          <div className="w-20 h-20 rounded-3xl bg-violet-600/20 border border-violet-700/40 flex items-center justify-center">
            <Sparkles className="w-10 h-10 text-violet-400 animate-pulse" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white mb-2">SAGAIA está creando tu historia</h2>
            <p className="text-sm text-zinc-400">{GEN_STEPS[genStep]?.label}</p>
          </div>
          <div className="w-full max-w-sm space-y-4">
            <Progress value={GEN_STEPS[genStep]?.pct ?? 0} showValue />
            <div className="space-y-2 text-left">
              {GEN_STEPS.slice(0, genStep + 1).map((s, i) => (
                <div key={s.key} className="flex items-center gap-2 text-xs">
                  {i < genStep
                    ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    : <div className="w-3.5 h-3.5 rounded-full border-2 border-violet-500 border-t-transparent animate-spin shrink-0" />}
                  <span className={i < genStep ? "text-zinc-500" : "text-white"}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </>
    );
  }

  // ─── SUCCESS state ────────────────────────────────────────────────────────
  if (result) {
    return (
      <>
        <TopBar title="¡Historia creada!" />
        <div className="max-w-lg mx-auto p-6 space-y-5">
          <div className="flex items-center gap-3 p-4 bg-emerald-900/20 border border-emerald-700/30 rounded-2xl">
            <CheckCircle className="w-7 h-7 text-emerald-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-300">¡Historia generada con éxito!</p>
              <p className="text-xs text-emerald-600 mt-0.5">
                {result.production_notes.scene_count} escenas · {result.production_notes.total_duration_seconds}s
              </p>
            </div>
          </div>

          <Card className="space-y-3">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Vista previa</p>
            <p className="text-base font-bold text-white">{result.meta.title}</p>
            <p className="text-sm text-violet-300 italic">&quot;{result.story.hook}&quot;</p>
            <div className="border-t border-zinc-800 pt-3 space-y-1.5">
              {result.scenes.slice(0, 3).map((s) => (
                <div key={s.scene_number} className="flex gap-2 text-xs text-zinc-400">
                  <span className="text-violet-500 shrink-0 font-bold">#{s.scene_number}</span>
                  <span className="line-clamp-1">{s.narration_text}</span>
                </div>
              ))}
              {result.scenes.length > 3 && (
                <p className="text-xs text-zinc-600">+ {result.scenes.length - 3} escenas más…</p>
              )}
            </div>
          </Card>

          <button
            onClick={() => router.push(`/dashboard/projects/${result.project_id}`)}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-violet-900/30"
          >
            <Sparkles className="w-5 h-5" />
            Ir a producción
            <ArrowRight className="w-5 h-5" />
          </button>

          <button
            onClick={() => { setResult(null); setForm(DEFAULTS); }}
            className="w-full text-center text-sm text-zinc-500 hover:text-zinc-300 transition-colors py-2"
          >
            Crear otra historia
          </button>
        </div>
      </>
    );
  }

  // ─── MAIN FORM ────────────────────────────────────────────────────────────
  return (
    <>
      <TopBar title="Nueva historia" subtitle="De idea a video en menos de 5 minutos" />
      <div className="max-w-2xl mx-auto p-6 space-y-5">

        {/* Credits warning */}
        {credits === 0 && (
          <div className="flex items-center gap-3 p-3 bg-red-950/40 border border-red-700/40 rounded-xl text-sm">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="text-red-300">Sin créditos disponibles. </span>
            <a href="/pricing" className="text-red-400 underline hover:text-red-300 ml-auto shrink-0">Recargar →</a>
          </div>
        )}

        <Card className="space-y-6">

          {/* ── 1. NICHO ── */}
          <div>
            <label className="text-sm font-semibold text-white block mb-3">
              ¿De qué trata? <span className="text-red-400">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {NICHOS.map((n) => (
                <button
                  key={n.id}
                  onClick={() => { set("niche")(n.id); set("sub_niche")(""); }}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    form.niche === n.id
                      ? "bg-violet-600/20 border-violet-500/60 text-white"
                      : "bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                  }`}
                >
                  <span className="text-lg block mb-0.5">{NICHO_ICONS[n.id] ?? "🎬"}</span>
                  <span className="text-xs font-medium leading-tight">{n.label}</span>
                </button>
              ))}
            </div>
            {errors.niche && <p className="text-xs text-red-400 mt-1.5">{errors.niche}</p>}

            {/* Sub-nicho pills */}
            {selectedNicho && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {selectedNicho.sub_nichos.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => set("sub_niche")(s.id === form.sub_niche ? "" : s.id)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
                      form.sub_niche === s.id
                        ? "bg-violet-600/25 border-violet-500/50 text-violet-300"
                        : "bg-zinc-800 border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── 2. TEMA ── */}
          <div>
            <Textarea
              label="Tema de la historia *"
              placeholder="Ej: Una mujer descubre que su marido lleva doble vida y decide vengarse de forma inesperada…"
              value={form.topic}
              onChange={(e) => set("topic")(e.target.value)}
              rows={3}
              error={errors.topic}
              hint="Sé específico — cuanto más detalle, mejor la historia."
            />
          </div>

          {/* ── 3. TONO ── */}
          <div>
            <label className="text-sm font-semibold text-white block mb-3">
              Tono <span className="text-red-400">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {TONES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => set("tone")(t.id)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                    form.tone === t.id
                      ? "bg-violet-600/25 border-violet-500/60 text-violet-300"
                      : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {errors.tone && <p className="text-xs text-red-400 mt-1.5">{errors.tone}</p>}
          </div>

          {/* ── OPCIONALES ── */}
          <div className="border-t border-zinc-800 pt-4">
            <button
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors w-full"
            >
              {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              <span>Opciones avanzadas</span>
              <span className="text-zinc-700 ml-1">duración · plataforma · estilo · idioma</span>
            </button>

            {showAdvanced && (
              <div className="mt-4 space-y-5">

                {/* Duración */}
                <div>
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block mb-2">Duración</label>
                  <div className="grid grid-cols-2 gap-2">
                    {DURATION_OPTIONS.map((d) => (
                      <button
                        key={d.id}
                        onClick={() => set("duration_target")(d.id)}
                        className={`p-2.5 rounded-lg border text-left transition-all ${
                          form.duration_target === d.id
                            ? "bg-violet-600/20 border-violet-500/60 text-white"
                            : "bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:border-zinc-600"
                        }`}
                      >
                        <p className="text-xs font-bold">{d.label.split("(")[0]?.trim()}</p>
                        <p className="text-[10px] opacity-60 mt-0.5">{d.scenes} escenas</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Estilo visual */}
                <div>
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block mb-2">Estilo visual</label>
                  <div className="grid grid-cols-3 gap-2">
                    {VISUAL_STYLES.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => set("visual_style")(v.id)}
                        className={`p-2.5 rounded-lg border text-left transition-all ${
                          form.visual_style === v.id
                            ? "bg-violet-600/20 border-violet-500/60 text-white"
                            : "bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:border-zinc-600"
                        }`}
                      >
                        <p className="text-xs font-bold">{v.label}</p>
                        <p className="text-[10px] opacity-60 mt-0.5">{v.description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Plataforma + Idioma */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block mb-2">Plataforma</label>
                    <div className="space-y-1.5">
                      {PLATFORMS.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => set("target_platform")(p.id)}
                          className={`w-full px-3 py-2 rounded-lg border text-xs text-left transition-all ${
                            form.target_platform === p.id
                              ? "bg-violet-600/20 border-violet-500/60 text-violet-300"
                              : "bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:border-zinc-600"
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block mb-2">Idioma</label>
                    <div className="space-y-1.5">
                      {[
                        { value: "es", label: "🇪🇸 Español" },
                        { value: "en", label: "🇺🇸 English" },
                        { value: "pt", label: "🇧🇷 Português" },
                      ].map((l) => (
                        <button
                          key={l.value}
                          onClick={() => set("language")(l.value)}
                          className={`w-full px-3 py-2 rounded-lg border text-xs text-left transition-all ${
                            form.language === l.value
                              ? "bg-violet-600/20 border-violet-500/60 text-violet-300"
                              : "bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:border-zinc-600"
                          }`}
                        >
                          {l.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Instrucciones adicionales */}
                <Textarea
                  label="Instrucciones adicionales"
                  placeholder="Ej: El protagonista debe ser una mujer. Incluir un giro inesperado al final."
                  value={form.additional_instructions}
                  onChange={(e) => set("additional_instructions")(e.target.value)}
                  rows={2}
                />
              </div>
            )}
          </div>

          {/* ── GENERATE BUTTON ── */}
          <div className="pt-2">
            {genError && (
              <div className="flex items-start gap-2 p-3 bg-red-950/40 border border-red-700/40 rounded-xl mb-4">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-xs text-red-300">{genError}</p>
              </div>
            )}

            <button
              onClick={generate}
              disabled={credits === 0}
              className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-base py-4 rounded-2xl transition-all shadow-lg shadow-violet-900/30 hover:shadow-violet-900/50 hover:scale-[1.01] active:scale-[0.99]"
            >
              <Sparkles className="w-5 h-5" />
              Generar historia con IA
              <ArrowRight className="w-5 h-5" />
            </button>

            <p className="text-center text-xs text-zinc-600 mt-2">
              Consume 1 crédito · {credits !== null ? `Tienes ${credits} disponible${credits !== 1 ? "s" : ""}` : "…"}
            </p>
          </div>

        </Card>
      </div>
    </>
  );
}
