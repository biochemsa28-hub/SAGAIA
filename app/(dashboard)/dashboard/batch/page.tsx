"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, Zap, CheckCircle2, AlertCircle, Package } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { NICHOS } from "@/lib/constants/nichos";

const TONES = ["dramatico", "emocional", "misterioso", "motivacional", "romantico", "comico"];

interface BatchItem {
  idea: string;
  niche: string;
  tone: string;
}

const EMPTY: BatchItem = { idea: "", niche: "pareja", tone: "dramatico" };

type ResultItem = {
  index: number;
  idea: string;
  status: "created" | "error";
  project_id?: string;
  title?: string;
  error?: string;
};

export default function BatchPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = useState<BatchItem[]>([{ ...EMPTY }]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ResultItem[] | null>(null);

  const nichoOptions = Object.keys(NICHOS);

  function addItem() {
    if (items.length >= 10) { toast("Máximo 10 proyectos por lote", "error"); return; }
    setItems((p) => [...p, { ...EMPTY }]);
  }

  function removeItem(i: number) {
    setItems((p) => p.filter((_, idx) => idx !== i));
  }

  function updateItem(i: number, field: keyof BatchItem, value: string) {
    setItems((p) => p.map((item, idx) => idx === i ? { ...item, [field]: value } : item));
  }

  async function generate() {
    const valid = items.filter((it) => it.idea.trim().length > 5);
    if (valid.length === 0) { toast("Escribe al menos una idea", "error"); return; }

    setLoading(true);
    setResults(null);
    try {
      const res = await fetch("/api/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: valid }),
      });
      const data = (await res.json()) as {
        ok?: boolean; created?: number; failed?: number;
        results?: ResultItem[]; error?: string;
      };

      if (!res.ok || !data.ok) {
        toast(data.error ?? "Error al generar el lote", "error");
        return;
      }

      setResults(data.results ?? []);
      toast(`✅ ${data.created} historias creadas${data.failed ? ` · ${data.failed} fallaron` : ""}`, "success");
    } catch {
      toast("Error de conexión", "error");
    } finally {
      setLoading(false);
    }
  }

  const creditsNeeded = items.filter((it) => it.idea.trim().length > 5).length;

  return (
    <>
      <TopBar title="Producción en lote" subtitle="Genera múltiples microseries a la vez" />
      <div className="p-6 max-w-3xl mx-auto space-y-6">

        {/* Header info */}
        <Card className="p-4 bg-violet-950/20 border-violet-700/30">
          <div className="flex items-start gap-3">
            <Package className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-white mb-1">Batch Mode — Producción en serie</p>
              <p className="text-xs text-zinc-400">
                Genera hasta <strong className="text-white">10 historias simultáneas</strong>.
                Cada una consume 1 crédito y queda lista para producción de video.
                Ideal para llenar tu calendario de contenido de toda la semana.
              </p>
            </div>
          </div>
        </Card>

        {/* Items */}
        <div className="space-y-3">
          {items.map((item, i) => (
            <Card key={i} className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-full bg-violet-600/20 border border-violet-700/30 flex items-center justify-center">
                  <span className="text-xs font-bold text-violet-400">{i + 1}</span>
                </div>
                <span className="text-sm font-medium text-zinc-300">Historia #{i + 1}</span>
                {items.length > 1 && (
                  <button
                    onClick={() => removeItem(i)}
                    className="ml-auto text-zinc-600 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {/* Idea */}
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Tu idea o tema</label>
                  <input
                    type="text"
                    value={item.idea}
                    onChange={(e) => updateItem(i, "idea", e.target.value)}
                    placeholder="Ej: Una pareja que descubre un secreto oscuro..."
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
                  />
                </div>

                {/* Niche + Tone */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Nicho</label>
                    <select
                      value={item.niche}
                      onChange={(e) => updateItem(i, "niche", e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500 transition-colors"
                    >
                      {nichoOptions.map((n) => (
                        <option key={n} value={n}>{(NICHOS as Record<string, { label: string }>)[n]?.label ?? n}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Tono</label>
                    <select
                      value={item.tone}
                      onChange={(e) => updateItem(i, "tone", e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500 transition-colors"
                    >
                      {TONES.map((t) => (
                        <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Add + Generate */}
        <div className="flex items-center gap-3">
          <button
            onClick={addItem}
            disabled={items.length >= 10 || loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors disabled:opacity-40"
          >
            <Plus className="w-4 h-4" />
            Agregar historia ({items.length}/10)
          </button>

          <button
            onClick={generate}
            disabled={loading || creditsNeeded === 0}
            className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Generando {creditsNeeded} historias…</>
            ) : (
              <><Zap className="w-4 h-4" /> Generar {creditsNeeded} historia{creditsNeeded !== 1 ? "s" : ""} · {creditsNeeded} crédito{creditsNeeded !== 1 ? "s" : ""}</>
            )}
          </button>
        </div>

        {/* Results */}
        {results && (
          <Card className="p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white mb-2">Resultados del lote</h3>
            {results.map((r) => (
              <div
                key={r.index}
                className={`flex items-center gap-3 p-3 rounded-xl ${
                  r.status === "created"
                    ? "bg-emerald-950/30 border border-emerald-800/30"
                    : "bg-red-950/30 border border-red-800/30"
                }`}
              >
                {r.status === "created" ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {r.title ?? r.idea}
                  </p>
                  {r.error && <p className="text-xs text-red-400">{r.error}</p>}
                </div>
                {r.project_id && (
                  <button
                    onClick={() => router.push(`/dashboard/projects/${r.project_id}`)}
                    className="text-xs text-violet-400 hover:text-violet-300 font-medium shrink-0 transition-colors"
                  >
                    Producir →
                  </button>
                )}
              </div>
            ))}

            <div className="pt-2 flex gap-3">
              <button
                onClick={() => router.push("/dashboard/library")}
                className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors text-center"
              >
                Ver en Biblioteca →
              </button>
              <button
                onClick={() => { setResults(null); setItems([{ ...EMPTY }]); }}
                className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors"
              >
                Nuevo lote
              </button>
            </div>
          </Card>
        )}

      </div>
    </>
  );
}
