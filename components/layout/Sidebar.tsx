"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  PlusCircle,
  BookOpen,
  Settings,
  ScrollText,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard",            icon: LayoutDashboard, label: "Dashboard" },
  { href: "/dashboard/projects/new", icon: PlusCircle,    label: "Nuevo proyecto", highlight: true },
  { href: "/dashboard/library",    icon: BookOpen,        label: "Biblioteca" },
  { href: "/dashboard/logs",       icon: ScrollText,      label: "Logs" },
  { href: "/dashboard/settings",   icon: Settings,        label: "Configuración" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-full w-60 bg-zinc-950 border-r border-zinc-800 flex flex-col z-20">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-zinc-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-white text-sm font-bold leading-tight">SAGAIA</p>
            <p className="text-violet-400 text-xs leading-tight">Studio AI</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-1">
        {NAV.map(({ href, icon: Icon, label, highlight }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group",
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

      {/* Credits Footer */}
      <div className="px-4 py-4 border-t border-zinc-800">
        <div className="bg-zinc-900 rounded-lg p-3">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-zinc-400">Créditos</span>
            <span className="text-xs font-bold text-violet-400">5 / 5</span>
          </div>
          <div className="h-1.5 bg-zinc-800 rounded-full">
            <div className="h-full w-full bg-violet-600 rounded-full" />
          </div>
          <p className="text-xs text-zinc-500 mt-2">Plan Free · <span className="text-violet-400 cursor-pointer hover:underline">Upgrade</span></p>
        </div>
      </div>
    </aside>
  );
}
