"use client";
import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Clapperboard, Loader2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";

// useSearchParams exige un límite de Suspense en Next — sin él, el build falla.
function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: password }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (data.success) {
        setDone(true);
        setTimeout(() => router.push("/login"), 2500);
      } else {
        setError(data.error ?? "No se pudo cambiar la contraseña.");
      }
    } catch {
      setError("Error de conexión. Probá de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  // Sin token no hay nada que hacer acá: llegó sin pasar por el correo.
  if (!token) {
    return (
      <div className="text-center py-2">
        <h1 className="text-white text-xl font-bold mb-2">Enlace incompleto</h1>
        <p className="text-zinc-400 text-sm mb-4">
          Este enlace no trae el código de verificación. Pedí uno nuevo.
        </p>
        <Link href="/forgot-password" className="text-violet-400 hover:text-violet-300 text-sm">
          Pedir un enlace nuevo
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="text-center py-2">
        <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-4">
          <KeyRound className="w-6 h-6 text-emerald-400" />
        </div>
        <h1 className="text-white text-xl font-bold mb-2">Contraseña cambiada</h1>
        <p className="text-zinc-400 text-sm">Te llevamos a iniciar sesión…</p>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-white text-xl font-bold mb-1">Creá tu contraseña nueva</h1>
      <p className="text-zinc-400 text-sm mb-6">Mínimo 8 caracteres.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">Contraseña nueva</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoFocus
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 transition-colors"
            placeholder="••••••••"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">Repetila</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 transition-colors"
            placeholder="••••••••"
          />
        </div>

        {error && (
          <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <Button type="submit" disabled={loading} className="w-full bg-violet-600 hover:bg-violet-500">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar contraseña"}
        </Button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="w-full max-w-sm">
      <div className="flex items-center gap-2 justify-center mb-8">
        <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center">
          <Clapperboard className="w-5 h-5 text-white" />
        </div>
        <span className="text-white font-bold text-xl">VYNAVO</span>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
        <Suspense fallback={<Loader2 className="w-5 h-5 animate-spin text-zinc-500 mx-auto" />}>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  );
}
