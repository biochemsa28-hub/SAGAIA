"use client";

import { useEffect, useState } from "react";
import Thumb from "@/components/thumb";
import { Users, Trash2, Sparkles, Plus, Loader2, Check, X } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { NICHOS } from "@/lib/constants/nichos";

interface Character {
  id: string;
  name: string;
  description: string;
  archetype: string | null;
  voice_style: string | null;
  reference_image_url: string | null;
  niche: string | null;
}

export default function CharactersPage() {
  const { toast } = useToast();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      const r = await fetch("/api/characters");
      const d = await r.json() as { characters?: Character[] };
      setCharacters(d.characters ?? []);
    } catch {
      setCharacters([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function remove(id: string) {
    if (!confirm("¿Eliminar este personaje? Las historias ya creadas no se ven afectadas.")) return;
    const r = await fetch(`/api/characters/${id}`, { method: "DELETE" });
    if (r.ok) {
      setCharacters((cs) => cs.filter((c) => c.id !== id));
      toast("Personaje eliminado", "info");
    } else {
      toast("No se pudo eliminar", "error");
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-600/20 grid place-items-center">
            <Users className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Mis personajes</h1>
            <p className="text-sm text-zinc-400">Diseña un personaje una vez y reúsalo en todas tus historias.</p>
          </div>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold"
        >
          <Plus className="w-4 h-4" /> Crear personaje
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => <div key={i} className="aspect-[3/4] rounded-2xl bg-zinc-900/60 animate-pulse" />)}
        </div>
      ) : characters.length === 0 ? (
        <div className="text-center border border-dashed border-zinc-800 rounded-2xl p-10">
          <Sparkles className="w-8 h-8 text-violet-400 mx-auto mb-3" />
          <p className="text-white font-semibold">Aún no tienes personajes</p>
          <p className="text-sm text-zinc-400 mt-1 max-w-md mx-auto">
            Crea uno: descríbelo, genera 4 opciones con IA, elige la que más te guste y reúsalo en todas tus historias.
          </p>
          <button onClick={() => setCreating(true)} className="inline-flex items-center gap-2 mt-5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold">
            <Plus className="w-4 h-4" /> Crear mi primer personaje
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {characters.map((c) => (
            <div key={c.id} className="rounded-2xl overflow-hidden bg-zinc-900/60 border border-zinc-800 group">
              <div className="aspect-[3/4] bg-zinc-950 relative">
                {c.reference_image_url ? (
                  <Thumb src={c.reference_image_url} alt={c.name} sizes="(max-width: 768px) 50vw, 33vw" className="object-cover" />
                ) : (
                  <div className="w-full h-full grid place-items-center text-zinc-600"><Users className="w-8 h-8" /></div>
                )}
                <button onClick={() => remove(c.id)} className="absolute top-2 right-2 p-2 rounded-lg bg-black/60 text-red-300 opacity-0 group-hover:opacity-100 transition" aria-label="Eliminar">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="p-3">
                <p className="text-white font-semibold text-sm truncate">{c.name}</p>
                <p className="text-xs text-zinc-400 line-clamp-2 mt-0.5">{c.description}</p>
                {c.niche && (
                  <span className="inline-block mt-2 text-[10px] uppercase tracking-wide text-violet-300 bg-violet-600/15 px-2 py-0.5 rounded">{c.niche}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <CreateCharacterModal
          onClose={() => setCreating(false)}
          onSaved={(c) => { setCharacters((cs) => [c, ...cs]); setCreating(false); toast(`⭐ "${c.name}" guardado`, "success"); }}
        />
      )}
    </div>
  );
}

function CreateCharacterModal({ onClose, onSaved }: { onClose: () => void; onSaved: (c: Character) => void }) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [niche, setNiche] = useState("");
  const [options, setOptions] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  async function generate() {
    if (description.trim().length < 3) { toast("Describe tu personaje primero", "error"); return; }
    setGenerating(true);
    setOptions([]);
    setSelected(null);
    try {
      const r = await fetch("/api/characters/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, niche: niche || undefined }),
      });
      const d = await r.json() as { options?: string[]; error?: string };
      if (!r.ok || !d.options?.length) throw new Error(d.error ?? "No se pudieron generar opciones");
      setOptions(d.options);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error al generar", "error");
    } finally {
      setGenerating(false);
    }
  }

  async function save() {
    if (!selected) { toast("Elige una opción", "error"); return; }
    if (!name.trim()) { toast("Ponle un nombre", "error"); return; }
    setSaving(true);
    try {
      const r = await fetch("/api/characters", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, reference_image_url: selected, niche: niche || undefined }),
      });
      const d = await r.json() as { character?: Character; error?: string };
      if (!r.ok || !d.character) throw new Error(d.error ?? "No se pudo guardar");
      onSaved(d.character);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error al guardar", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Crear personaje</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400"><X className="w-4 h-4" /></button>
        </div>

        <label className="block text-xs font-bold text-zinc-400 mb-1.5">Nombre</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Lucía la detective"
          className="w-full mb-4 px-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-sm focus:border-violet-600 outline-none" />

        <label className="block text-xs font-bold text-zinc-400 mb-1.5">Descripción física</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
          placeholder="Mujer de 35 años, cabello negro corto, gabardina roja, mirada intensa, estilo noir"
          className="w-full mb-4 px-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-sm focus:border-violet-600 outline-none resize-none" />

        <label className="block text-xs font-bold text-zinc-400 mb-1.5">Nicho (opcional)</label>
        <select value={niche} onChange={(e) => setNiche(e.target.value)}
          className="w-full mb-4 px-3 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-sm focus:border-violet-600 outline-none">
          <option value="">Sin nicho</option>
          {NICHOS.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
        </select>

        <button onClick={generate} disabled={generating}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white text-sm font-semibold mb-4">
          {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generando 4 opciones…</> : <><Sparkles className="w-4 h-4" /> Generar 4 opciones</>}
        </button>

        {generating && (
          <div className="grid grid-cols-4 gap-2">
            {[0, 1, 2, 3].map((i) => <div key={i} className="aspect-[3/4] rounded-xl bg-zinc-800 animate-pulse" />)}
          </div>
        )}

        {options.length > 0 && (
          <>
            <p className="text-xs font-bold text-zinc-400 mb-2">Elige tu favorita</p>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {options.map((url) => (
                <button key={url} onClick={() => setSelected(url)}
                  className={`relative aspect-[3/4] rounded-xl overflow-hidden border-2 transition ${selected === url ? "border-violet-500" : "border-transparent hover:border-zinc-600"}`}>
                  <Thumb src={url} alt="opción" sizes="25vw" className="object-cover" />
                  {selected === url && (
                    <div className="absolute inset-0 bg-violet-600/30 grid place-items-center">
                      <div className="w-7 h-7 rounded-full bg-violet-500 grid place-items-center"><Check className="w-4 h-4 text-white" /></div>
                    </div>
                  )}
                </button>
              ))}
            </div>
            <button onClick={save} disabled={saving || !selected}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando…</> : <><Check className="w-4 h-4" /> Guardar este personaje</>}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
