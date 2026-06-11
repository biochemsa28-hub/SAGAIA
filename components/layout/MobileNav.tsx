"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, PlusCircle, BookOpen, Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard",              icon: LayoutDashboard, label: "Dashboard" },
  { href: "/dashboard/projects/new", icon: PlusCircle,      label: "Crear"    },
  { href: "/dashboard/library",      icon: BookOpen,        label: "Biblioteca"},
  { href: "/dashboard/settings",     icon: Settings,        label: "Ajustes"  },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 md:hidden bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800">
      <div className="flex items-center justify-around px-2 py-1 safe-area-inset-bottom">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active =
            pathname === href ||
            (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all min-w-[60px]",
                active
                  ? "text-violet-400"
                  : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              <Icon className={cn("w-5 h-5", active && "drop-shadow-[0_0_6px_rgba(167,139,250,0.7)]")} />
              <span className="text-[10px] font-medium">{label}</span>
              {active && (
                <span className="w-1 h-1 rounded-full bg-violet-400" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
