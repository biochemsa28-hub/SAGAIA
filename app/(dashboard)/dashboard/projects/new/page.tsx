"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { NICHOS, TONES, DURATION_OPTIONS, VISUAL_STYLES, PLATFORMS } from "@/lib/constants/nichos";
import { Sparkles, ChevronRight, ChevronLeft, CheckCircle, AlertCircle } from "lucide-react";
import type { StoryOutput } from "@/lib/validators/story.schema";

// ── Wizard Steps ──────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3;

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

const INITIAL: FormState = {
  niche: "",
  sub_niche: "",
  topic: "",
  tone: "",
  duration_target: "60s",
  language: "es",
  visual_style: "cinematic",
  target_platform: "youtube_shorts",
  additional_instructions: "",
};

// ── Generation Progress Steps ─────────────────────────────────────────────────

const GEN_STEPS = [
  { key: "story",   label: "Generando historia y guion…",      pct: 30 },
  { key: "scenes",  label: "Estructurando escenas…",            pct: 50 },
  { key: "prompts", label: "Creando prompts visuales…",         pct: 70 },
  { key: "seo",     label: "Optimizando SEO y metadata…",       pct: 90 },
  { key: "done",    label: "¡Paquete listo para descargar!",    pct: 100 },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function NewProjectPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<Partial<FormState>>({});

  // Credits
  const [credits, setCredits] = useState<number | null>(null);
  useEffect(() => {
    fetch("/api/credits").then((r) => r.json()).then((d: { credits?: number }) => {
      if (typeof d.credits === "number") setCredits(d.credits);
    }).catch(() => null);
  }, []);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [genStep, setGenStep] = useState(0);
  const [genError, setGenError] = useState<string | null>(null);
  const [result, setResult] = useState<StoryOutput | null>(null);

  const set = (field: keyof FormState) => (value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const selectedNicho = NICHOS.find((n) => n.id === form.niche);

  // ── Validation ──────────────────────────────────────────────────────────────

  function validateStep1(): boolean {
    const errs: Partial<FormState> = {};
    if (!form.niche) errs.niche = "Selecciona un nicho";
    if (!form.topic || form.topic.length < 5) errs.topic = "El tema debe tener al menos 5 caracteres";
    if (!form.tone) errs.tone = "Selecciona un tono";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function validateStep2(): boolean {
    return true; // step 2 has no required fields
  }

  // ── Generation ──────────────────────────────────────────────────────────────

  async function generate() {
    setGenerating(true);
    setGenError(null);
    setGenStep(0);

    // Simulate progress steps while waiting for API
    let stepIdx = 0;
    const interval = setInterval(() => {
      if (stepIdx < GEN_STEPS.length - 2) {
        stepIdx++;
        setGenStep(stepIdx);
      }
    }, 800);

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
      setGenStep(GEN_STEPS.length - 1); // done
      setResult(data.data);
    } catch (err) {
      clearInterval(interval);
      setGenError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setGenerating(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      <TopBar title="Nuevo proyecto" subtitle="Crea un paquete de microhistoria completo" />
      <div className="max-w-2xl mx-auto p-6 space-y-6">

        {/* Step indicator */}
        <div className="flex items-center gap-2">
          {([1, 2, 3] as Step[]).map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all
                ${step === s ? "bg-violet-600 text-white" : step > s ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-500"}`}>
                {step > s ? <CheckCircle className="w-4 h-4" /> : s}
              </div>
              <span className={`text-xs font-medium ${step === s ? "text-white" : "text-zinc-500"}`}>
                {s === 1 ? "Nicho & Tema" : s === 2 ? "Configuración" : "Generar"}
              </span>
              {s < 3 && <ChevronRight className="w-4 h-4 text-zinc-700" />}
            </div>
          ))}
        </div>

        {/* ── STEP 1: Nicho & Tema ── */}
        {step === 1 && (
          <Card className="space-y-5">
            <div>
              <h2 className="text-lg font-bold text-white">¿Sobre qué quieres crear?</h2>
              <p className="text-sm text-zinc-400 mt-1">Elige el nicho y describe el tema de tu historia.</p>
            </div>

            <Select
              label="Nicho principal *"
              options={NICHOS.map((n) => ({ value: n.id, label: n.label }))}
              value={form.niche}
              onChange={set("niche")}
              placeholder="Selecciona un nicho…"
              error={errors.niche}
            />

            {selectedNicho && (
              <div>
                <label className="text-sm font-medium text-zinc-300 block mb-1.5">Subnicho</label>
                <div className="flex flex-wrap gap-2">
                  {selectedNicho.sub_nichos.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => set("sub_niche")(s.id === form.sub_niche ? "" : s.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border
                        ${form.sub_niche === s.id
                          ? "bg-violet-600/20 border-violet-600 text-violet-300"
                          : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Textarea
              label="Tema o premisa de la historia *"
              placeholder="Ej: Una familia compra una casa antigua y descubre que el sótano esconde un secreto oscuro de hace 50 años…"
              value={form.topic}
              onChange={(e) => set("topic")(e.target.value)}
              rows={3}
              error={errors.topic}
              hint="Sé específico. Cuanto más detalle, mejor será la historia generada."
            />

            <Select
              label="Tono de la historia *"
              options={TONES.map((t) => ({ value: t.id, label: t.label }))}
              value={form.tone}
              onChange={set("tone")}
              placeholder="Selecciona el tono…"
              error={errors.tone}
            />

            <div className="flex justify-end pt-2">
              <Button onClick={() => { if (validateStep1()) setStep(2); }}>
                Siguiente <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </Card>
        )}

        {/* ── STEP 2: Configuración ── */}
        {step === 2 && (
          <Card className="space-y-5">
            <div>
              <h2 className="text-lg font-bold text-white">Configura tu video</h2>
              <p className="text-sm text-zinc-400 mt-1">Duración, plataforma y estilo visual.</p>
            </div>

            <div>
              <label className="text-sm font-medium text-zinc-300 block mb-2">Duración objetivo</label>
              <div className="grid grid-cols-2 gap-2">
                {DURATION_OPTIONS.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => set("duration_target")(d.id)}
                    className={`p-3 rounded-lg border text-left transition-all
                      ${form.duration_target === d.id
                        ? "bg-violet-600/20 border-violet-600 text-violet-300"
                        : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600"}`}
                  >
                    <p className="text-xs font-bold">{(d.label.split("(")[0] ?? d.label).trim()}</p>
                    <p className="text-xs opacity-60 mt-0.5">{d.scenes} escenas</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-zinc-300 block mb-2">Estilo visual</label>
              <div className="grid grid-cols-3 gap-2">
                {VISUAL_STYLES.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => set("visual_style")(v.id)}
                    className={`p-3 rounded-lg border text-left transition-all
                      ${form.visual_style === v.id
                        ? "bg-violet-600/20 border-violet-600 text-violet-300"
                        : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600"}`}
                  >
                    <p className="text-xs font-bold">{v.label}</p>
                    <p className="text-xs opacity-60 mt-0.5">{v.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Plataforma"
                options={PLATFORMS.map((p) => ({ value: p.id, label: p.label }))}
                value={form.target_platform}
                onChange={set("target_platform")}
              />
              <Select
                label="Idioma"
                options={[
                  { value: "es", label: "Español" },
                  { value: "en", label: "English" },
                  { value: "pt", label: "Português" },
                ]}
                value={form.language}
                onChange={set("language")}
              />
            </div>

            <Textarea
              label="Instrucciones adicionales (opcional)"
              placeholder="Ej: Incluye un giro inesperado al final. El protagonista debe ser una mujer joven."
              value={form.additional_instructions}
              onChange={(e) => set("additional_instructions")(e.target.value)}
              rows={2}
            />

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(1)}>
                <ChevronLeft className="w-4 h-4" /> Anterior
              </Button>
              <Button onClick={() => { if (validateStep2()) setStep(3); }}>
                Siguiente <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </Card>
        )}

        {/* ── STEP 3: Generar ── */}
        {step === 3 && (
          <Card className="space-y-6">
            {/* Resumen */}
            {!generating && !result && !genError && (
              <>
                <div>
                  <h2 className="text-lg font-bold text-white">Confirma y genera</h2>
                  <p className="text-sm text-zinc-400 mt-1">Revisa los detalles antes de generar.</p>
                </div>

                <div className="bg-zinc-800/50 rounded-lg p-4 space-y-2 text-sm">
                  <Row label="Nicho" value={NICHOS.find((n) => n.id === form.niche)?.label ?? form.niche} />
                  <Row label="Tema" value={form.topic} />
                  <Row label="Tono" value={TONES.find((t) => t.id === form.tone)?.label ?? form.tone} />
                  <Row label="Duración" value={(DURATION_OPTIONS.find((d) => d.id === form.duration_target)?.label.split("(")[0] ?? form.duration_target).trim()} />
                  <Row label="Estilo visual" value={VISUAL_STYLES.find((v) => v.id === form.visual_style)?.label ?? form.visual_style} />
                  <Row label="Plataforma" value={PLATFORMS.find((p) => p.id === form.target_platform)?.label ?? form.target_platform} />
                </div>

                <div className={`border rounded-lg p-3 text-xs ${
                  credits === 0
                    ? "bg-red-900/20 border-red-700/30 text-red-300"
                    : "bg-violet-900/20 border-violet-700/30 text-violet-300"
                }`}>
                  {credits === 0
                    ? "❌ Sin créditos disponibles. Recarga tu cuenta para continuar."
                    : `💡 Esto consumirá 1 crédito. Tienes ${credits ?? "…"} disponible${credits !== 1 ? "s" : ""}.`}
                </div>

                <div className="flex justify-between">
                  <Button variant="ghost" onClick={() => setStep(2)}>
                    <ChevronLeft className="w-4 h-4" /> Anterior
                  </Button>
                  <Button size="lg" onClick={generate} disabled={credits === 0}>
                    <Sparkles className="w-5 h-5" /> Generar ahora
                  </Button>
                </div>
              </>
            )}

            {/* Generating */}
            {generating && (
              <div className="py-8 space-y-6 text-center">
                <div className="w-16 h-16 rounded-2xl bg-violet-600/20 border border-violet-700/40 flex items-center justify-center mx-auto">
                  <Sparkles className="w-8 h-8 text-violet-400 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-white font-semibold mb-1">Generando tu historia…</h3>
                  <p className="text-sm text-zinc-400">{GEN_STEPS[genStep]?.label}</p>
                </div>
                <Progress value={GEN_STEPS[genStep]?.pct ?? 0} showValue className="max-w-sm mx-auto" />
                <div className="space-y-2 text-left max-w-sm mx-auto">
                  {GEN_STEPS.slice(0, genStep + 1).map((s: typeof GEN_STEPS[number], i: number) => (
                    <div key={s.key} className="flex items-center gap-2 text-xs">
                      {i < genStep
                        ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        : <div className="w-3.5 h-3.5 rounded-full border-2 border-violet-500 border-t-transparent animate-spin shrink-0" />
                      }
                      <span className={i < genStep ? "text-zinc-400" : "text-white"}>{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Error */}
            {genError && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 bg-red-900/20 border border-red-700/30 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-300">Error al generar</p>
                    <p className="text-xs text-red-400 mt-1">{genError}</p>
                  </div>
                </div>
                <Button onClick={generate} loading={generating}>
                  <Sparkles className="w-4 h-4" /> Reintentar
                </Button>
              </div>
            )}

            {/* Success */}
            {result && !generating && (
              <div className="space-y-5">
                <div className="flex items-center gap-3 p-4 bg-emerald-900/20 border border-emerald-700/30 rounded-lg">
                  <CheckCircle className="w-6 h-6 text-emerald-400 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-emerald-300">¡Paquete generado con éxito!</p>
                    <p className="text-xs text-emerald-500 mt-0.5">{result.production_notes.scene_count} escenas · {result.production_notes.total_duration_seconds}s</p>
                  </div>
                </div>

                <div className="bg-zinc-800/50 rounded-lg p-4 space-y-2">
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Vista previa</p>
                  <p className="text-sm font-bold text-white">{result.meta.title}</p>
                  <p className="text-xs text-violet-300 italic">&quot;{result.story.hook}&quot;</p>
                  <div className="pt-2 space-y-1">
                    {result.scenes.slice(0, 3).map((s) => (
                      <div key={s.scene_number} className="flex gap-2 text-xs text-zinc-400">
                        <span className="text-violet-500 shrink-0">#{s.scene_number}</span>
                        <span className="line-clamp-1">{s.narration_text}</span>
                      </div>
                    ))}
                    {result.scenes.length > 3 && (
                      <p className="text-xs text-zinc-600">+ {result.scenes.length - 3} escenas más…</p>
                    )}
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => router.push("/dashboard")}
                  >
                    Ver en dashboard
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => {
                      // Navigate to export — project ID from result
                      const id = result.project_id ?? "new";
                      router.push(`/dashboard/export/${id}?data=${encodeURIComponent(JSON.stringify(result))}`);
                    }}
                  >
                    <Download className="w-4 h-4" /> Exportar ZIP
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-zinc-500">{label}</span>
      <span className="text-zinc-200 text-right">{value}</span>
    </div>
  );
}

// Need to add this import at the top
function Download({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  );
}
