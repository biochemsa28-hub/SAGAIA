import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "success" | "warning" | "error" | "info" | "purple";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variants: Record<BadgeVariant, string> = {
  default: "bg-zinc-800 text-zinc-300",
  success: "bg-emerald-900/50 text-emerald-400 border border-emerald-800",
  warning: "bg-amber-900/50 text-amber-400 border border-amber-800",
  error:   "bg-red-900/50 text-red-400 border border-red-800",
  info:    "bg-blue-900/50 text-blue-400 border border-blue-800",
  purple:  "bg-violet-900/50 text-violet-400 border border-violet-800",
};

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium", variants[variant], className)}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    draft:               { label: "Borrador",    variant: "default" },
    generating:          { label: "Generando…",  variant: "info" },
    script_generated:    { label: "Guion listo", variant: "purple" },
    prompts_generated:   { label: "Prompts ✓",   variant: "purple" },
    voice_pending:       { label: "Voz pendiente", variant: "warning" },
    voice_done:          { label: "Voz lista",   variant: "success" },
    ready:               { label: "Listo",       variant: "success" },
    failed:              { label: "Error",        variant: "error" },
  };
  const cfg = map[status] ?? { label: status, variant: "default" as BadgeVariant };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}
