"use client";
import { Zap, Plus } from "lucide-react";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

interface TopBarProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function TopBar({ title, subtitle, actions }: TopBarProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [credits, setCredits] = useState<number | null>(null);

  const initials = session?.user?.name
    ? session.user.name.slice(0, 2).toUpperCase()
    : "U";

  useEffect(() => {
    if (!session?.user) return;
    fetch("/api/credits")
      .then((r) => r.json())
      .then((d: { credits?: number }) => {
        if (typeof d.credits === "number") setCredits(d.credits);
      })
      .catch(() => null);
  }, [session]);

  const low = credits !== null && credits <= 10;
  const empty = credits === 0;

  const creditColor =
    credits === null ? "text-violet-300" :
    empty            ? "text-red-400"    :
    low              ? "text-amber-400"  : "text-violet-300";

  const barBg =
    empty ? "border-red-700/40 bg-red-600/10 hover:bg-red-600/20 animate-pulse" :
    low   ? "border-amber-700/40 bg-amber-600/10 hover:bg-amber-600/20" :
    "border-violet-700/30 bg-violet-600/10 hover:bg-violet-600/20";

  return (
    <header className="h-14 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm flex items-center justify-between px-4 md:px-6 sticky top-0 z-10">
      {/* Left: title */}
      <div>
        <h1 className="text-sm font-semibold text-white leading-tight">{title}</h1>
        {subtitle && <p className="text-[11px] text-zinc-500">{subtitle}</p>}
      </div>

      {/* Right: actions + credits + avatar */}
      <div className="flex items-center gap-2">
        {actions}

        {/* Credits chip — click → pricing */}
        <button
          onClick={() => router.push("/pricing")}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-all border ${barBg}`}
          title={empty ? "Sin NAVOS — Recarga ahora" : low ? "Pocos NAVOS — Recarga antes de quedarte sin" : "Mis NAVOS"}
        >
          <Zap className={`w-3.5 h-3.5 ${creditColor}`} />
          <span className={`text-xs font-bold ${creditColor}`}>
            {credits === null ? "…" : credits}
          </span>
          <span className={`text-[10px] font-semibold ${creditColor} opacity-80`}>NAVOS</span>
          <Plus className={`w-3 h-3 ${creditColor} opacity-60`} />
        </button>

        {/* Avatar */}
        <div
          className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity"
          title={session?.user?.name ?? "Mi cuenta"}
          onClick={() => router.push("/dashboard/settings")}
        >
          <span className="text-[11px] font-bold text-white">{initials}</span>
        </div>
      </div>
    </header>
  );
}
