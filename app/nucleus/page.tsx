"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface Metrics {
  generated_at: string;
  users: { total: number; today: number; week: number; month: number; paying: number };
  videos: { projects: number; finished: number; today: number; week: number; failed: number };
  cost: { today: number; month: number; all: number };
  navos: { in_circulation: number; spent: number };
  engagement: { active_7d: number; returning_users: number; videos_per_user: number; completion_rate: number; retention_pct: number };
  revenue: { mrr: number; arr: number; margin_month: number };
  series: { date: string; users: number; projects: number; cost: number }[];
  top_creators: { email: string; videos: number; last_seen: string }[];
  by_plan: { plan: string; n: number }[];
  by_niche: { niche: string; n: number }[];
  cost_by_provider: { provider: string; usd: number; n: number }[];
  recent_users: { email: string; plan: string; credits: number; created_at: string }[];
}

function TrendChart({ series }: { series: { date: string; users: number; projects: number; cost: number }[] }) {
  const W = 920, H = 160, PAD = 24;
  const maxP = Math.max(1, ...series.map((s) => s.projects));
  const maxC = Math.max(0.01, ...series.map((s) => s.cost));
  const bw = (W - PAD * 2) / series.length;
  const costPts = series.map((s, i) => {
    const x = PAD + i * bw + bw / 2;
    const y = H - PAD - (s.cost / maxC) * (H - PAD * 2);
    return `${x},${y}`;
  }).join(" ");
  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-600">Tendencia · 14 días</h2>
        <div className="flex gap-3 text-[10px]">
          <span className="text-violet-300">▮ Proyectos</span>
          <span className="text-red-300">— Costo</span>
        </div>
      </div>
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3 overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[520px]" style={{ height: 160 }}>
          {series.map((s, i) => {
            const h = (s.projects / maxP) * (H - PAD * 2);
            const x = PAD + i * bw + 3;
            return <rect key={i} x={x} y={H - PAD - h} width={bw - 6} height={Math.max(0, h)} rx="3" fill="url(#g)" opacity={0.85} />;
          })}
          <polyline points={costPts} fill="none" stroke="#fca5a5" strokeWidth="2" />
          {series.map((s, i) => {
            const x = PAD + i * bw + bw / 2;
            const y = H - PAD - (s.cost / maxC) * (H - PAD * 2);
            return <circle key={i} cx={x} cy={y} r="2.5" fill="#fca5a5" />;
          })}
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a855f7" /><stop offset="100%" stopColor="#7c3aed" />
            </linearGradient>
          </defs>
        </svg>
        <div className="flex justify-between px-2 mt-1">
          {series.map((s, i) => (
            <span key={i} className="text-[8px] text-zinc-600">{i % 2 === 0 ? s.date.slice(5) : ""}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

function UserControl({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("9000");
  const [plan, setPlan] = useState("studio");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const act = async (action: "grant_credits" | "set_plan") => {
    if (!email) { setMsg({ ok: false, text: "Escribe el email" }); return; }
    setBusy(true); setMsg(null);
    try {
      const body: Record<string, unknown> = { email, action };
      if (action === "grant_credits") body.amount = Number(amount);
      if (action === "set_plan") body.plan = plan;
      const r = await fetch("/api/admin/user", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Error");
      setMsg({ ok: true, text: action === "grant_credits" ? `✓ ${email} ahora tiene ${d.credits.toLocaleString("es")} NAVOS` : `✓ ${email} → plan ${d.plan}` });
      onDone();
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Error" }); }
    finally { setBusy(false); }
  };

  return (
    <section>
      <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-600 mb-2">⚙️ Control de usuarios</h2>
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email del usuario"
          className="w-full bg-zinc-950 border border-zinc-800 focus:border-violet-700 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none" />
        <div className="flex flex-wrap gap-2">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" placeholder="NAVOS"
            className="w-28 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-700" />
          <button onClick={() => void act("grant_credits")} disabled={busy}
            className="px-3 py-2 rounded-xl text-xs font-bold vy-grad-bg text-white disabled:opacity-50">Dar NAVOS</button>
          <select value={plan} onChange={(e) => setPlan(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 rounded-xl px-2 py-2 text-sm text-white focus:outline-none">
            <option value="free">free</option><option value="starter">starter</option><option value="creator">creator</option><option value="pro">pro</option><option value="studio">studio</option>
          </select>
          <button onClick={() => void act("set_plan")} disabled={busy}
            className="px-3 py-2 rounded-xl text-xs font-bold border border-violet-700/50 text-violet-300 hover:bg-violet-950/40 disabled:opacity-50">Cambiar plan</button>
        </div>
        {msg && <p className={`text-[11px] ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</p>}
      </div>
    </section>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold ${accent ?? "text-white"}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-zinc-500">{sub}</p>}
    </div>
  );
}

export default function NucleusPage() {
  const [m, setM] = useState<Metrics | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => fetch("/api/admin/metrics")
    .then(async (r) => {
      if (r.status === 403) throw new Error("Acceso restringido — solo el dueño.");
      if (r.status === 401) throw new Error("Inicia sesión para entrar.");
      if (!r.ok) throw new Error("No se pudieron cargar las métricas.");
      return r.json();
    })
    .then((d) => { setM(d as Metrics); setErr(null); })
    .catch((e) => setErr(e.message)), []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 30000); // refresco cada 30s
    return () => clearInterval(iv);
  }, [load]);

  if (err) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4 text-center">
        <span className="text-4xl mb-3">🔒</span>
        <h1 className="text-lg font-bold text-white">VYNAVO Nucleus</h1>
        <p className="text-sm text-zinc-400 mt-1">{err}</p>
        <Link href="/dashboard" className="mt-4 text-xs text-violet-400 hover:text-violet-300">← Volver al panel</Link>
      </div>
    );
  }
  if (!m) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500 text-sm">Cargando Nucleus…</div>;
  }

  const usd = (n: number) => `$${n.toFixed(n < 10 ? 3 : 2)}`;
  const num = (n: number) => n.toLocaleString("es");

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <div className="border-b border-zinc-800/80 px-5 py-5">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 grid place-items-center text-lg">🧬</div>
            <div>
              <h1 className="text-lg font-extrabold vy-grad-text leading-tight">VYNAVO Nucleus</h1>
              <p className="text-[11px] text-zinc-500 leading-tight">Centro de mando · solo dueño · refresco 30s</p>
            </div>
          </div>
          <Link href="/dashboard" className="text-xs text-zinc-400 hover:text-white">← Panel</Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-5 py-6 space-y-6">
        {/* HERO de negocio — lo primero que un fundador debe ver */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-violet-800/40 bg-gradient-to-br from-violet-950/50 to-zinc-900 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-300">MRR</p>
            <p className="mt-1 text-2xl font-extrabold text-white">{usd(m.revenue.mrr)}</p>
            <p className="text-[11px] text-zinc-500">ARR {usd(m.revenue.arr)}</p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Margen mes</p>
            <p className={`mt-1 text-2xl font-extrabold ${m.revenue.margin_month >= 0 ? "text-emerald-300" : "text-red-300"}`}>{usd(m.revenue.margin_month)}</p>
            <p className="text-[11px] text-zinc-500">ingresos − costo</p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Retención</p>
            <p className={`mt-1 text-2xl font-extrabold ${m.engagement.retention_pct >= 30 ? "text-emerald-300" : "text-amber-300"}`}>{m.engagement.retention_pct}%</p>
            <p className="text-[11px] text-zinc-500">{num(m.engagement.videos_per_user)} videos/usuario</p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Usuarios de pago</p>
            <p className="mt-1 text-2xl font-extrabold text-sky-300">{num(m.users.paying)}<span className="text-sm text-zinc-500">/{num(m.users.total)}</span></p>
            <p className="text-[11px] text-zinc-500">{m.users.total ? Math.round(m.users.paying / m.users.total * 100) : 0}% conversión</p>
          </div>
        </section>

        {/* Gráfico de tendencia 14 días */}
        <TrendChart series={m.series} />

        {/* Usuarios */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-600 mb-2">Usuarios</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Stat label="Total" value={num(m.users.total)} accent="text-sky-300" />
            <Stat label="Hoy" value={`+${num(m.users.today)}`} accent="text-emerald-300" />
            <Stat label="7 días" value={`+${num(m.users.week)}`} />
            <Stat label="Mes" value={`+${num(m.users.month)}`} />
            <Stat label="De pago" value={num(m.users.paying)} sub={`${m.users.total ? Math.round(m.users.paying / m.users.total * 100) : 0}% conversión`} accent="text-violet-300" />
          </div>
        </section>

        {/* Producción */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-600 mb-2">Producción</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Stat label="Proyectos" value={num(m.videos.projects)} />
            <Stat label="Terminados" value={num(m.videos.finished)} accent="text-emerald-300" />
            <Stat label="Hoy" value={num(m.videos.today)} accent="text-pink-300" />
            <Stat label="7 días" value={num(m.videos.week)} />
            <Stat label="Fallidos" value={num(m.videos.failed)} accent={m.videos.failed > 0 ? "text-amber-300" : "text-white"} />
          </div>
        </section>

        {/* Dinero */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-600 mb-2">Costo (estimado) · Créditos</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Stat label="Gasto hoy" value={usd(m.cost.today)} accent="text-red-300" />
            <Stat label="Gasto mes" value={usd(m.cost.month)} accent="text-red-300" />
            <Stat label="Gasto total" value={usd(m.cost.all)} />
            <Stat label="NAVOS en circulación" value={num(m.navos.in_circulation)} accent="text-violet-300" />
            <Stat label="NAVOS gastados" value={num(m.navos.spent)} />
          </div>
        </section>

        {/* Retención & Viralidad */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-600 mb-2">Retención & Viralidad</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Stat label="Activos 7d" value={num(m.engagement.active_7d)} accent="text-emerald-300" sub="crearon esta semana" />
            <Stat label="Vuelven" value={num(m.engagement.returning_users)} accent="text-sky-300" sub="2+ días distintos" />
            <Stat label="Retención" value={`${m.engagement.retention_pct}%`} accent={m.engagement.retention_pct >= 30 ? "text-emerald-300" : "text-amber-300"} sub="de usuarios regresa" />
            <Stat label="Videos/usuario" value={String(m.engagement.videos_per_user)} accent="text-violet-300" sub="promedio" />
            <Stat label="Terminan" value={`${m.engagement.completion_rate}%`} sub="proyectos → video" />
          </div>
          {m.top_creators.length > 0 && (
            <div className="mt-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 divide-y divide-zinc-800/70">
              <p className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-600">🏆 Top creadores (tus fans — entrevístalos)</p>
              {m.top_creators.map((c, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-zinc-300 truncate">{i === 0 ? "👑 " : ""}{c.email}</span>
                  <span className="font-bold text-violet-300 shrink-0">{num(c.videos)} videos</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Desgloses */}
        <div className="grid md:grid-cols-2 gap-6">
          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-600 mb-2">Costo por proveedor</h2>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 divide-y divide-zinc-800/70">
              {m.cost_by_provider.length === 0 && <p className="p-4 text-xs text-zinc-600">Sin datos aún</p>}
              {m.cost_by_provider.map((p) => (
                <div key={p.provider} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="capitalize text-zinc-300">{p.provider}</span>
                  <span className="flex items-center gap-3">
                    <span className="text-[11px] text-zinc-600">{num(p.n)} llamadas</span>
                    <span className="font-bold text-red-300">{usd(p.usd)}</span>
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-600 mb-2">Planes · Nichos top</h2>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                {m.by_plan.map((p) => (
                  <span key={p.plan} className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-violet-950/50 border border-violet-800/40 text-violet-200 capitalize">{p.plan}: {p.n}</span>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 pt-2 border-t border-zinc-800/60">
                {m.by_niche.map((p) => (
                  <span key={String(p.niche)} className="text-[11px] px-2.5 py-1 rounded-full bg-zinc-800/60 text-zinc-300 capitalize">{String(p.niche)}: {p.n}</span>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* Control de usuarios (dar NAVOS / cambiar plan) */}
        <UserControl onDone={load} />

        {/* Usuarios recientes */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-600 mb-2">Usuarios recientes</h2>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 divide-y divide-zinc-800/70 overflow-hidden">
            {m.recent_users.map((u, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-zinc-300 truncate">{u.email}</span>
                <span className="flex items-center gap-3 shrink-0">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 capitalize">{u.plan}</span>
                  <span className="text-[11px] text-violet-300">{num(u.credits)} ⚡</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <p className="text-center text-[10px] text-zinc-700">Actualizado {new Date(m.generated_at).toLocaleTimeString("es")}</p>
      </div>
    </div>
  );
}
