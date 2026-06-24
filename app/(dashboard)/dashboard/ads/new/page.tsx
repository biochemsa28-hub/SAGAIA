"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { Megaphone, Sparkles, ArrowRight, AlertCircle, Loader2, Zap, Upload, X } from "lucide-react";
import { TONES, DURATION_OPTIONS, PLATFORMS } from "@/lib/constants/nichos";
import { CREDIT_COST_BY_TIER } from "@/lib/config";

// Ad-specific tone presets (friendlier than the drama tones, but we map to the
// same tone ids the engine understands).
const AD_TONES = TONES;

export default function NewAdPage() {
  const router = useRouter();
  const [product, setProduct] = useState("");
  const [benefit, setBenefit] = useState("");
  const [audience, setAudience] = useState("");
  const [cta, setCta] = useState("");
  const [tone, setTone] = useState<string>(TONES[0]?.id ?? "inspirational");
  const [duration, setDuration] = useState("30s");
  const [platform, setPlatform] = useState("tiktok");
  // Single premium tier — every ad is produced with lip-sync (a presenter that talks).
  const [tier] = useState<"kenburns" | "cinematic" | "talking">("talking");
  const [userPlan, setUserPlan] = useState("free");
  const [credits, setCredits] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/credits").then(r => r.json())
      .then((d: { credits?: number; plan?: string }) => {
        if (typeof d.credits === "number") setCredits(d.credits);
        if (d.plan) setUserPlan(d.plan);
      }).catch(() => null);
  }, []);

  async function uploadImage(file: File) {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "No se pudo subir la imagen");
      setImageUrl(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir la imagen");
    } finally {
      setUploading(false);
    }
  }

  async function generate() {
    if (product.trim().length < 2 || benefit.trim().length < 3) {
      setError("Dinos al menos el producto y su beneficio principal.");
      return;
    }
    setLoading(true);
    setError(null);
    // Compose a rich topic for the ad brain.
    const topic = `Producto/servicio: ${product}. Qué hace / beneficio principal: ${benefit}.` +
      (audience ? ` Público objetivo: ${audience}.` : "") +
      (cta ? ` Llamada a la acción deseada: ${cta}.` : "");
    try {
      const res = await fetch("/api/generate/story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche: "publicidad",
          topic,
          tone,
          duration_target: duration,
          language: "es",
          visual_style: "realistic",
          target_platform: platform,
          animation_tier: tier,
          format: "ad",
          reference_image_url: imageUrl ?? undefined,
        }),
      });
      if (res.status === 402) {
        const e = await res.json() as { required?: number };
        setError(`Necesitas ${e.required ?? ""} NAVOS para este anuncio. Recarga para continuar.`);
        setLoading(false);
        return;
      }
      if (!res.ok) { const e = await res.json() as { error?: string }; throw new Error(e.error ?? "Error"); }
      const data = await res.json() as { project_id: string | null };
      if (data.project_id) router.push(`/dashboard/projects/${data.project_id}?autostart=1`);
      else throw new Error("No se pudo crear el anuncio");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <>
        <TopBar title="Anuncios" subtitle="Creando tu anuncio" />
        <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 text-center">
          <div className="relative w-24 h-24 mb-6" style={{ perspective: "700px" }}>
            <div className="absolute -inset-2 rounded-full border-2 border-transparent border-t-violet-500 border-r-pink-500 vy-ring-spin" />
            <div className="vy-flip3d w-24 h-24 rounded-2xl vy-grad-bg flex items-center justify-center">
              <Megaphone className="w-10 h-10 text-white" />
            </div>
          </div>
          <h2 className="text-lg font-bold vy-grad-text">Escribiendo tu anuncio…</h2>
          <p className="text-sm text-zinc-500 mt-1">Hook · problema · producto · beneficios · CTA</p>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title="Anuncios" subtitle="Crea un video publicitario con IA" />
      <div className="p-4 max-w-xl mx-auto space-y-5 pb-28">

        {/* Intro */}
        <div className="vy-glass rounded-2xl p-4 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl vy-grad-bg flex items-center justify-center shrink-0">
            <Megaphone className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">Anuncio estilo creador (UGC)</p>
            <p className="text-xs text-zinc-400 mt-0.5">Un presentador real promociona tu producto: engancha, muestra el beneficio y cierra con un llamado a la acción. Ideal con el tier 🗣️ Habla.</p>
          </div>
        </div>

        {/* Subir imagen del producto / contenido */}
        <div>
          <label className="text-xs font-bold text-zinc-400">Sube tu producto o contenido <span className="text-zinc-600">(opcional, ¡recomendado!)</span></label>
          <p className="text-[11px] text-zinc-600 mb-2">La IA usará tu imagen real en el anuncio — se ve auténtico, no genérico.</p>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) void uploadImage(f); }} />
          {imageUrl ? (
            <div className="relative w-32">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="Producto" className="w-32 h-32 object-cover rounded-xl border border-violet-700/50" />
              <button onClick={() => setImageUrl(null)} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-300 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="w-full flex items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed border-zinc-700 hover:border-violet-700/60 text-zinc-400 hover:text-violet-300 transition-all">
              {uploading ? <><Loader2 className="w-5 h-5 animate-spin" /> Subiendo…</> : <><Upload className="w-5 h-5" /> Subir imagen (JPG/PNG/WEBP)</>}
            </button>
          )}
        </div>

        {/* Producto */}
        <div>
          <label className="text-xs font-bold text-zinc-400">¿Qué quieres anunciar? <span className="text-red-400">*</span></label>
          <input value={product} onChange={e => setProduct(e.target.value)} placeholder="Ej: Cafetera portátil 'BrewGo'"
            className="mt-1.5 w-full bg-zinc-900 border border-zinc-800 focus:border-violet-700 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none" />
        </div>

        {/* Beneficio */}
        <div>
          <label className="text-xs font-bold text-zinc-400">Beneficio principal <span className="text-red-400">*</span></label>
          <textarea value={benefit} onChange={e => setBenefit(e.target.value)} rows={2} placeholder="Ej: Café recién hecho en cualquier lugar, sin electricidad, en 2 minutos"
            className="mt-1.5 w-full bg-zinc-900 border border-zinc-800 focus:border-violet-700 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none resize-none" />
        </div>

        {/* Público + CTA */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-zinc-400">Público objetivo <span className="text-zinc-600">(opcional)</span></label>
            <input value={audience} onChange={e => setAudience(e.target.value)} placeholder="Ej: viajeros, oficinistas"
              className="mt-1.5 w-full bg-zinc-900 border border-zinc-800 focus:border-violet-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none" />
          </div>
          <div>
            <label className="text-xs font-bold text-zinc-400">Llamado a la acción <span className="text-zinc-600">(opcional)</span></label>
            <input value={cta} onChange={e => setCta(e.target.value)} placeholder="Ej: Link en bio · 20% hoy"
              className="mt-1.5 w-full bg-zinc-900 border border-zinc-800 focus:border-violet-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none" />
          </div>
        </div>

        {/* Tono */}
        <div>
          <p className="text-xs font-bold text-zinc-400 mb-2">Tono del anuncio</p>
          <div className="flex flex-wrap gap-2">
            {AD_TONES.map(t => (
              <button key={t.id} onClick={() => setTone(t.id)}
                className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${tone === t.id ? "vy-grad-bg text-white border-transparent" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Duración + plataforma */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-bold text-zinc-400 mb-2">Duración</p>
            <div className="grid grid-cols-2 gap-2">
              {DURATION_OPTIONS.map(d => (
                <button key={d.id} onClick={() => setDuration(d.id)}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition-all ${duration === d.id ? "vy-grad-bg text-white border-transparent" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"}`}>
                  {d.label.split("(")[0]?.trim()}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-zinc-400 mb-2">Plataforma</p>
            <div className="space-y-1.5">
              {PLATFORMS.map(p => (
                <button key={p.id} onClick={() => setPlatform(p.id)}
                  className={`w-full px-3 py-2 rounded-xl border text-xs font-medium text-left transition-all ${platform === p.id ? "vy-grad-bg text-white border-transparent" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Calidad premium */}
        <div className="vy-glass rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl vy-grad-bg flex items-center justify-center shrink-0 text-xl">🗣️</div>
          <p className="flex-1 text-sm font-bold vy-grad-text">Crear anuncio</p>
          <span className="text-[11px] font-bold text-violet-300 shrink-0">{CREDIT_COST_BY_TIER.talking.toLocaleString("es")} NAVOS</span>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-950/40 border border-red-700/40 rounded-xl">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-300">{error}</p>
          </div>
        )}
      </div>

      {/* Fixed CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-zinc-950/95 backdrop-blur-sm border-t border-zinc-800/60 px-4 py-3">
        <div className="max-w-xl mx-auto">
          <button onClick={() => void generate()} disabled={credits === 0}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-extrabold text-white vy-grad-bg vy-press disabled:opacity-40">
            <Sparkles className="w-5 h-5" /> Crear mi anuncio
            <ArrowRight className="w-4 h-4" />
            <span className="text-[10px] font-normal opacity-70 ml-1 flex items-center gap-0.5">
              <Zap className="w-3 h-3" />{credits !== null ? credits.toLocaleString("es") : "…"}
            </span>
          </button>
        </div>
      </div>
    </>
  );
}
