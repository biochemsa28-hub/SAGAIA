"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Clapperboard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Error al registrar.");
        return;
      }
      // Auto login after register
      const signin = await signIn("credentials", { email, password, redirect: false });
      if (signin?.error) {
        router.push("/login");
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="flex items-center gap-2 justify-center mb-8">
        <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center">
          <Clapperboard className="w-5 h-5 text-white" />
        </div>
        <span className="text-white font-bold text-xl">SAGAIA</span>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
        <h1 className="text-white text-xl font-bold mb-1">Crear cuenta</h1>
        <p className="text-zinc-400 text-sm mb-6">5 proyectos gratis para empezar</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Nombre</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 transition-colors"
              placeholder="Tu nombre"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 transition-colors"
              placeholder="tu@email.com"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500 transition-colors"
              placeholder="Mínimo 8 caracteres"
            />
          </div>

          {error && (
            <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Crear cuenta gratis"}
          </Button>
        </form>

        <p className="text-center text-xs text-zinc-500 mt-6">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="text-violet-400 hover:text-violet-300 transition-colors">
            Inicia sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
