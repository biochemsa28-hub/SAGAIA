import Link from "next/link";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-lg font-bold text-white tracking-tight">
          VYNAVO <span className="text-xs bg-violet-600 text-white px-1.5 py-0.5 rounded font-normal">IA</span>
        </Link>
        <Link href="/login" className="text-xs text-zinc-400 hover:text-white transition-colors">
          Iniciar sesión →
        </Link>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-12">
        {children}
      </main>
      <footer className="border-t border-zinc-800 px-6 py-6 text-center">
        <div className="flex items-center justify-center gap-6 text-xs text-zinc-600">
          <Link href="/terms" className="hover:text-zinc-400 transition-colors">Términos</Link>
          <Link href="/privacy" className="hover:text-zinc-400 transition-colors">Privacidad</Link>
          <Link href="/dashboard" className="hover:text-zinc-400 transition-colors">App</Link>
        </div>
      </footer>
    </div>
  );
}
