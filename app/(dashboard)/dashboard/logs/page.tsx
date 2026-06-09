"use client";
import { useEffect, useState } from "react";
import { TopBar } from "@/components/layout/TopBar";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { Activity, CheckCircle, XCircle, Zap, Clock } from "lucide-react";

interface ApiLog {
  id: string;
  provider: string;
  endpoint: string;
  model: string | null;
  tokens_used: number;
  cost_usd: number;
  duration_ms: number | null;
  status_code: number;
  error: string | null;
  created_at: string;
  project_title: string | null;
}

const PROVIDER_COLOR: Record<string, string> = {
  openai:     "text-emerald-400 bg-emerald-500/10 border-emerald-700/30",
  anthropic:  "text-violet-400 bg-violet-500/10 border-violet-700/30",
  elevenlabs: "text-blue-400 bg-blue-500/10 border-blue-700/30",
  mock:       "text-zinc-400 bg-zinc-500/10 border-zinc-700/30",
};

export default function LogsPage() {
  const [logs, setLogs] = useState<ApiLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/logs")
      .then((r) => r.json())
      .then((d: { logs: ApiLog[] }) => setLogs(d.logs ?? []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, []);

  const totalTokens = logs.reduce((s, l) => s + (l.tokens_used ?? 0), 0);
  const totalCost = logs.reduce((s, l) => s + (l.cost_usd ?? 0), 0);
  const errors = logs.filter((l) => l.status_code >= 400).length;

  return (
    <>
      <TopBar title="Logs de API" subtitle="Historial de llamadas a proveedores de IA" />
      <div className="p-6 space-y-5">

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Llamadas totales", value: String(logs.length),          icon: Activity, color: "text-violet-400" },
            { label: "Tokens usados",    value: totalTokens.toLocaleString(), icon: Zap,      color: "text-blue-400" },
            { label: "Costo total",      value: `$${totalCost.toFixed(4)}`,   icon: Clock,    color: "text-emerald-400" },
            { label: "Errores",          value: String(errors),               icon: XCircle,  color: errors > 0 ? "text-red-400" : "text-zinc-500" },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label} className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <div>
                <p className="text-lg font-bold text-white">{value}</p>
                <p className="text-xs text-zinc-500">{label}</p>
              </div>
            </Card>
          ))}
        </div>

        {loading && (
          <div className="space-y-2">
            {[1,2,3,4,5].map((i) => <div key={i} className="h-14 rounded-xl bg-zinc-800/50 animate-pulse" />)}
          </div>
        )}

        {!loading && logs.length === 0 && (
          <Card className="text-center py-12">
            <Activity className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
            <p className="text-zinc-400 text-sm">Aún no hay llamadas a la API.</p>
            <p className="text-zinc-600 text-xs mt-1">Genera tu primer proyecto para ver los logs aquí.</p>
          </Card>
        )}

        {!loading && logs.length > 0 && (
          <div className="space-y-2">
            {logs.map((log) => {
              const ok = log.status_code < 400;
              const providerClass = PROVIDER_COLOR[log.provider] ?? PROVIDER_COLOR["mock"]!;
              return (
                <Card key={log.id} className="flex items-center gap-4 py-3">
                  <div className="shrink-0">
                    {ok
                      ? <CheckCircle className="w-4 h-4 text-emerald-400" />
                      : <XCircle className="w-4 h-4 text-red-400" />}
                  </div>
                  <span className={`text-xs font-medium border rounded-full px-2 py-0.5 shrink-0 ${providerClass}`}>
                    {log.provider}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-zinc-300 truncate">
                      {log.project_title ?? log.endpoint}
                      {log.model && <span className="text-zinc-500 ml-1">· {log.model}</span>}
                    </p>
                    {log.error && <p className="text-xs text-red-400 truncate mt-0.5">{log.error}</p>}
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    {log.tokens_used > 0 && (
                      <p className="text-xs text-zinc-400">{log.tokens_used.toLocaleString()} tok</p>
                    )}
                    {log.cost_usd > 0 && (
                      <p className="text-xs text-zinc-500">${log.cost_usd.toFixed(4)}</p>
                    )}
                    {log.duration_ms && (
                      <p className="text-xs text-zinc-600">{log.duration_ms}ms</p>
                    )}
                  </div>
                  <p className="text-xs text-zinc-600 shrink-0 w-20 text-right">
                    {formatDate(log.created_at)}
                  </p>
                </Card>
              );
            })}
          </div>
        )}

        <p className="text-xs text-zinc-600 text-center">Las generaciones en modo mock no consumen créditos.</p>
      </div>
    </>
  );
}
