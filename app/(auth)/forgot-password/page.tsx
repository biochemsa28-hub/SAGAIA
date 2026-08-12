"use client";
import { useState } from "react";
import Link from "next/link";
import { Clapperboard, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } finally {
      // La API responde igual exista o no la cuenta, y la pantalla acompaña:
      // mostrar "enviado" siempre evita que esta página sirva para averiguar
      // qué correos están registrados.
      setSent(true);
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="flex items-center gap-2 justify-center mb-8">
        <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center">
          <Clapperboard className="w-5 h-5 text-white" />
        </div>
        <span className="text-white font-bold text-xl">VYNAVO</span>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
        {sent ? (
          <div className="text-center py-2">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
              <MailCheck className="w-6 h-6 text-emerald-400" />
            </div>
            <h1 className="text-white text-xl font-bold mb-2">Revisá tu correo</h1>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Si <span className="text-zinc-200">{email}</span> tiene una cuenta, te llega un
              enlace en unos minutos. Vence en una hora y sirve una sola vez.
            </p>
            <p className="text-zinc-500 text-xs mt-4">¿No llegó? Mirá en spam, o volvé a pedirlo.</p>
          </div>
        ) : (
          <>
            <h1 className="text-white text-xl font-bold mb-1">¿Olvidaste tu contraseña?</h1>
            <p className="text-zinc-400 text-sm mb-6">
              Escribí tu correo y te mandamos un enlace para crear una nueva.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 transition-colors"
                  placeholder="tu@email.com"
                />
              </div>

              <Button type="submit" disabled={loading} className="w-full bg-violet-600 hover:bg-violet-500">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviarme el enlace"}
              </Button>
            </form>
          </>
        )}

        <p className="text-center text-zinc-500 text-xs mt-6">
          <Link href="/login" className="text-violet-400 hover:text-violet-300">Volver a iniciar sesión</Link>
        </p>
      </div>
    </div>
  );
}
