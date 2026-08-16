"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { Megaphone, Sparkles, ArrowRight, AlertCircle, Loader2, Zap, Upload, X, Images } from "lucide-react";
import { DURATION_OPTIONS, PLATFORMS } from "@/lib/constants/nichos";
import { videoSecondsFor, NAVOS_PER_USD } from "@/lib/config";
import { CinematicLoader } from "@/components/ui/CinematicLoader";

// Tonos DE ANUNCIO. Antes se ofrecían los del drama —"Terror", "Misterio",
// "Chisme"— para vender una cafetera. Cada uno se mapea a un tono que el motor
// entiende, pero el usuario ve cómo va a SONAR su anuncio.
const AD_TONES: Array<{ id: string; label: string; hint: string }> = [
  { id: "inspirational", label: "Cercano y honesto", hint: "Como un amigo que te recomienda algo" },
  { id: "comedy",        label: "Divertido",         hint: "Ligero, con gracia, se comparte" },
  { id: "drama",         label: "Premium",           hint: "Elegante, aspiracional, sin gritar" },
  { id: "thriller",      label: "Urgente (oferta)",  hint: "Ritmo rápido, cierre con prisa" },
  { id: "confesion",     label: "Testimonio",        hint: "\"Yo no creía… hasta que lo probé\"" },
];
// 30s es lo recomendado para un anuncio UGC: se ve entero, y el CTA llega antes
// de que el pulgar siga. 60s solo si el producto necesita demostración.
const AD_DURATIONS = DURATION_OPTIONS.filter(d => d.id === "30s" || d.id === "60s").map(d => ({
  id: d.id, label: d.label,
  hint: d.id === "30s" ? "Recomendado · se ve entero, el CTA llega a tiempo" : "Si el producto necesita demostrarse",
  recomendada: d.id === "30s",
}));
const precioLegible = (navos: number) =>
  `${navos.toLocaleString("es")} NAVOS · ≈ US${(navos / NAVOS_PER_USD).toFixed(navos / NAVOS_PER_USD < 10 ? 1 : 0)}`;

export default function NewAdPage() {
  const router = useRouter();
  const [product, setProduct] = useState("");
  const [benefit, setBenefit] = useState("");
  const [audience, setAudience] = useState("");
  const [cta, setCta] = useState("");
  const [tone, setTone] = useState<string>("inspirational");
  const [duration, setDuration] = useState("30s");
  const [platform, setPlatform] = useState("tiktok");
  // Single premium tier — every ad is produced with lip-sync (a presenter that talks).
  const [tier] = useState<"kenburns" | "cinematic" | "talking">("talking");
  const [userPlan, setUserPlan] = useState("free");
  const [credits, setCredits] = useState<number | null>(null);
  // El precio que el SERVIDOR va a cobrar (por 60s), escalado a la duración
  // elegida. Antes se mostraba una constante del tier "talking" —19.500— y el
  // servidor cobraba 6.120: tres veces menos de lo anunciado.
  const [navosPor60s, setNavosPor60s] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const MAX_IMAGES = 4;

  useEffect(() => {
    fetch("/api/credits").then(r => r.json())
      .then((d: { credits?: number; plan?: string; navos_por_60s?: number }) => {
        if (typeof d.credits === "number") setCredits(d.credits);
        if (d.plan) setUserPlan(d.plan);
        if (typeof d.navos_por_60s === "number") setNavosPor60s(d.navos_por_60s);
      }).catch(() => null);
  }, []);

  async function uploadImages(files: FileList) {
    const slots = MAX_IMAGES - imageUrls.length;
    if (slots <= 0) return;
    setUploading(true);
    setError(null);
    setUploadMsg(null);
    try {
      const picked = Array.from(files).slice(0, slots);
      const uploaded: string[] = [];
      for (const file of picked) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const data = await res.json() as { url?: string; error?: string };
        if (!res.ok || !data.url) throw new Error(data.error ?? "No se pudo subir la imagen");
        uploaded.push(data.url);
      }
      setImageUrls((prev) => [...prev, ...uploaded].slice(0, MAX_IMAGES));
      setUploadMsg({ ok: true, text: `${uploaded.length} imagen(es) subida(s) ✓` });
    } catch (err) {
      setUploadMsg({ ok: false, text: err instanceof Error ? err.message : "Error al subir la imagen" });
    } finally {
      setUploading(false);
    }
  }

  function removeImage(url: string) {
    setImageUrls((prev) => prev.filter((u) => u !== url));
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
          reference_image_url: imageUrls[0] ?? undefined,
          reference_image_urls: imageUrls.length ? imageUrls : undefined,
        }),
      });
      if (res.status === 402) {
        const e = await res.json() as { required?: number };
        setError(`Necesitas ${(e.required ?? 0).toLocaleString("es")} NAVOS para este anuncio y tienes ${(credits ?? 0).toLocaleString("es")}. Recarga para continuar.`);
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
          <CinematicLoader icon="📣" />
          <h2 className="text-lg font-bold vy-grad-text vy-glowtext mt-2">Escribiendo tu anuncio…</h2>
          <p className="text-sm text-zinc-500 mt-1">Hook · problema · producto · beneficios · CTA</p>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title="Anuncios" subtitle="Crea un video publicitario con IA" />
      <div className="p-4 max-w-xl mx-auto space-y-5 pb-28">

        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl vy-grad-bg p-[1.5px]">
          <div className="relative rounded-2xl bg-zinc-950/90 p-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl vy-grad-bg flex items-center justify-center shrink-0 vy-float2">
                <Megaphone className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-base font-extrabold vy-grad-text">Anuncio estilo creador (UGC)</p>
                <p className="text-xs text-zinc-400 mt-0.5">Un presentador real promociona tu producto: engancha, muestra el beneficio y cierra con un CTA. Se ve orgánico, no comercial.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {["🗣️ Presentador que habla", "📦 Tu producto real", "🎬 Calidad cine", "⚡ En minutos"].map((b) => (
                <span key={b} className="text-[10px] font-bold text-violet-200 bg-violet-950/50 border border-violet-800/40 rounded-full px-2.5 py-1">{b}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Subir imágenes del producto / contenido — galería multi-ángulo */}
        <div className="vy-glass rounded-2xl p-4">
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-bold text-white flex items-center gap-1.5">
              <Images className="w-4 h-4 text-violet-300" /> Fotos de tu producto
            </label>
            <span className="text-[10px] font-bold text-zinc-500">{imageUrls.length}/{MAX_IMAGES}</span>
          </div>
          <p className="text-[11px] text-zinc-500 mb-3">Sube <span className="text-violet-300 font-semibold">varios ángulos</span> (frente, lados, en uso). Mientras más vea la IA, más real se ve tu anuncio. ✨</p>

          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden"
            onChange={e => { const fl = e.target.files; if (fl?.length) void uploadImages(fl); e.target.value = ""; }} />

          <div className="grid grid-cols-4 gap-2">
            {imageUrls.map((url, i) => (
              <div key={url} className="relative aspect-square group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Producto ${i + 1}`} className="w-full h-full object-cover rounded-xl border border-violet-700/50" />
                {i === 0 && (
                  <span className="absolute bottom-1 left-1 text-[8px] font-bold bg-violet-600 text-white px-1.5 py-0.5 rounded-md">Principal</span>
                )}
                <button onClick={() => removeImage(url)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-300 hover:text-white hover:border-red-500 transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {imageUrls.length < MAX_IMAGES && (
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="aspect-square flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-zinc-700 hover:border-violet-600 hover:bg-violet-950/30 text-zinc-500 hover:text-violet-300 transition-all">
                {uploading
                  ? <Loader2 className="w-5 h-5 animate-spin" />
                  : <><Upload className="w-5 h-5" /><span className="text-[9px] font-bold">Añadir</span></>}
              </button>
            )}
          </div>

          {/* Feedback de subida — visible justo aquí, no al fondo del formulario */}
          {uploading && (
            <p className="text-[11px] text-violet-300 mt-2 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Subiendo imagen…</p>
          )}
          {!uploading && uploadMsg && (
            <p className={`text-[11px] mt-2 flex items-start gap-1.5 ${uploadMsg.ok ? "text-emerald-400" : "text-red-400"}`}>
              {uploadMsg.ok ? <span>✓</span> : <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />}
              <span>{uploadMsg.text}</span>
            </p>
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
          <p className="text-xs font-bold text-zinc-400 mb-2">¿Cómo quieres que suene?</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {AD_TONES.map(t => (
              <button key={t.id} onClick={() => setTone(t.id)}
                className={`p-2.5 rounded-xl border text-left transition-all ${tone === t.id ? "vy-grad-bg text-white border-transparent" : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"}`}>
                <p className={`text-xs font-bold ${tone === t.id ? "text-white" : "text-zinc-300"}`}>{t.label}</p>
                <p className={`text-[10px] mt-0.5 leading-tight ${tone === t.id ? "text-white/80" : "text-zinc-600"}`}>{t.hint}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Duración + plataforma */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-bold text-zinc-400 mb-2">¿Cuánto dura?</p>
            <div className="grid grid-cols-1 gap-2">
              {AD_DURATIONS.map(d => (
                <button key={d.id} onClick={() => setDuration(d.id)}
                  className={`relative p-2.5 rounded-xl border text-left transition-all ${duration === d.id ? "vy-grad-bg text-white border-transparent" : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"}`}>
                  {d.recomendada && (
                    <span className="absolute -top-2 right-2 text-[9px] font-extrabold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-emerald-500 text-black">Recomendado</span>
                  )}
                  <p className={`text-xs font-bold ${duration === d.id ? "text-white" : "text-zinc-300"}`}>{d.label}</p>
                  <p className={`text-[10px] mt-0.5 leading-tight ${duration === d.id ? "text-white/80" : "text-zinc-600"}`}>{d.hint}</p>
                  {navosPor60s !== null && (
                    <p className={`text-[10px] mt-1 font-bold ${duration === d.id ? "text-white" : "text-violet-300/80"}`}>{precioLegible(Math.round(navosPor60s * (videoSecondsFor(d.id) / 60)))}</p>
                  )}
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

        {/* Resumen en una línea — lo mismo que en historias: qué vas a producir,
            cuánto cuesta en NAVOS y en dólares, y cuánto te queda. */}
        {navosPor60s !== null && (() => {
          const seg = videoSecondsFor(duration);
          const navos = Math.round(navosPor60s * (seg / 60));
          const tonoLabel = AD_TONES.find(t => t.id === tone)?.label ?? tone;
          return (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
              <p className="text-[11px] text-zinc-500 mb-0.5">Vas a producir</p>
              <p className="text-sm text-zinc-200">
                <span className="font-extrabold text-white">Un anuncio con presentador que habla</span>
                {" · "}<span className="font-bold">{seg} segundos</span>
                {" · "}<span className="font-bold">{tonoLabel.toLowerCase()}</span>
                {imageUrls.length ? <>{" · "}<span className="font-bold">con tu producto real</span></> : null}
              </p>
              <p className="text-[11px] mt-1 font-bold text-violet-300/90">
                {precioLegible(navos)}
                {credits !== null && <span className="font-normal text-zinc-500"> · te quedan {Math.max(0, credits - navos).toLocaleString("es")} NAVOS después</span>}
              </p>
            </div>
          );
        })()}

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
