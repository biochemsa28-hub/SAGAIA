"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, PlusCircle, BookOpen,
  Settings, Sparkles, Zap, Package, Users, Megaphone,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Each item carries its OWN accent color so the nav feels alive and colorful —
// not a flat grey list. `accent` drives the icon chip + active glow.
type NavItem = {
  href: string;
  icon: typeof LayoutDashboard;
  label: string;
  desc: string;
  accent: string;       // tailwind color stem, e.g. "violet"
  badge?: string;
};

const SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Crear",
    items: [
      { href: "/dashboard/projects/new", icon: PlusCircle, label: "Nueva historia", desc: "Microserie viral", accent: "violet", badge: "IA" },
      { href: "/dashboard/ads/new",      icon: Megaphone,  label: "Anuncios",       desc: "UGC con tu producto", accent: "pink" },
      { href: "/dashboard/batch",        icon: Package,    label: "En serie",       desc: "Producción masiva", accent: "amber" },
    ],
  },
  {
    title: "Explorar",
    items: [
      { href: "/dashboard",            icon: LayoutDashboard, label: "Dashboard",   desc: "Tu centro de mando", accent: "sky" },
      { href: "/dashboard/characters", icon: Users,           label: "Personajes",  desc: "Tu elenco", accent: "cyan" },
      { href: "/dashboard/library",    icon: BookOpen,        label: "Biblioteca",  desc: "Tus creaciones", accent: "emerald" },
      { href: "/dashboard/settings",   icon: Settings,        label: "Configuración", desc: "Cuenta y plan", accent: "zinc" },
    ],
  },
];

// Pre-declared class maps so Tailwind keeps them (no dynamic class purging issues).
const ACCENT: Record<string, { chip: string; chipActive: string; text: string; glow: string; bar: string }> = {
  violet:  { chip: "bg-violet-500/10 text-violet-400",   chipActive: "bg-violet-500 text-white",   text: "text-violet-300",  glow: "shadow-[0_0_20px_-4px_rgba(139,92,246,0.6)]",  bar: "bg-violet-400" },
  pink:    { chip: "bg-pink-500/10 text-pink-400",       chipActive: "bg-pink-500 text-white",     text: "text-pink-300",    glow: "shadow-[0_0_20px_-4px_rgba(236,72,153,0.6)]",  bar: "bg-pink-400" },
  amber:   { chip: "bg-amber-500/10 text-amber-400",     chipActive: "bg-amber-500 text-white",    text: "text-amber-300",   glow: "shadow-[0_0_20px_-4px_rgba(245,158,11,0.6)]",  bar: "bg-amber-400" },
  sky:     { chip: "bg-sky-500/10 text-sky-400",         chipActive: "bg-sky-500 text-white",      text: "text-sky-300",     glow: "shadow-[0_0_20px_-4px_rgba(14,165,233,0.6)]",  bar: "bg-sky-400" },
  cyan:    { chip: "bg-cyan-500/10 text-cyan-400",       chipActive: "bg-cyan-500 text-white",     text: "text-cyan-300",    glow: "shadow-[0_0_20px_-4px_rgba(6,182,212,0.6)]",   bar: "bg-cyan-400" },
  emerald: { chip: "bg-emerald-500/10 text-emerald-400", chipActive: "bg-emerald-500 text-white",  text: "text-emerald-300", glow: "shadow-[0_0_20px_-4px_rgba(16,185,129,0.6)]",  bar: "bg-emerald-400" },
  zinc:    { chip: "bg-zinc-700/40 text-zinc-300",       chipActive: "bg-zinc-600 text-white",     text: "text-zinc-200",    glow: "shadow-[0_0_20px_-4px_rgba(113,113,122,0.5)]", bar: "bg-zinc-400" },
};

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
  }, [pathname]);

  const maxCredits = plan === "studio" ? 99000 : plan === "pro" ? 49000 : plan === "creator" ? 29000 : 9000;
  const pct = credits === null ? 0 : Math.min(100, Math.round((credits / maxCredits) * 100));
  const low = credits !== null && credits < 9000;
  const empty = credits === 0;

  return (
    <aside className="fixed left-0 top-0 h-full w-60 bg-zinc-950 border-r border-zinc-800/80 flex flex-col z-20">

      {/* Logo */}
      <Link href="/dashboard" className="px-5 py-5 border-b border-zinc-800/80 block group">
        <div className="flex items-center gap-2.5">
          <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center group-hover:scale-105 transition-transform">
            <span className="logo-ping absolute inset-0 rounded-xl bg-violet-500/50" />
            <Sparkles className="logo-sparkle w-4.5 h-4.5 text-white relative z-10" />
          </div>
          <div>
            <p className="text-white text-sm font-extrabold leading-tight tracking-tight vy-grad-text">VYNAVO</p>
            <p className="text-zinc-500 text-[10px] leading-tight uppercase tracking-widest">Studio AI</p>
          </div>
        </div>
      </Link>

      {/* Nav — grouped + colorful */}
      <nav className="flex-1 py-4 px-3 overflow-y-auto space-y-5 vy-noscroll">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="px-2 mb-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-600">{section.title}</p>
            <div className="space-y-1">
              {section.items.map(({ href, icon: Icon, label, desc, accent, badge }) => {
                const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
                const a = ACCENT[accent]!;
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "group relative flex items-center gap-3 px-2.5 py-2 rounded-xl transition-all duration-200",
                      active
                        ? `bg-zinc-900/90 border border-zinc-700/60 ${a.glow}`
                        : "border border-transparent hover:bg-zinc-900/60 hover:border-zinc-800"
                    )}
                  >
                    {/* Active left bar */}
                    {active && <span className={cn("absolute left-0 top-2 bottom-2 w-1 rounded-r-full", a.bar)} />}
                    {/* Icon chip */}
                    <span className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-200",
                      active ? a.chipActive : `${a.chip} group-hover:scale-110`
                    )}>
                      <Icon className="w-4 h-4" />
                    </span>
                    {/* Label + desc */}
                    <span className="flex-1 min-w-0">
                      <span className={cn("block text-sm font-semibold leading-tight truncate", active ? "text-white" : "text-zinc-300 group-hover:text-white")}>
                        {label}
                      </span>
                      <span className={cn("block text-[10px] leading-tight truncate", active ? a.text : "text-zinc-600")}>{desc}</span>
                    </span>
                    {badge && (
                      <span className={cn("text-[8px] font-bold px-1.5 py-0.5 rounded-md shrink-0", active ? "bg-white/15 text-white" : `${a.chip}`)}>{badge}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Credits footer */}
      <div className="px-4 py-4 border-t border-zinc-800/80">
        <Link href="/pricing">
          <div className={cn(
            "rounded-xl p-3 transition-all cursor-pointer",
            empty ? "bg-red-950/40 border border-red-800/40 hover:bg-red-950/60"
            : low  ? "bg-amber-950/30 border border-amber-800/30 hover:bg-amber-950/50"
            : "bg-gradient-to-br from-zinc-900 to-zinc-900/40 border border-zinc-800 hover:border-violet-800/50"
          )}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-zinc-400 font-semibold uppercase tracking-wide">Créditos</span>
              <span className={cn("text-xs font-extrabold flex items-center gap-1",
                empty ? "text-red-400" : low ? "text-amber-400" : "text-violet-300")}>
                <Zap className="w-3 h-3" />
                {credits === null ? "…" : credits.toLocaleString("es")}
              </span>
            </div>
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all duration-700",
                  empty ? "bg-red-500" : low ? "bg-amber-500" : "bg-gradient-to-r from-violet-500 via-fuchsia-500 to-pink-500")}
                style={{ width: `${Math.max(pct, 4)}%` }}
              />
            </div>
            <p className={cn("text-[11px] mt-2 font-medium", empty ? "text-red-400" : low ? "text-amber-400" : "text-zinc-500")}>
              {empty ? "Sin créditos · Recargar →"
                : low ? `Quedan ${credits?.toLocaleString("es")} · Recargar →`
                : `Plan ${plan.charAt(0).toUpperCase() + plan.slice(1)} · Recargar →`}
            </p>
          </div>
        </Link>
      </div>

    </aside>
  );
}
