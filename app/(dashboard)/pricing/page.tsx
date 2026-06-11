"use client";
import { useState, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check, Zap, Loader2, ArrowLeft } from "lucide-react";
import { PLANS } from "@/lib/stripe-plans";

function CancelledBanner() {
  const params = useSearchParams();
  const cancelled = params.get("payment") === "cancelled";
  if (!cancelled) return null;
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 mb-8 text-center text-sm text-zinc-400">
      Pago cancelado. Puedes intentarlo de nuevo cuando quieras.
    </div>
  );
}

export default function PricingPage() {
  const { data: session } = useSession();
  const router = useRouter();

  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function checkout(planId: string) {
    if (!session) { router.push("/login"); return; }
    setLoading(planId);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: planId }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error ?? "Error al iniciar pago");
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-4xl mx-auto px-4 py-16">

        {/* Back */}
        {session && (
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-zinc-500 hover:text-zinc-300 text-sm mb-10 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Volver al dashboard
          </Link>
        )}

        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-violet-600/10 border border-violet-700/30 rounded-full px-4 py-1.5 mb-6">
            <Zap className="w-3.5 h-3.5 text-violet-400" />
            <span className="text-xs text-violet-300 font-medium">Recarga de créditos</span>
          </div>
          <h1 className="text-4xl font-bold mb-4">
            Un crédito = un microserie completo
          </h1>
          <p className="text-zinc-400 text-lg max-w-xl mx-auto">
            Voz, imágenes, clips animados y video final MP4 — todo incluido en cada crédito.
          </p>
        </div>

        {/* Cancelled notice */}
        <Suspense fallback={null}>
          <CancelledBanner />
        </Suspense>

        {/* Error */}
        {error && (
          <div className="bg-red-950/40 border border-red-700/40 rounded-xl p-4 mb-8 text-center text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Plans grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`relative rounded-2xl border p-6 flex flex-col transition-all ${
                plan.popular
                  ? "border-violet-500/60 bg-violet-950/20 shadow-lg shadow-violet-900/20"
                  : "border-zinc-700/50 bg-zinc-900/50"
              }`}
            >
              {/* Popular badge */}
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-gradient-to-r from-violet-600 to-pink-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                    MÁS POPULAR
                  </span>
                </div>
              )}

              {/* Plan info */}
              <div className="mb-6">
                <h2 className="text-lg font-bold text-white">{plan.name}</h2>
                <p className="text-sm text-zinc-500 mt-0.5">{plan.description}</p>
                <div className="mt-4 flex items-end gap-1">
                  <span className="text-4xl font-bold text-white">
                    ${(plan.price / 100).toFixed(0)}
                  </span>
                  <span className="text-zinc-500 mb-1">USD</span>
                </div>
                <p className="text-sm text-violet-400 font-medium mt-1">
                  {plan.credits} créditos · ${((plan.price / 100) / plan.credits).toFixed(2)} c/u
                </p>
              </div>

              {/* Features */}
              <ul className="space-y-2.5 flex-1 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-zinc-300">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <button
                onClick={() => checkout(plan.id)}
                disabled={loading !== null}
                className={`w-full py-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
                  plan.popular
                    ? "bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 text-white shadow-lg shadow-violet-900/30"
                    : "bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700"
                } disabled:opacity-60 disabled:cursor-not-allowed`}
              >
                {loading === plan.id
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Redirigiendo…</>
                  : session
                  ? `Comprar ${plan.credits} créditos`
                  : "Crear cuenta gratis"}
              </button>
            </div>
          ))}
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-zinc-600 mt-10">
          Pago único · Sin suscripción · Los créditos no expiran · Procesado por Stripe
        </p>
      </div>
    </div>
  );
}
