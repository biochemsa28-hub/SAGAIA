"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, BookOpen, Settings, Megaphone, Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Side items flank a raised central "Crear" button (the primary action).
const LEFT = [
  { href: "/dashboard",        icon: LayoutDashboard, label: "Inicio",     accent: "text-sky-400" },
  { href: "/dashboard/ads/new", icon: Megaphone,      label: "Anuncios",   accent: "text-pink-400" },
];
const RIGHT = [
  { href: "/dashboard/library",  icon: BookOpen,  label: "Biblioteca", accent: "text-emerald-400" },
  { href: "/dashboard/settings", icon: Settings,  label: "Ajustes",    accent: "text-zinc-300" },
];

export function MobileNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

  const item = (href: string, Icon: typeof BookOpen, label: string, accent: string) => {
    const active = isActive(href);
    return (
      <Link
        key={href}
        href={href}
        className={cn("flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-all min-w-[56px]",
          active ? accent : "text-zinc-500 hover:text-zinc-300")}
      >
        <Icon className={cn("w-5 h-5 transition-all", active && "drop-shadow-[0_0_6px_currentColor] scale-110")} />
        <span className="text-[9px] font-semibold">{label}</span>
        {active && <span className="w-1 h-1 rounded-full bg-current" />}
      </Link>
    );
  };

  const createActive = pathname.startsWith("/dashboard/projects/new");

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 md:hidden bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800">
      <div className="flex items-end justify-around px-2 py-1.5 safe-area-inset-bottom">
        {LEFT.map((i) => item(i.href, i.icon, i.label, i.accent))}

        {/* Raised central Create button */}
        <Link href="/dashboard/projects/new" className="flex flex-col items-center -mt-5 min-w-[56px]">
          <span className={cn(
            "w-12 h-12 rounded-2xl flex items-center justify-center bg-gradient-to-br from-violet-600 to-fuchsia-600 shadow-lg shadow-violet-900/50 transition-transform active:scale-95",
            createActive ? "ring-2 ring-violet-300 scale-105" : "hover:scale-105"
          )}>
            <Plus className="w-6 h-6 text-white" strokeWidth={2.5} />
          </span>
          <span className={cn("text-[9px] font-bold mt-0.5", createActive ? "text-violet-300" : "text-zinc-400")}>Crear</span>
        </Link>

        {RIGHT.map((i) => item(i.href, i.icon, i.label, i.accent))}
      </div>
    </nav>
  );
}
