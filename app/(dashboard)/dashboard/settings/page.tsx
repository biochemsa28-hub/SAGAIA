"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { TopBar } from "@/components/layout/TopBar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Eye, EyeOff, CheckCircle, AlertCircle, Loader2,
  User, KeyRound, Zap, Shield,
} from "lucide-react";

interface Settings {
  name: string | null;
  email: string;
  plan: string;
  credits: number;
  has_openai_key: boolean;
  has_eleven_key: boolean;
}

interface MaskedKeys {
  openai_key_masked: string | null;
  eleven_key_masked: string | null;
}

function Section({ title, icon: Icon, children }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-center gap-2 mb-5">
        <Icon className="w-4 h-4 text-violet-400" />
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      {children}
    </Card>
  );
}

function StatusChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${
      ok ? "text-emerald-400 bg-emerald-500/10 border-emerald-700/30" : "text-zinc-500 bg-zinc-800 border-zinc-700"
    }`}>
      {ok ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
      {label}
    </span>
  );
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

export default function SettingsPage() {
  const { data: session, update: updateSession } = useSession();

  // ── Load settings ────────────────────────────────────────────────────────────
  const [settings, setSettings] = useState<Settings | null>(null);
  const [masked, setMasked] = useState<MaskedKeys>({ openai_key_masked: null, eleven_key_masked: null });

  useEffect(() => {
    fetch("/api/settings").then(r => r.json()).then((d: Settings) => setSettings(d)).catch(() => null);
    fetch("/api/settings", { method: "PUT" }).then(r => r.json()).then((d: MaskedKeys) => setMasked(d)).catch(() => null);
  }, []);

  // ── Profile ──────────────────────────────────────────────────────────────────
  // null = not yet edited by user → fall back to settings.name
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
        setProfileMsg({ type: "success", text: d.message ?? "Guardado" });
        await updateSession({ name });
      } else {
        setProfileMsg({ type: "error", text: d.error ?? "Error" });
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
        setPwdMsg({ type: "success", text: d.message ?? "Contraseña actualizada" });
        setCurrentPwd(""); setNewPwd("");
      } else {
        setPwdMsg({ type: "error", text: d.error ?? "Error" });
      }
    } finally { setSavingPwd(false); }
  }

  // ── API Keys ─────────────────────────────────────────────────────────────────
  const [openaiKey, setOpenaiKey] = useState("");
  const [elevenKey, setElevenKey] = useState("");
  const [showOpenai, setShowOpenai] = useState(false);
  const [showEleven, setShowEleven] = useState(false);
  const [keysMsg, setKeysMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [savingKeys, setSavingKeys] = useState(false);

  async function saveKeys() {
    setSavingKeys(true); setKeysMsg(null);
    try {
      const body: Record<string, string> = { action: "api_keys" };
      if (openaiKey) body["openai_key"] = openaiKey;
      if (elevenKey) body["eleven_key"] = elevenKey;

      const res = await fetch("/api/settings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json() as { message?: string; error?: string };
      if (res.ok) {
        setKeysMsg({ type: "success", text: d.message ?? "Claves guardadas" });
        // Refresh masked display
        const m = await fetch("/api/settings", { method: "PUT" });
        setMasked(await m.json() as MaskedKeys);
        // Refresh settings flags
        const s = await fetch("/api/settings");
        setSettings(await s.json() as Settings);
        setOpenaiKey(""); setElevenKey("");
      } else {
        setKeysMsg({ type: "error", text: d.error ?? "Error" });
      }
    } finally { setSavingKeys(false); }
  }

  async function removeKey(key: "openai" | "eleven") {
    await fetch("/api/settings", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "api_keys", [`${key}_key`]: "" }),
    });
    const [m, s] = await Promise.all([
      fetch("/api/settings", { method: "PUT" }).then(r => r.json()),
      fetch("/api/settings").then(r => r.json()),
    ]);
    setMasked(m as MaskedKeys);
    setSettings(s as Settings);
  }

  return (
    <>
      <TopBar title="Configuración" subtitle="Cuenta, seguridad y API Keys" />
      <div className="max-w-2xl mx-auto p-6 space-y-6">

        {/* Account info */}
        <Section title="Cuenta" icon={User}>
          <div className="flex items-center gap-4 mb-5 p-4 bg-zinc-800/50 rounded-xl">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center shrink-0">
              <span className="text-base font-bold text-white">
                {displayName.slice(0, 2).toUpperCase() || "U"}
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{settings?.name ?? session?.user?.name}</p>
              <p className="text-xs text-zinc-400">{settings?.email ?? session?.user?.email}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs bg-violet-600/20 text-violet-300 border border-violet-700/30 rounded-full px-2 py-0.5 capitalize">
                  {settings?.plan ?? "free"}
                </span>
                <span className="text-xs text-zinc-500">{settings?.credits ?? 0} créditos</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Nombre</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>
            <FieldMsg msg={profileMsg} />
            <Button onClick={saveProfile} disabled={savingProfile} size="sm">
              {savingProfile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Guardar nombre
            </Button>
          </div>
        </Section>

        {/* Password */}
        <Section title="Seguridad" icon={Shield}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">Contraseña actual</label>
              <div className="relative">
                <input
                  type={showPwds ? "text" : "password"}
                  value={currentPwd}
                  onChange={(e) => setCurrentPwd(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 pr-10 text-sm text-white focus:outline-none focus:border-violet-500 transition-colors"
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
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 transition-colors"
                placeholder="Mínimo 8 caracteres"
              />
            </div>
            <FieldMsg msg={pwdMsg} />
            <Button onClick={savePassword} disabled={savingPwd || !currentPwd || !newPwd} size="sm">
              {savingPwd ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
              Cambiar contraseña
            </Button>
          </div>
        </Section>

        {/* API Keys */}
        <Section title="API Keys" icon={Zap}>
          <p className="text-xs text-zinc-500 mb-5">
            Las claves se cifran con AES-256-GCM antes de guardarse. Nunca se muestran en texto plano.
          </p>

          {/* OpenAI */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-zinc-300">OpenAI API Key</label>
              <StatusChip ok={settings?.has_openai_key ?? false} label={settings?.has_openai_key ? "Configurada" : "Sin configurar"} />
            </div>
            {masked.openai_key_masked && (
              <div className="flex items-center justify-between bg-zinc-800/60 rounded-lg px-3 py-2 mb-2">
                <span className="text-xs font-mono text-zinc-300">{masked.openai_key_masked}</span>
                <button onClick={() => removeKey("openai")} className="text-xs text-red-400 hover:text-red-300">Eliminar</button>
              </div>
            )}
            <div className="relative">
              <input
                type={showOpenai ? "text" : "password"}
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                placeholder={settings?.has_openai_key ? "Nueva key (deja vacío para mantener)" : "sk-proj-..."}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 pr-10 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
              />
              <button type="button" onClick={() => setShowOpenai(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                {showOpenai ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-zinc-600 mt-1">
              Para generar historias con GPT-4o ·{" "}
              <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className="text-violet-400 hover:underline">
                platform.openai.com →
              </a>
            </p>
          </div>

          {/* ElevenLabs */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-zinc-300">ElevenLabs API Key</label>
              <StatusChip ok={settings?.has_eleven_key ?? false} label={settings?.has_eleven_key ? "Configurada" : "Sin configurar"} />
            </div>
            {masked.eleven_key_masked && (
              <div className="flex items-center justify-between bg-zinc-800/60 rounded-lg px-3 py-2 mb-2">
                <span className="text-xs font-mono text-zinc-300">{masked.eleven_key_masked}</span>
                <button onClick={() => removeKey("eleven")} className="text-xs text-red-400 hover:text-red-300">Eliminar</button>
              </div>
            )}
            <div className="relative">
              <input
                type={showEleven ? "text" : "password"}
                value={elevenKey}
                onChange={(e) => setElevenKey(e.target.value)}
                placeholder={settings?.has_eleven_key ? "Nueva key (deja vacío para mantener)" : "dd0bffe5..."}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 pr-10 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
              />
              <button type="button" onClick={() => setShowEleven(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                {showEleven ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-zinc-600 mt-1">
              Para generar voz en off ·{" "}
              <a href="https://elevenlabs.io" target="_blank" rel="noreferrer" className="text-violet-400 hover:underline">
                elevenlabs.io →
              </a>
            </p>
          </div>

          <FieldMsg msg={keysMsg} />
          <Button onClick={saveKeys} disabled={savingKeys || (!openaiKey && !elevenKey)} size="sm" className="mt-1">
            {savingKeys ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            Guardar claves
          </Button>
        </Section>

        {/* System status */}
        <Section title="Estado del sistema" icon={CheckCircle}>
          <div className="space-y-2">
            {[
              { label: "Generación de historias", ok: settings?.has_openai_key ?? false, note: settings?.has_openai_key ? "OpenAI conectado" : "Modo mock activo" },
              { label: "Voz en off",               ok: settings?.has_eleven_key ?? false, note: settings?.has_eleven_key ? "ElevenLabs conectado" : "Modo mock activo" },
              { label: "Base de datos",             ok: true, note: "SQLite local" },
              { label: "Autenticación",             ok: true, note: "NextAuth JWT" },
            ].map(({ label, ok, note }) => (
              <div key={label} className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/40">
                {ok
                  ? <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                  : <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />}
                <span className="text-sm text-zinc-300 flex-1">{label}</span>
                <span className="text-xs text-zinc-500">{note}</span>
              </div>
            ))}
          </div>
        </Section>

      </div>
    </>
  );
}
