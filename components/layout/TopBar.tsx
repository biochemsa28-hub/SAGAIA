"use client";
import { Bell, Zap } from "lucide-react";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

interface TopBarProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function TopBar({ title, subtitle, actions }: TopBarProps) {
  const { data: session } = useSession();
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

  const creditColor =
    credits === null ? "text-violet-300" :
    credits === 0 ? "text-red-400" :
    credits <= 2 ? "text-amber-400" : "text-violet-300";

  return (
    <header className="h-14 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm flex items-center justify-between px-6 sticky top-0 z-10">
      <div>
        <h1 className="text-sm font-semibold text-white">{title}</h1>
        {subtitle && <p className="text-xs text-zinc-500">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
        {actions}
        <button className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center transition-colors">
          <Bell className="w-4 h-4 text-zinc-400" />
        </button>
        <div className={`flex items-center gap-2 bg-violet-600/10 border border-violet-700/30 rounded-lg px-3 py-1.5 ${credits === 0 ? "border-red-700/40 bg-red-600/10" : ""}`}>
          <Zap className={`w-3.5 h-3.5 ${creditColor}`} />
          <span className={`text-xs font-medium ${creditColor}`}>
            {credits === null ? "…" : `${credits} crédito${credits !== 1 ? "s" : ""}`}
          </span>
        </div>
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center">
          <span className="text-xs font-bold text-white">{initials}</span>
        </div>
      </div>
    </header>
  );
}
