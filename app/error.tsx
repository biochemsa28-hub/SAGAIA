"use client";
import { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[SAGAIA error]", error);
  }, [error]);

  return (
    <html lang="es">
      <body className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          {/* Icon */}
          <div className="w-16 h-16 rounded-2xl bg-red-900/30 border border-red-800/40 flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>

          <h1 className="text-2xl font-bold text-white mb-2">Algo salió mal</h1>
          <p className="text-zinc-400 mb-2 text-sm">
            Ocurrió un error inesperado en SAGAIA Studio.
          </p>
          {error?.message && (
            <p className="text-xs text-zinc-600 font-mono bg-zinc-900 rounded-lg px-3 py-2 mb-6 break-all">
              {error.message}
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={reset}
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Reintentar
            </button>
            <Link
              href="/dashboard"
              className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors"
            >
              <Home className="w-4 h-4" />
              Ir al Dashboard
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
