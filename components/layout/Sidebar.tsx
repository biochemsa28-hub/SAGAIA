"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, PlusCircle, BookOpen,
  Settings, Sparkles, ChevronRight, Zap, Package,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard",               icon: LayoutDashboard, label: "Dashboard"      },
  { href: "/dashboard/projects/new",  icon: PlusCircle,      label: "Nueva historia", highlight: true },
  { href: "/dashboard/batch",         icon: Package,         label: "En serie",  highlight: true },
  { href: "/dashboard/library",       icon: BookOpen,        label: "Biblioteca"     },
  { href: "/dashboard/settings",      icon: Settings,        label: "Configuración"  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [credits, setCredits] = useState<number | null>(null);
  const [plan, setPlan] = useState<string>("free");

  useEffect(() => {
    fetch("/api/credits")
      .then((r) => r.json())
      .then((d: { credits?: number; plan?: string }) => {
        if (typeof d.credits === "number") setCredits(d.credits);
        if (d.plan) setPlan(d.plan);
      })
      .catch(() => null);
  }, [pathname]); // refresh on route change

  const maxCredits = plan === "free" ? 5 : plan === "starter" ? 10 : plan === "pro" ? 40 : 120;
  const pct = credits === null ? 0 : Math.min(100, Math.round((credits / maxCredits) * 100));
  const low = credits !== null && credits <= 2;
  const empty = credits === 0;

  return (
    <aside className="fixed left-0 top-0 h-full w-60 bg-zinc-950 border-r border-zinc-800 flex flex-col z-20">

      {/* Logo */}
      <div className="px-5 py-5 border-b border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="relative w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center">
            <span className="logo-ping absolute inset-0 rounded-lg bg-violet-500/50" />
            <Sparkles className="logo-sparkle w-4 h-4 text-white relative z-10" />
          </div>
          <div>
            <p className="text-white text-sm font-bold leading-tight">VYNAVO</p>
            <p className="text-violet-400 text-xs leading-tight">Studio AI</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {NAV.map(({ href, icon: Icon, label, highlight }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                active
                  ? "bg-violet-600/20 text-violet-300 border border-violet-700/40"
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60",
                highlight && !active && "text-violet-400 hover:text-violet-300"
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{label}</span>
              {active && <ChevronRight className="w-3 h-3 opacity-60" />}
            </Link>
          );
        })}
      </nav>

      {/* Credits footer — dynamic */}
      <div className="px-4 py-4 border-t border-zinc-800">
        <Link href="/pricing">
          <div className={`rounded-xl p-3 transition-colors cursor-pointer ${
            empty ? "bg-red-950/40 border border-red-800/40 hover:bg-red-950/60"
            : low  ? "bg-amber-950/30 border border-amber-800/30 hover:bg-amber-950/50"
            : "bg-zinc-900 border border-zinc-800 hover:bg-zinc-800/80"
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-zinc-400 font-medium">Créditos</span>
              <span className={`text-xs font-bold flex items-center gap-1 ${
                empty ? "text-red-400" : low ? "text-amber-400" : "text-violet-400"
              }`}>
                <Zap className="w-3 h-3" />
                {credits === null ? "…" : credits}
              </span>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  empty ? "bg-red-500" : low ? "bg-amber-500" : "bg-gradient-to-r from-violet-500 to-pink-500"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>

            <p className={`text-xs mt-2 ${empty ? "text-red-400" : low ? "text-amber-400" : "text-zinc-500"}`}>
              {empty
                ? "Sin créditos · Recargar →"
                : low
                ? `Quedan ${credits} · Recargar →`
                : `Plan ${plan.charAt(0).toUpperCase() + plan.slice(1)} · Recargar`}
            </p>
          </div>
        </Link>
      </div>

    </aside>
  );
}
