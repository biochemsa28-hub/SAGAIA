"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Command bar universal (Ctrl+K / Cmd+K). Todo lo que hoy exige ir con el mouse
// hasta la sidebar — o peor, hasta el wizard y elegir nicho — queda a un atajo
// y dos teclas. No agrega superficies nuevas: solo rutas que ya existen, con
// los parámetros que el wizard ya sabe leer.
type Accion = { id: string; titulo: string; sub?: string; icono: string; ruta: string; claves: string };

const ACCIONES: Accion[] = [
  { id: "nueva", titulo: "Nueva historia", sub: "abrir el wizard", icono: "🎬", ruta: "/dashboard/projects/new", claves: "nueva historia crear video wizard" },
  { id: "terror", titulo: "Nueva historia de Terror", sub: "nicho y tono listos", icono: "😱", ruta: "/dashboard/projects/new?niche=terror&tone=horror", claves: "terror horror miedo" },
  { id: "romance", titulo: "Nueva historia de Romance", sub: "nicho y tono listos", icono: "💔", ruta: "/dashboard/projects/new?niche=romance&tone=romance", claves: "romance amor drama" },
  { id: "misterio", titulo: "Nueva historia de Misterio", sub: "nicho y tono listos", icono: "🔍", ruta: "/dashboard/projects/new?niche=misterio&tone=mystery", claves: "misterio thriller intriga" },
  { id: "chisme", titulo: "Nueva historia de Chisme", sub: "confesional y viral", icono: "🤫", ruta: "/dashboard/projects/new?niche=romance&tone=chisme", claves: "chisme secreto confesion viral" },
  { id: "anuncio", titulo: "Nuevo anuncio UGC", sub: "video con tu producto", icono: "📢", ruta: "/dashboard/ads/new", claves: "anuncio ugc producto publicidad" },
  { id: "dashboard", titulo: "Dashboard", icono: "🏠", ruta: "/dashboard", claves: "dashboard inicio centro" },
  { id: "personajes", titulo: "Personajes", sub: "tu elenco recurrente", icono: "🎭", ruta: "/dashboard/characters", claves: "personajes elenco caras actores" },
  { id: "biblioteca", titulo: "Biblioteca", sub: "tus videos creados", icono: "📚", ruta: "/dashboard/library", claves: "biblioteca videos creaciones descargas" },
  { id: "batch", titulo: "Producción en serie", icono: "⚡", ruta: "/dashboard/batch", claves: "batch serie masivo lote" },
  { id: "config", titulo: "Configuración", icono: "⚙️", ruta: "/dashboard/settings", claves: "configuracion cuenta ajustes plan" },
  { id: "navos", titulo: "Recargar NAVOS", sub: "planes y precios", icono: "💎", ruta: "/pricing", claves: "navos creditos recargar precios plan comprar" },
];

export function CommandBar() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAbierto(a => !a); setQ(""); setSel(0);
      } else if (e.key === "Escape") {
        setAbierto(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => { if (abierto) inputRef.current?.focus(); }, [abierto]);

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return ACCIONES;
    return ACCIONES.filter(a => (a.titulo + " " + (a.sub ?? "") + " " + a.claves).toLowerCase().includes(t));
  }, [q]);

  if (!abierto) return null;

  const ir = (a: Accion) => { setAbierto(false); router.push(a.ruta); };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[18vh] bg-black/60 backdrop-blur-sm p-4"
      onClick={() => setAbierto(false)}>
      <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={q}
          onChange={e => { setQ(e.target.value); setSel(0); }}
          onKeyDown={e => {
            if (e.key === "ArrowDown") { e.preventDefault(); setSel(s => Math.min(s + 1, visibles.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
            else if (e.key === "Enter" && visibles[sel]) ir(visibles[sel]);
          }}
          placeholder="¿Qué quieres hacer? (escribe para filtrar)"
          className="w-full bg-transparent px-4 py-3.5 text-sm text-white placeholder-zinc-500 focus:outline-none border-b border-zinc-800"
        />
        <div className="max-h-[46vh] overflow-y-auto py-1.5">
          {visibles.length === 0 && <p className="px-4 py-3 text-xs text-zinc-600">Nada con “{q}”.</p>}
          {visibles.map((a, i) => (
            <button
              key={a.id}
              onClick={() => ir(a)}
              onMouseEnter={() => setSel(i)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                i === sel ? "bg-violet-600/20 text-white" : "text-zinc-300"
              }`}
            >
              <span className="text-lg shrink-0">{a.icono}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold truncate">{a.titulo}</span>
                {a.sub && <span className="block text-[11px] text-zinc-500 truncate">{a.sub}</span>}
              </span>
              {i === sel && <span className="text-[10px] text-zinc-500 font-mono shrink-0">↵</span>}
            </button>
          ))}
        </div>
        <p className="px-4 py-2 text-[10px] text-zinc-600 border-t border-zinc-800">↑↓ navegar · Enter abrir · Esc cerrar</p>
      </div>
    </div>
  );
}
