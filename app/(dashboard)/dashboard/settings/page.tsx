"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Eye, EyeOff, CheckCircle, AlertCircle, Loader2,
  User, Shield, Zap, LogOut,
} from "lucide-react";
import { signOut } from "next-auth/react";
import Link from "next/link";

interface Settings {
  name: string | null;
  email: string;
  plan: string;
  credits: number;
}

function FieldMsg({ msg }: { msg: { type: "success" | "error"; text: string } | null }) {
  if (!msg) return null;
  return (
    <p className={`text-xs mt-1.5 flex items-center gap-1 ${msg.type === "success" ? "text-emerald-400" : "text-red-400"}`}>
      {msg.type === "success" ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
      {msg.text}
    </p>
  );
}

const PLAN_LABELS: Record<string, { label: string; color: string }> = {
  free:    { label: "Gratuito",  color: "text-zinc-400 bg-zinc-800 border-zinc-700"           },
  starter: { label: "Starter",   color: "text-blue-400 bg-blue-600/10 border-blue-700/30"      },
  pro:     { label: "Pro",       color: "text-violet-400 bg-violet-600/10 border-violet-700/30" },
  studio:  { label: "Studio",    color: "text-pink-400 bg-pink-600/10 border-pink-700/30"       },
};

export default function SettingsPage() {
  const { data: session, update: updateSession } = useSession();
  const router = useRouter();

  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    fetch("/api/settings").then(r => r.json()).then((d: Settings) => setSettings(d)).catch(() => null);
  }, []);

  // ── Profile ──────────────────────────────────────────────────────────────────
  const [name, setName] = useState<string | null>(null);
  const displayName = name ?? settings?.name ?? "";
  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  async function saveProfile() {
    setSavingProfile(true); setProfileMsg(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "profile", name: displayName }),
      });
      const d = await res.json() as { message?: string; error?: string };
      if (res.ok) {
        setProfileMsg({ type: "success", text: "Nombre actualizado" });
        await updateSession({ name });
      } else {
        setProfileMsg({ type: "error", text: d.error ?? "Error al guardar" });
      }
    } finally { setSavingProfile(false); }
  }

  // ── Password ─────────────────────────────────────────────────────────────────
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [showPwds, setShowPwds] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [savingPwd, setSavingPwd] = useState(false);

  async function savePassword() {
    if (newPwd.length < 8) { setPwdMsg({ type: "error", text: "Mínimo 8 caracteres" }); return; }
    setSavingPwd(true); setPwdMsg(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "password", current_password: currentPwd, new_password: newPwd }),
      });
      const d = await res.json() as { message?: string; error?: string };
      if (res.ok) {
        setPwdMsg({ type: "success", text: "Contraseña actualizada correctamente" });
        setCurrentPwd(""); setNewPwd("");
      } else {
        setPwdMsg({ type: "error", text: d.error ?? "Contraseña actual incorrecta" });
      }
    } finally { setSavingPwd(false); }
  }

  const planInfo = PLAN_LABELS[settings?.plan ?? "free"] ?? PLAN_LABELS.free!;

  return (
    <>
      <TopBar title="Mi cuenta" subtitle="Perfil y seguridad" />
      <div className="max-w-xl mx-auto p-6 space-y-5">

        {/* ── Plan & credits ───────────────────────────────────────────────────── */}
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center gap-4 p-5">
            {/* Avatar */}
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center shrink-0 shadow-lg shadow-violet-900/30">
              <span className="text-lg font-bold text-white">
                {displayName.slice(0, 2).toUpperCase() || (session?.user?.name ?? "U").slice(0, 2).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-white truncate">
                {settings?.name ?? session?.user?.name ?? "Usuario"}
              </p>
              <p className="text-xs text-zinc-400 truncate mb-2">
                {settings?.email ?? session?.user?.email}
              </p>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${planInfo.color}`}>
                  {planInfo.label}
                </span>
                <span className="flex items-center gap-1 text-xs text-zinc-400">
                  <Zap className="w-3 h-3 text-violet-400" />
                  {settings?.credits ?? 0} crédito{(settings?.credits ?? 0) !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          </div>
          <div className="border-t border-zinc-800 px-5 py-3 bg-zinc-900/40 flex items-center justify-between">
            <p className="text-xs text-zinc-500">¿Necesitas más créditos?</p>
            <Link
              href="/pricing"
              className="text-xs font-semibold text-violet-400 hover:text-violet-300 transition-colors flex items-center gap-1"
            >
              <Zap className="w-3 h-3" /> Ver planes →
            </Link>
          </div>
        </Card>

        {/* ── Nombre ──────────────────────────────────────────────────────────── */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <User className="w-4 h-4 text-violet-400" />
            <h3 className="text-sm font-semibold text-white">Perfil</h3>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Tu nombre</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setName(e.target.value)}
                placeholder="Cómo quieres que te llamemos"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Email</label>
              <input
                type="email"
                value={settings?.email ?? session?.user?.email ?? ""}
                disabled
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-500 cursor-not-allowed"
              />
            </div>
            <FieldMsg msg={profileMsg} />
            <Button onClick={saveProfile} disabled={savingProfile} size="sm">
              {savingProfile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Guardar cambios
            </Button>
          </div>
        </Card>

        {/* ── Password ────────────────────────────────────────────────────────── */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-4 h-4 text-violet-400" />
            <h3 className="text-sm font-semibold text-white">Contraseña</h3>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Contraseña actual</label>
              <div className="relative">
                <input
                  type={showPwds ? "text" : "password"}
                  value={currentPwd}
                  onChange={(e) => setCurrentPwd(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 pr-10 text-sm text-white focus:outline-none focus:border-violet-500 transition-colors"
                  placeholder="••••••••"
                />
                <button type="button" onClick={() => setShowPwds(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                  {showPwds ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Nueva contraseña</label>
              <input
                type={showPwds ? "text" : "password"}
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500 transition-colors"
                placeholder="Mínimo 8 caracteres"
              />
            </div>
            <FieldMsg msg={pwdMsg} />
            <Button onClick={savePassword} disabled={savingPwd || !currentPwd || !newPwd} size="sm">
              {savingPwd ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5" />}
              Cambiar contraseña
            </Button>
          </div>
        </Card>

        {/* ── Cerrar sesión ────────────────────────────────────────────────────── */}
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-800 text-zinc-400 hover:text-white text-sm font-medium transition-all"
        >
          <LogOut className="w-4 h-4" />
          Cerrar sesión
        </button>

      </div>
    </>
  );
}
