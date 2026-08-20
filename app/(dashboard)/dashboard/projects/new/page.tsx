"use client";
import { mensajeLegible } from "@/lib/json-seguro";
import { useState, useEffect, useRef, Suspense } from "react";
import { TOPIC_MAX } from "@/lib/validators/story.schema";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import confetti from "canvas-confetti";
import {
  NICHOS, TONES, DURATION_OPTIONS, VISUAL_STYLES, PLATFORMS,
} from "@/lib/constants/nichos";
import {
  Sparkles, CheckCircle, AlertCircle, ArrowRight, ArrowLeft,
  Zap, RefreshCw, TrendingUp, Flame, Loader2, Users,
} from "lucide-react";
import type { StoryOutput } from "@/lib/validators/story.schema";
import type { HookVariant } from "@/app/api/generate/hooks/route";
import { CREDIT_COST_BY_TIER, videoSecondsFor, BORRADOR_NAVOS, NAVOS_PER_USD } from "@/lib/config";

// "12.240 NAVOS" no le dice nada a quien acaba de llegar; "≈ US$12" sí. Se
// muestran los dos: el NAVO es lo que se descuenta, el dólar es lo que se
// entiende. Nunca el dólar solo — el saldo del usuario está en NAVOS.
const precioLegible = (navos: number) =>
  `${navos.toLocaleString("es")} NAVOS · ≈ US$${(navos / NAVOS_PER_USD).toFixed(navos / NAVOS_PER_USD < 10 ? 1 : 0)}`;

// Los segundos que la etiqueta PROMETE. Si videoSecondsFor devuelve menos, es
// que el tope de producción la recorta y la opción no se ofrece.
const segundosDe = (id: string) => Number(id.replace(/[^0-9]/g, "")) || 60;
import { CinematicLoader } from "@/components/ui/CinematicLoader";

interface CastCharacterOption {
  name: string;
  role: string;
  gender: string;
  age: string;
  kind: string;
  personality: string;
  visual_description: string;
  voice_profile: string;
  options: string[];
  selectedIdx: number;
}

const VOICE_PROFILE_LABELS: Record<string, string> = {
  male_young: "Hombre joven", male_adult: "Hombre adulto", male_elderly: "Hombre mayor",
  male_villain: "Villano", female_young: "Mujer joven", female_adult: "Mujer adulta",
  female_elderly: "Mujer mayor", child: "Niño/a", narrator: "Narrador", creature: "Criatura",
};

// ─── Per-nicho color themes ────────────────────────────────────────────────────
const NICHO_THEME: Record<string, {
  card: string; border: string; selected: string; accent: string;
  glow: string; pill: string; emoji: string; tagline: string; bar: string;
}> = {
  terror:       { card: "from-red-950/80 to-zinc-950",    border: "border-red-900/50",     selected: "border-red-500 shadow-red-900/60",   accent: "text-red-400",     glow: "shadow-red-900/50",    pill: "bg-red-950/60 border-red-800/50 text-red-300",    emoji: "😱", tagline: "Miedo que no se olvida",        bar: "bg-red-600" },
  romance:      { card: "from-rose-950/80 to-zinc-950",   border: "border-rose-900/50",    selected: "border-rose-400 shadow-rose-900/60",  accent: "text-rose-400",    glow: "shadow-rose-900/50",   pill: "bg-rose-950/60 border-rose-800/50 text-rose-300",  emoji: "💔", tagline: "Amor que duele y enamora",      bar: "bg-rose-500" },
  misterio:     { card: "from-blue-950/80 to-zinc-950",   border: "border-blue-900/50",    selected: "border-blue-400 shadow-blue-900/60",  accent: "text-blue-400",    glow: "shadow-blue-900/50",   pill: "bg-blue-950/60 border-blue-800/50 text-blue-300",  emoji: "🔍", tagline: "Preguntas sin respuesta",       bar: "bg-blue-500" },
  inspiracional: { card: "from-emerald-950/70 to-zinc-950", border: "border-emerald-900/50", selected: "border-emerald-400 shadow-emerald-900/60", accent: "text-emerald-400", glow: "shadow-emerald-900/50", pill: "bg-emerald-950/60 border-emerald-800/50 text-emerald-300", emoji: "💪", tagline: "Historias que cambian vidas", bar: "bg-emerald-500" },
  fantasia:     { card: "from-violet-950/80 to-zinc-950", border: "border-violet-900/50",  selected: "border-violet-400 shadow-violet-900/60", accent: "text-violet-400", glow: "shadow-violet-900/50", pill: "bg-violet-950/60 border-violet-800/50 text-violet-300", emoji: "✨", tagline: "Mundos imposibles, reales",    bar: "bg-violet-500" },
  historia:     { card: "from-amber-950/70 to-zinc-950",  border: "border-amber-900/50",   selected: "border-amber-400 shadow-amber-900/60",  accent: "text-amber-400",   glow: "shadow-amber-900/50",  pill: "bg-amber-950/60 border-amber-800/50 text-amber-300",  emoji: "📜", tagline: "Verdades más raras que la ficción", bar: "bg-amber-500" },
};
const DEFAULT_THEME = NICHO_THEME.fantasia!;

// Ideas de arranque por nicho. Se muestran TRES por vez, rotando.
//
// Estaban escritas como sinopsis —"Una mujer descubre que su marido tiene una
// segunda familia"— que es exactamente la fórmula que el sugeridor con IA tiene
// PROHIBIDA. Una sinopsis dice de qué trata la historia; no dice qué se ve en el
// primer segundo, que es lo único que decide si alguien se queda.
//
// Reescritas con la misma regla que el resto del sistema:
//   1. ARRANCAN POR LA IMAGEN, no por el resumen.
//   2. TRAEN UN MOMENTO FÍSICO fotografiable. Si el clímax es "él la mira con
//      desprecio" no hay cuadro destino que dibujar y el video sale como gente
//      hablando.
//   3. Son cotidianas y concretas: objetos y lugares reales, no conceptos.
//
// Y ahora hay OCHO por nicho en vez de cinco, porque la interfaz mostraba
// siempre las tres primeras: la lista podía tener cinco y el usuario veía tres,
// las mismas, para siempre. Con ocho y una ventana que rota, hay material.
const QUICK_IDEAS: Record<string, string[]> = {
  terror: [
    "El monitor del bebé se enciende solo y se oye una voz de mujer cantando; ella está sola en la casa y corre hasta la cuna",
    "Una cámara de seguridad la graba durmiendo desde adentro de su cuarto, y en el video hay una mano que aparta su pelo",
    "Su hija dibuja el mismo hombre alto cada noche; cuando ella abre el placard, el abrigo del dibujo está colgado ahí",
    "El vecino que murió hace tres años enciende la luz del living a medianoche, y hoy golpea la puerta",
    "Encuentra fotos de su propia casa tomadas mientras dormía; en la última, alguien le sostiene la muñeca",
    "La app de meditación la llama por su nombre y le pide que no se dé vuelta",
    "Su reflejo en el espejo del baño tarda medio segundo de más en moverse, y esta vez sonríe primero",
    "Todas las noches a las 3:17 alguien arrastra algo por el pasillo del piso de arriba; ella vive en el último piso",
  ],
  romance: [
    "Las puertas del ascensor se cierran y él ve que ella todavía tiene puesto el anillo que le devolvió",
    "Su paraguas gotea colgado exactamente donde ella deja el suyo cada mañana desde hace dos años",
    "Llega a probarse el vestido de novia y su hermana lo tiene puesto frente al espejo",
    "El teléfono que agarró por error en el café tiene mil fotos de ella, tomadas de lejos",
    "Un ticket de cine para dos con la fecha de mañana, en el bolsillo del saco de un hombre que vive solo",
    "Ella le está poniendo sal a su plato sin pensar, como quien conoce a alguien de memoria; él se va mañana",
    "Su exnovio entra a la boda del brazo del novio, presentado como el mejor amigo",
    "La bufanda azul deshilachada que ella tejió aparece colgada en un pasillo que no conoce",
  ],
  misterio: [
    "Un sobre sin remitente con una foto de ella dormida anoche; al darla vuelta hay una hora escrita para hoy",
    "El diario que compró en la feria tiene entradas escritas con fecha de la semana que viene, y una la nombra",
    "La cámara del pasillo graba la misma escena todos los días exactamente a las 3:17, y hoy sale ella",
    "Un pueblo entero se borró del mapa hace cuarenta años y solo una persona guarda una foto de la plaza",
    "Abre la caja de zapatos de su padre muerto y adentro hay veinte llaves con etiquetas de ciudades",
    "Cada vez que llueve, alguien del pueblo pierde diez años de memoria; hoy el que despierta sin recordar es el comisario",
    "El detective reconoce su propia letra en la nota que dejó el asesino",
    "En la foto familiar de 1994 hay una mujer que nadie puede nombrar, y aparece también en la de 2019",
  ],
  inspiracional: [
    "Un hombre sin manos corta cebolla más rápido que todo el jurado y ninguno se anima a mirarlo a la cara",
    "Una mujer de 58 años deletrea en voz alta su primera palabra, y su nieto la corrige con dulzura",
    "El mendigo devuelve el maletín con el dinero y saca de su bolsillo la foto que explica por qué",
    "Entrena a las 4 de la mañana en una pista rota, solo, y hoy es el día en que alguien lo filma",
    "Se levanta del piso del gimnasio por sexta vez con la nariz sangrando y vuelve a ponerse los guantes",
    "Le quedan cuatro meses y hace la lista de todo lo que nunca se animó; el primer punto es llamar a su madre",
    "Trabaja de noche limpiando la universidad donde estudia de día, y hoy da su tesis con el uniforme puesto",
    "El equipo entero se sienta en el piso a esperarla cruzar la meta dos horas tarde",
  ],
  fantasia: [
    "Ve el número de días que le queda a cada persona flotando sobre su cabeza; al mirarse al espejo, el suyo dice cero",
    "Todo lo que pinta se vuelve real a las 48 horas, y anoche pintó a su hermana muerta",
    "Puede detener el tiempo, pero cada segundo le borra un recuerdo; hoy ya no sabe el nombre de su hija",
    "Los fantasmas solo los ven los menores de siete años; su hija de seis le señala la silla del comedor",
    "Cada persona nace con un hilo rojo visible; el suyo termina cortado a la mitad del pasillo",
    "Al ponerse el abrigo de un muerto empieza a soñar la vida que a él le faltó vivir",
    "En esta ciudad la gente intercambia años de vida como moneda, y ella acaba de gastar los últimos",
    "El río devuelve todo lo que le tiraron; hoy devolvió el anillo que ella tiró hace veinte años",
  ],
  historia: [
    "Un soldado sigue combatiendo en la selva 29 años después del final de la guerra porque nadie fue a avisarle",
    "La enfermera falsificó cientos de partidas de nacimiento para sacar bebés del gueto en una caja de herramientas",
    "El guardia que le salvó la vida a un músico legendario en 1969 y murió sin que nadie supiera su nombre",
    "Una ciudad entera fue borrada de los mapas oficiales durante cuarenta años mientras la gente seguía viviendo ahí",
    "El experimento que encerró a doce estudiantes seis días y todavía no tiene una explicación aceptada",
    "La mujer que engañó a la industria farmacéutica quince años con un frasco de agua con colorante",
    "Un pueblo bailó sin parar durante un mes en 1518 y decenas murieron de agotamiento",
    "El operador que decidió, solo, en once minutos, no reportar el misil que habría empezado la guerra",
  ],
};

// Trending del formato ESCENA: premisas VISUALES que se actúan, no historias.
const TRENDING_ESCENA = [
  { emoji: "💃", label: "Baile en azotea al atardecer", niche: "inspiracional", tone: "comedy", topic: "tres mujeres bailando reggaetón en una azotea al atardecer, estilo TikTok" },
  { emoji: "🪆", label: "El muñeco que se mueve",      niche: "terror", tone: "horror", topic: "un muñeco antiguo actuando solo frente a la cámara de noche, se mueve cuando nadie lo ve" },
  { emoji: "🪞", label: "El reflejo baila otro paso",   niche: "terror", tone: "horror", topic: "una bailarina baila tango sola en un salón vacío; en el espejo su reflejo baila otro paso" },
  { emoji: "👨‍🍳", label: "Chef en 30 segundos",        niche: "historia", tone: "documentary", topic: "un chef monta un platillo en 30 segundos con movimientos perfectos, cámara cenital" },
  { emoji: "🔥", label: "Transformación en el espejo",  niche: "fantasia", tone: "fantasy", topic: "una mujer se maquilla frente al espejo y con cada trazo se transforma en otra versión de sí misma" },
];

const TRENDING = [
  { emoji: "🔥", label: "Traición en familia",  niche: "drama",       tone: "drama" },
  { emoji: "💀", label: "Casa embrujada real",   niche: "terror",      tone: "horror" },
  { emoji: "❤️‍🔥", label: "Amor prohibido",      niche: "romance",     tone: "romance" },
  { emoji: "🧠", label: "Secreto de 20 años",    niche: "misterio",    tone: "mystery" },
  { emoji: "💪", label: "De cero a millonario",  niche: "inspiracional", tone: "inspirational" },
];

const GEN_STEPS = [
  { key: "story",   label: "Encendiendo la chispa de la historia…",  pct: 20, icon: "✍️" },
  { key: "scenes",  label: "Dirigiendo el ritmo de cada escena…",     pct: 45, icon: "🎬" },
  { key: "prompts", label: "Pintando cada cuadro como cine…",         pct: 68, icon: "🎨" },
  { key: "seo",     label: "Afilando el gancho viral…",               pct: 88, icon: "🪝" },
  { key: "done",    label: "¡La obra está lista!",                     pct: 100, icon: "✨" },
];

// Wizard journey — 5 steps. Cada paso es un acto de la creación.
const WIZARD_STEPS = ["El Universo", "La Trama", "El Estilo", "El Reparto", "El Estreno"];

// Real AI-generated reference frame per visual style — the SAME scene rendered in
// each style so the user sees exactly how their microseries will look.
// Images live in /public/style-previews (generated once via fal). Fallback bg shows
// while the image loads.
const STYLE_THUMB: Record<string, { img: string; bg: string }> = {
  cinematic: { img: "/style-previews/cinematic.jpg", bg: "#0f3a47" },
  anime:     { img: "/style-previews/anime.jpg",     bg: "#1e2740" },
  realistic: { img: "/style-previews/realistic.jpg", bg: "#8a96a3" },
  cartoon:   { img: "/style-previews/cartoon.jpg",   bg: "#f472b6" },
  vintage:   { img: "/style-previews/vintage.jpg",   bg: "#9a8455" },
};

// Tiny aspect-ratio frame mock per platform (vertical phone vs widescreen).
const PLATFORM_THUMB: Record<string, { ratio: string; tint: string; icon: string }> = {
  tiktok:         { ratio: "9 / 16", tint: "linear-gradient(160deg,#25f4ee,#fe2c55)", icon: "🎵" },
  instagram:      { ratio: "9 / 16", tint: "linear-gradient(160deg,#feda75,#d62976,#962fbf)", icon: "📸" },
  youtube_shorts: { ratio: "9 / 16", tint: "linear-gradient(160deg,#ff4e45,#b31217)", icon: "▶️" },
  youtube_long:   { ratio: "16 / 9", tint: "linear-gradient(160deg,#ff4e45,#b31217)", icon: "▶️" },
};

// When the user picks a niche, pre-select the matching emotion so they don't have to
// choose the same genre twice (they can still override). Removes the nicho/tono overlap.
// ── UNIVERSO → EMOCIONES QUE TIENEN SENTIDO ─────────────────────────────────
// Antes el tono mostraba las 11 emociones para cualquier universo (Terror +
// Chisme, Historia + Romance…): ruido que producía combos sin sentido. Cada
// universo ofrece SOLO sus emociones compatibles; la primera es la natural.
const TONOS_DEL_UNIVERSO: Record<string, string[]> = {
  terror:        ["horror", "thriller", "mystery", "fantasy"],
  romance:       ["romance", "drama", "comedy", "confesion", "chisme"],
  misterio:      ["mystery", "thriller", "horror", "documentary"],
  inspiracional: ["inspirational", "drama", "confesion", "comedy"],
  fantasia:      ["fantasy", "romance", "horror", "comedy"],
  historia:      ["documentary", "mystery", "inspirational", "drama"],
};

// La CONSOLA HABLA: qué siente el espectador con cada emoción, en una frase.
const SENTIRA: Record<string, string> = {
  horror: "miedo físico que no se olvida", thriller: "taquicardia hasta el final",
  mystery: "una pregunta que no lo suelta", romance: "el pecho apretado",
  drama: "un nudo en la garganta", comedy: "risa que se comparte",
  inspirational: "piel de gallina y orgullo", documentary: "“no sabía esto”",
  fantasy: "asombro de otro mundo", chisme: "un secreto que necesita contar",
  confesion: "algo demasiado íntimo",
};
const FORMATO_FRASE: Record<string, string> = {
  story: "una historia con giro y clímax",
  consejo: "un consejo contado a cámara que demuestra la respuesta",
  escena: "una escena que se ACTÚA — casi sin palabras, puro performance",
};

const NICHE_DEFAULT_TONE: Record<string, string> = {
  terror:       "horror",
  romance:      "romance",
  misterio:     "mystery",
  inspiracional:"inspirational",
  fantasia:     "fantasy",
  historia:     "documentary",
};

// Each emotion gets a face + color so the tone picker feels alive — and because the
// emotion now drives Claude's suggestions and the whole story's feeling.
const TONE_VISUAL: Record<string, { emoji: string; sub: string; active: string }> = {
  horror:        { emoji: "😱", sub: "Miedo real",     active: "bg-red-500/15 border-red-500/60 text-red-200" },
  romance:       { emoji: "💗", sub: "Ternura",        active: "bg-pink-500/15 border-pink-500/60 text-pink-200" },
  mystery:       { emoji: "🔍", sub: "Intriga",        active: "bg-blue-500/15 border-blue-500/60 text-blue-200" },
  inspirational: { emoji: "💪", sub: "Motivación",     active: "bg-emerald-500/15 border-emerald-500/60 text-emerald-200" },
  comedy:        { emoji: "😂", sub: "Risa",           active: "bg-amber-500/15 border-amber-500/60 text-amber-200" },
  thriller:      { emoji: "😰", sub: "Adrenalina",     active: "bg-orange-500/15 border-orange-500/60 text-orange-200" },
  documentary:   { emoji: "🎙️", sub: "Revelación",     active: "bg-teal-500/15 border-teal-500/60 text-teal-200" },
  fantasy:       { emoji: "🐉", sub: "Maravilla",      active: "bg-violet-500/15 border-violet-500/60 text-violet-200" },
  drama:         { emoji: "💔", sub: "Un nudo",        active: "bg-rose-500/15 border-rose-500/60 text-rose-200" },
  chisme:        { emoji: "🤫", sub: "Te cuento algo",  active: "bg-pink-500/15 border-pink-500/60 text-pink-200" },
  confesion:     { emoji: "😶‍🌫️", sub: "Nunca lo dije",   active: "bg-slate-500/15 border-slate-500/60 text-slate-200" },
};

// Hook type metadata for UI display
const HOOK_META: Record<string, { icon: string; color: string; bg: string; border: string }> = {
  question:      { icon: "❓", color: "text-blue-300",   bg: "bg-blue-950/50",   border: "border-blue-700/50" },
  in_medias_res: { icon: "⚡", color: "text-orange-300", bg: "bg-orange-950/50", border: "border-orange-700/50" },
  shocking_fact: { icon: "💥", color: "text-red-300",    bg: "bg-red-950/50",    border: "border-red-700/50" },
};

interface FormState {
  niche: string; sub_niche: string; topic: string; tone: string;
  duration_target: string; language: string; visual_style: string;
  target_platform: string; additional_instructions: string;
  // "story" = microdrama; "consejo" = la historia DEMUESTRA la respuesta a una
  // premisa tipo "cómo superar a mi ex" y la dice en voz alta al final.
  format: "story" | "consejo" | "escena";
}
const DEFAULTS: FormState = {
  niche: "", sub_niche: "", topic: "", tone: "",
  duration_target: "60s", language: "es",
  visual_style: "cinematic", target_platform: "tiktok",
  additional_instructions: "",
  format: "story",
};

const FORMAT_OPTIONS: Array<{ id: FormState["format"]; emoji: string; label: string; hint: string }> = [
  // Escrito para quien acaba de llegar: qué VA A VER, no cómo lo hacemos.
  { id: "story",   emoji: "🎬", label: "Una historia",  hint: "Personajes, un giro y un momento que nadie olvida. Lo que más se comparte." },
  { id: "consejo", emoji: "💡", label: "Un consejo",    hint: "Respondes a un \"¿cómo…?\" con una historia que lo demuestra. Ej: cómo superar a tu ex." },
  { id: "escena",  emoji: "🎭", label: "Una escena",    hint: "La premisa se ACTÚA, casi sin palabras: el muñeco que se mueve solo, un baile, una transformación. Puro performance." },
];

// Recharge modal — shown when a step returns 402 (out of NAVOS). Captures the sale
// at peak intention with a clear CTA instead of a buried error message.
function RechargeModal({ info, onClose }: { info: { required: number; have: number }; onClose: () => void }) {
  const missing = Math.max(0, info.required - info.have);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="vy-pop relative max-w-sm w-full rounded-3xl vy-grad-bg p-[1.5px] vy-glow" onClick={(e) => e.stopPropagation()}>
        <div className="rounded-3xl bg-zinc-950 p-7 text-center">
          <div className="w-16 h-16 rounded-2xl vy-grad-bg flex items-center justify-center mx-auto mb-4 vy-float2">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-xl font-extrabold vy-grad-text mb-1">¡Tu historia está lista para nacer!</h2>
          <p className="text-sm text-zinc-400 mb-5">Solo te faltan unos NAVOS para terminarla 🎬</p>

          <div className="vy-glass rounded-2xl p-4 mb-5 flex items-center justify-around">
            <div>
              <p className="text-lg font-extrabold text-white">{info.have.toLocaleString("es")}</p>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">tienes</p>
            </div>
            <div className="text-zinc-700">→</div>
            <div>
              <p className="text-lg font-extrabold text-violet-300">{info.required.toLocaleString("es")}</p>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">necesitas</p>
            </div>
            <div className="text-zinc-700">=</div>
            <div>
              <p className="text-lg font-extrabold text-pink-400">+{missing.toLocaleString("es")}</p>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">faltan</p>
            </div>
          </div>

          <Link href="/pricing">
            <button className="w-full flex items-center justify-center gap-2 vy-grad-bg text-white font-extrabold py-3.5 rounded-2xl text-sm vy-press mb-2">
              <Zap className="w-4 h-4" /> Recargar NAVOS y terminar
            </button>
          </Link>
          <button onClick={onClose} className="w-full text-xs text-zinc-500 hover:text-zinc-300 py-2 transition-colors">
            Quizás elija un tipo de video más económico
          </button>
        </div>
      </div>
    </div>
  );
}

// Timecode de rodaje: el reloj corriendo es la señal más vieja del cine de que
// la cámara está grabando DE VERDAD. Un porcentaje dice "espera"; un timecode
// dice "está pasando ahora".
function Timecode() {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setSecs(s => s + 1), 1000);
    return () => clearInterval(iv);
  }, []);
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs text-zinc-300">
      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
      <span className="text-red-400 font-bold">REC</span> {mm}:{ss}
    </span>
  );
}

// Bitácora de la sala: recorre lo que la IA está haciendo AHORA, línea por
// línea, construida con los datos reales del guion (quién habla, dónde ocurre,
// cómo se mueve la cámara). No es decoración: es la diferencia entre una barra
// que avanza y una sala donde se ve trabajar al equipo.
function LiveFeed({ lines }: { lines: string[] }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (lines.length <= 1) return;
    const iv = setInterval(() => setIdx(i => i + 1), 2600);
    return () => clearInterval(iv);
  }, [lines.length]);
  if (!lines.length) return null;
  // Las últimas 3 líneas como un log: la nueva entra viva, las viejas se apagan.
  const visibles = [2, 1, 0].map(off => lines[(idx - off + lines.length * 100) % lines.length]);
  return (
    <div className="space-y-1.5 text-left overflow-hidden">
      {visibles.map((l, i) => (
        <p
          key={`${idx}-${i}`}
          className={`text-[11px] leading-snug truncate ${
            i === 2 ? "text-white font-semibold vy-rise" : i === 1 ? "text-zinc-500" : "text-zinc-700"
          }`}
        >
          {l}
        </p>
      ))}
    </div>
  );
}

// La página de guion escribiéndose a máquina. No es un adorno: mientras Claude
// escribe el guion de verdad, el usuario ve SU historia — su universo, su
// premisa, su elenco, su gancho — tomando forma de guion delante suyo. El
// cursor sigue parpadeando al terminar: la máquina no se detuvo, está pensando.
function PaginaDeGuion({ texto }: { texto: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const iv = setInterval(() => {
      setN(prev => {
        if (prev >= texto.length) { clearInterval(iv); return prev; }
        return prev + 2;
      });
    }, 40);
    return () => clearInterval(iv);
  }, [texto]);
  return (
    <pre className="font-mono text-[11px] leading-relaxed text-zinc-300 whitespace-pre-wrap break-words text-left">
      {texto.slice(0, n)}
      <span className="inline-block w-2 h-3.5 bg-violet-400 align-middle animate-pulse" />
    </pre>
  );
}

// El monitor del director: en toda sala de montaje hay una pantalla grande
// donde se repasan los planos ya revelados mientras el resto se trabaja. Rota
// por las escenas con imagen — fundido de entrada y un Ken Burns lento que las
// hace respirar — y debajo la ficha real del guion: quién, dónde, y qué hace
// la cámara en ese plano.
function MonitorDeRodaje({ tomas }: {
  tomas: Array<{ n: number; url: string; quien?: string }>;
}) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (tomas.length <= 1) return;
    const iv = setInterval(() => setIdx(i => i + 1), 4600);
    return () => clearInterval(iv);
  }, [tomas.length]);
  if (!tomas.length) {
    return (
      <div className="relative aspect-[9/16] rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900">
        <div className="absolute inset-0 vy-shimmer2 flex items-center justify-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">esperando el primer plano…</span>
        </div>
      </div>
    );
  }
  const t = tomas[idx % tomas.length]!;
  return (
    <div className="relative aspect-[9/16] rounded-xl overflow-hidden border border-zinc-700 bg-black shadow-2xl">
      {/* key con idx: cada cambio remonta el img y reinicia fundido + Ken Burns */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img key={`${t.n}-${idx}`} src={t.url} alt={`Escena ${t.n}`}
        className="vy-monitor-frame absolute inset-0 w-full h-full object-cover" />
      <span className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-sm border border-white/15">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
        <span className="text-[8px] font-bold uppercase tracking-wider text-white">En el monitor</span>
      </span>
      {/* Solo escena y quién: la dirección de cámara interna es receta en
          inglés técnico y no se muestra al usuario. */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent px-3 pt-8 pb-2.5">
        <p className="text-[11px] font-extrabold text-white">Escena {t.n}{t.quien ? ` · ${t.quien}` : ""}</p>
      </div>
    </div>
  );
}

export default function NewProjectPage() {
  return <Suspense fallback={null}><NewProjectForm /></Suspense>;
}

function NewProjectForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(() => ({
    ...DEFAULTS,
    niche: searchParams.get("niche") ?? "",
    tone:  searchParams.get("tone")  ?? "",
    duration_target: searchParams.get("duration") ?? "60s",
    topic: searchParams.get("topic") ?? "",
  }));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [credits, setCredits] = useState<number | null>(null);
  const [ideaIdx, setIdeaIdx] = useState(0);
  // El tono elegido A MANO es una decisión del usuario y sobrevive a los cambios
  // de nicho. Sin esto, elegir Comedia y después el nicho Terror borraba la
  // Comedia en silencio: las combinaciones cruzadas (terror+comedia,
  // misterio+fantasía) eran imposibles de armar en ese orden. El auto-ajuste
  // solo aplica mientras el usuario no haya tocado la cinta de tonos.
  const [toneTouched, setToneTouched] = useState(() => Boolean(searchParams.get("tone")));
  // Motor de Premisas Virales — puntúa la semilla antes de gastar en guion.
  type EvalPremisa = { total: number; ejes: Array<{ eje: string; puntaje: number; nota: string }>; veredicto: string; mejoras: string[]; arquetipo?: string };
  const [evalPremisa, setEvalPremisa] = useState<EvalPremisa | null>(null);
  const [evaluando, setEvaluando] = useState(false);
  async function medirPotencial() {
    if (!form.topic.trim() || evaluando) return;
    setEvaluando(true); setEvalPremisa(null);
    try {
      const r = await fetch("/api/generate/premisa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic: form.topic, format: form.format, niche: form.niche, tone: form.tone }) });
      if (r.ok) setEvalPremisa(await r.json() as EvalPremisa);
      else setGenError("No se pudo evaluar la premisa — intenta de nuevo.");
    } catch (e) { setGenError(mensajeLegible(e, "No se pudo evaluar la premisa")); }
    finally { setEvaluando(false); }
  }
  // Las instrucciones adicionales viven plegadas hasta que alguien las pida.
  const [notasAbiertas, setNotasAbiertas] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genStep, setGenStep] = useState(0);
  const [genError, setGenError] = useState<string | null>(null);
  const [result, setResult] = useState<StoryOutput | null>(null);
  const [dbProjectId, setDbProjectId] = useState<string | null>(null);
  // Casting selection state (step 4 — "Elenco" screen before hook)
  const [castingStep, setCastingStep] = useState(false);
  const [castingLoading, setCastingLoading] = useState(false);
  // Bandera sincrona contra el doble clic — ver loadCasting.
  const castingEnCurso = useRef(false);
  const [castCharacters, setCastCharacters] = useState<CastCharacterOption[]>([]);
  const [castError, setCastError] = useState<string | null>(null);
  // Hook selection state (step 5 — hook picker)
  const [hookStep, setHookStep] = useState(false);
  const [hooks, setHooks] = useState<HookVariant[]>([]);
  const [hooksLoading, setHooksLoading] = useState(false);
  const [selectedHook, setSelectedHook] = useState<HookVariant | null>(null);
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [savedCharacters, setSavedCharacters] = useState<Array<{ id: string; name: string; reference_image_url: string | null }>>([]);
  const [characterId, setCharacterId] = useState<string | null>(null);
  // Claude story suggestions based on the chosen emotion (Historia step)
  const [aiSuggestions, setAiSuggestions] = useState<Array<{ emoji: string; title: string; gancho?: string; premise: string }>>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [userPlan, setUserPlan] = useState<string>("free");
  // Single premium tier — every video is the high-end "talking" obra de arte.
  const [tier] = useState<"kenburns" | "cinematic" | "talking">("talking");
  // Precio real por 60s, dicho por el servidor (respeta FORCE_TIER y el plan).
  // null hasta que responde: mejor no mostrar precio que mostrar uno falso.
  const [navosPor60s, setNavosPor60s] = useState<number | null>(null);
  // Borrador (sin animación, ~10% del precio) o estreno. Por defecto borrador:
  // la primera vez casi nadie acierta la historia, y descubrirlo debería costar
  // centavos, no el video entero.
  const [calidad, setCalidad] = useState<"borrador" | "estreno">("borrador");
  // "Sin NAVOS" recharge modal — shown when any step returns 402 so we capture the
  // sale at peak intention instead of dropping a plain error.
  const [rechargeInfo, setRechargeInfo] = useState<{ required: number; have: number } | null>(null);
  // Inline production — run the whole pipeline on THIS page (no redirect to the
  // project page). The user watches the live build and the final reveal here.
  const [prod, setProd] = useState<{
    active: boolean;
    phase: "voice" | "images" | "clips" | "final" | "done" | "error";
    error: string | null;
    videoUrl: string | null;
    projectId: string | null;
  } | null>(null);
  // Live scene previews — images fill in as the AI generates them (scene_number → url).
  const [scenePreviews, setScenePreviews] = useState<Record<number, string>>({});

  // Poll the project while it's producing so generated scene images appear LIVE.
  useEffect(() => {
    if (!prod?.active || !prod.projectId) return;
    if (!["voice", "images", "clips"].includes(prod.phase)) return;
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch(`/api/projects/${prod.projectId}`);
        if (!r.ok) return;
        const d = await r.json() as { scenes?: Array<{ id: string; scene_number: number }>; assets?: Array<{ asset_type: string; scene_id: string | null; public_url: string | null }> };
        const sceneById = new Map((d.scenes ?? []).map(s => [s.id, s.scene_number]));
        const map: Record<number, string> = {};
        for (const a of d.assets ?? []) {
          if (a.asset_type === "image" && a.public_url && a.scene_id) {
            const n = sceneById.get(a.scene_id);
            if (n) map[n] = a.public_url;
          }
        }
        if (alive && Object.keys(map).length) setScenePreviews(prev => ({ ...prev, ...map }));
      } catch { /* keep polling */ }
    };
    void poll();
    const iv = setInterval(poll, 2500);
    return () => { alive = false; clearInterval(iv); };
  }, [prod?.active, prod?.phase, prod?.projectId]);

  useEffect(() => {
    fetch("/api/credits").then(r => r.json())
      .then((d: { credits?: number; plan?: string; navos_por_60s?: number }) => {
        if (typeof d.credits === "number") setCredits(d.credits);
        if (d.plan) setUserPlan(d.plan);
        // El servidor manda el precio que va a cobrar de verdad.
        if (typeof d.navos_por_60s === "number") setNavosPor60s(d.navos_por_60s);
      })
      .catch(() => null);
    // Load saved recurring characters so the user can reuse one in this story.
    fetch("/api/characters").then(r => r.json())
      .then((d: { characters?: Array<{ id: string; name: string; reference_image_url: string | null }> }) => {
        if (Array.isArray(d.characters)) setSavedCharacters(d.characters);
      })
      .catch(() => null);
  }, []);

  // Auto-advance to step 1 if niche came from URL
  useEffect(() => {
    if (form.niche && form.tone && form.topic && step === 0) setStep(1);
  }, []);

  const theme = NICHO_THEME[form.niche] ?? DEFAULT_THEME;
  const set = (field: keyof FormState) => (value: string) => {
    setForm(f => ({ ...f, [field]: value }));
    setErrors(e => ({ ...e, [field]: undefined }));
  };
  const selectedNicho = NICHOS.find(n => n.id === form.niche);
  const nichoIdeas = QUICK_IDEAS[form.niche] ?? [];
  // VENTANA DE TRES QUE ROTA, no las tres primeras para siempre.
  //
  // La lista siempre tuvo más ideas de las que se mostraban, pero la interfaz
  // cortaba con slice(0, 3): daba igual cuántas hubiera, el usuario veía las
  // mismas tres en cada visita. De ahí que se sintieran estáticas.
  //
  // Arranca en 0 a propósito —servidor y cliente pintan lo mismo, sin desajuste
  // de hidratación— y avanza solo cuando alguien lo pide.
  const trioIdeas = nichoIdeas.length
    ? [0, 1, 2].map((k) => nichoIdeas[(ideaIdx + k) % nichoIdeas.length]!)
    : [];

  function nextIdea() {
    if (!nichoIdeas.length) return;
    const next = (ideaIdx + 1) % nichoIdeas.length;
    setIdeaIdx(next);
    set("topic")(nichoIdeas[next] ?? "");
  }

  // Ask Claude for 3 fresh story premises tuned to the chosen emotion (tone).
  async function suggestStories() {
    if (suggestLoading) return;
    setSuggestLoading(true);
    setSuggestError(null);
    try {
      const res = await fetch("/api/generate/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche: form.niche || "drama",
          tone: form.tone || "drama",
          sub_niche: form.sub_niche || undefined,
          language: form.language || "es",
        }),
      });
      const data = await res.json() as { suggestions?: Array<{ emoji: string; title: string; gancho?: string; premise: string }>; error?: string };
      if (!res.ok || !data.suggestions?.length) throw new Error(data.error ?? "No se pudieron generar ideas");
      setAiSuggestions(data.suggestions);
    } catch (err) {
      setSuggestError(mensajeLegible(err, "Error al sugerir"));
    } finally {
      setSuggestLoading(false);
    }
  }

  function validateStep(s: number) {
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (s === 0) {
      if (!form.niche) errs.niche = "Elige un nicho para continuar";
      if (!form.tone)  errs.tone  = "Elige un tono";
    }
    if (s === 1) {
      if (!form.topic || form.topic.length < 5) errs.topic = "Describe el tema (mínimo 5 caracteres)";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function goNext() { if (validateStep(step)) setStep(s => s + 1); }
  function goBack() { setStep(s => Math.max(0, s - 1)); setErrors({}); }

  // Teclado en el formulario: Enter avanza, Esc retrocede. Solo entre los pasos
  // 0→1→2 — el salto al casting gasta NAVOS y exige el click explícito. Dentro
  // del textarea, Enter escribe; Ctrl+Enter avanza.
  useEffect(() => {
    if (castingStep || hookStep || generating || prod || result) return;
    const onKey = (e: KeyboardEvent) => {
      const enTexto = e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement;
      if (e.key === "Enter" && step < 2 && (!enTexto || e.ctrlKey)) { e.preventDefault(); goNext(); }
      else if (e.key === "Escape" && step > 0 && !enTexto) goBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, form, castingStep, hookStep, generating, prod, result]);

  // Velocidad percibida: las 5 referencias de estilo se descargan mientras el
  // usuario todavía escribe su historia — al llegar al paso 3 ya están en caché
  // y los fotogramas aparecen al instante.
  useEffect(() => {
    Object.values(STYLE_THUMB).forEach(t => { const i = new window.Image(); i.src = t.img; });
  }, []);

  async function loadCasting() {
    // ⚠️ BANDERA SÍNCRONA, NO EL ESTADO.
    //
    // El botón ya se deshabilita con castingLoading, pero setState es asíncrono:
    // dos clics rápidos pasan LOS DOS antes de que React vuelva a pintar. Y cada
    // llamada genera los retratos del elenco — o sea que el doble clic se cobra
    // dos veces. Medido en un log de producción: "[casting] 3/3 personajes con
    // retratos" impreso dos veces en la misma generación.
    //
    // Un ref cambia en el mismo instante, así que la segunda llamada se corta
    // antes de salir a la red. Es la misma guarda que ya tenía suggestStories.
    if (castingEnCurso.current) return;
    castingEnCurso.current = true;
    setCastingLoading(true);
    setCastError(null);
    try {
      const res = await fetch("/api/casting/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche: form.niche,
          topic: form.topic,
          tone: form.tone,
          language: form.language,
          visual_style: form.visual_style,
          format: form.format,
        }),
      });
      if (res.status === 402) {
        const e = await res.json() as { required?: number; credits?: number };
        setRechargeInfo({ required: e.required ?? CREDIT_COST_BY_TIER[tier], have: e.credits ?? credits ?? 0 });
        return;
      }
      if (!res.ok) throw new Error("No se pudo diseñar el elenco");
      const data = await res.json() as { characters?: CastCharacterOption[] };
      const chars = (data.characters ?? []).map(c => ({ ...c, selectedIdx: 0 }));
      setCastCharacters(chars);
      setCastingStep(true);
    } catch (err) {
      setCastError(mensajeLegible(err, "Error generando el elenco"));
    } finally {
      setCastingLoading(false);
      // En el finally, no en el camino feliz: si la llamada falla, el usuario
      // tiene que poder reintentar. Una bandera que se toma y no se suelta deja
      // el botón muerto para siempre — peor que el doble cobro que evita.
      castingEnCurso.current = false;
    }
  }

  async function loadHooks() {
    if (!validateStep(1)) return;
    setHooksLoading(true);
    setGenError(null);
    try {
      const res = await fetch("/api/generate/hooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche: form.niche,
          tone: form.tone,
          topic: form.topic,
          language: form.language,
          duration_target: form.duration_target,
          format: form.format,
          cast_names: castCharacters.map((c) => c.name).filter(Boolean).slice(0, 4),
        }),
      });
      if (!res.ok) throw new Error("No se pudieron generar los hooks");
      const data = await res.json() as { hooks: HookVariant[] };
      setHooks(data.hooks);
      setSelectedHook(data.hooks[0] ?? null);
      setHookStep(true);
    } catch (err) {
      setGenError(mensajeLegible(err, "Error"));
    } finally {
      setHooksLoading(false);
    }
  }

  async function generate(hookOverride?: HookVariant | null) {
    if (!validateStep(1)) { setStep(1); return; }
    setGenerating(true);
    setGenError(null);
    setGenStep(0);

    // Inject chosen hook + cast design into additional_instructions
    const hook = hookOverride !== undefined ? hookOverride : selectedHook;
    const castContext = castCharacters.length > 0
      ? `\n[ELENCO DISEÑADO]: ${castCharacters.map(c => `${c.name} (${c.role}, ${c.voice_profile}): ${(c.personality ?? "").slice(0, 120)}`).join(" | ")}`
      : "";
    const extraInstructions = hook
      ? `[HOOK ELEGIDO]: ${hook.text}${castContext}${form.additional_instructions ? `\n${form.additional_instructions}` : ""}`
      : `${castContext.trimStart()}${form.additional_instructions ? (castContext ? `\n${form.additional_instructions}` : form.additional_instructions) : ""}`;

    let si = 0;
    const iv = setInterval(() => { if (si < GEN_STEPS.length - 2) { si++; setGenStep(si); } }, 1100);
    try {
      // The cast the user designed/selected on the "Elenco" screen — each member
      // carries the portrait they picked, so production can match face↔speaker.
      const castPayload = castCharacters.length > 0
        ? castCharacters.map((c) => ({
            name: c.name,
            role: c.role,
            voice_profile: c.voice_profile,
            reference_image_url: c.options[c.selectedIdx] || undefined,
            // LA EDAD VIAJA. Decide si a este personaje se le dibujan picos de
            // contacto o de violencia, y el dato ya estaba acá desde el casting
            // — simplemente no se enviaba. El guardia de menores existía, estaba
            // verificado, y nunca se activó porque nadie le pasaba la edad.
            // Construir la defensa y no conectarla es peor que no tenerla:
            // aparece en la lista de cosas resueltas y no protege nada.
            age: c.age || undefined,
          }))
        : undefined;
      const res = await fetch("/api/generate/story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, additional_instructions: extraInstructions, character_id: characterId ?? undefined, animation_tier: tier, quality: calidad, cast: castPayload }),
      });
      clearInterval(iv);
      if (res.status === 402) {
        const e = await res.json() as { required?: number; credits?: number };
        setGenerating(false);
        setRechargeInfo({ required: e.required ?? 0, have: e.credits ?? credits ?? 0 });
        return;
      }
      if (!res.ok) { const e = await res.json() as { error?: string }; throw new Error(e.error ?? "Error"); }
      const data = await res.json() as { project_id: string | null; data: StoryOutput };
      setGenStep(GEN_STEPS.length - 1);
      setResult(data.data);
      setDbProjectId(data.project_id);
      // Produce the video RIGHT HERE — no page change. The user watches the live
      // build and the final reveal on this same screen.
      if (data.project_id) {
        setGenerating(false);
        void produceInline(data.project_id, tier);
      }
    } catch (err) {
      clearInterval(iv);
      setGenError(mensajeLegible(err, "Error desconocido"));
    } finally {
      setGenerating(false);
    }
  }

  // Producción DESACOPLADA de la pestaña. Antes este método orquestaba el
  // pipeline entero desde el navegador: si el usuario cerraba la pestaña, la
  // producción moría — "No cierres esta pantalla" era un síntoma, no una
  // solución. El worker del servidor (services/jobs/worker.ts) ya sabía hacer
  // todo esto con heartbeat, reintentos y refund; el wizard simplemente no lo
  // usaba. Ahora encola el job y OBSERVA: la pestaña es un espectador, no el
  // director. Cerrala y la producción sigue; el correo de "video listo" sale
  // del assemble como siempre.
  async function produceInline(projectId: string, _animTier: "kenburns" | "cinematic" | "talking") {
    setScenePreviews({});
    setProd({ active: true, phase: "voice", error: null, videoUrl: null, projectId });
    try {
      const enq = await fetch("/api/produce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      if (!enq.ok) {
        const e = await enq.json().catch(() => ({})) as { error?: string };
        throw new Error(e.error ?? "No se pudo encolar la producción");
      }

      // El job avanza por etapas del lado del servidor; acá solo se traducen a
      // las fases de la sala. La página del proyecto usa el mismo endpoint, así
      // que recargar o volver más tarde muestra el mismo estado.
      const FASE: Record<string, "voice" | "images" | "clips" | "final"> = {
        voice_images: "images", continuity: "images", animation: "clips", render: "final", done: "final",
      };
      // EL VIDEO MANDA SOBRE EL ESTADO DEL JOB.
      //
      // Este bucle esperaba job.status === "completed", una palabra que la base
      // de datos no usa nunca: el worker marca 'done'. La producción terminaba
      // bien, el video quedaba guardado, y la pestaña seguía esperando hasta
      // agotar los 400 intentos para después decir que había tardado demasiado.
      // El video estaba listo todo ese tiempo y el usuario nunca lo vio.
      //
      // El arreglo no es solo corregir la palabra. La señal de que un video está
      // listo es QUE EL VIDEO EXISTE, no que un campo de texto diga cierta cosa.
      // Ahora se pregunta por el archivo, y el estado del job solo sirve para
      // mover la barra y para detectar el fracaso.
      const videoListo = async (): Promise<string | null> => {
        try {
          const det = await (await fetch(`/api/projects/${projectId}`)).json() as
            { assets?: Array<{ asset_type: string; public_url: string | null }> };
          return det.assets?.find(a => a.asset_type === "final_video" && a.public_url)?.public_url ?? null;
        } catch { return null; }
      };
      const revelar = (url: string | null) => {
        setProd(p => p && { ...p, phase: "done", videoUrl: url });
        confetti({ particleCount: 140, spread: 90, origin: { y: 0.6 }, colors: ["#7c3aed", "#ec4899", "#f59e0b", "#10b981", "#fff"] });
      };

      for (let i = 0; i < 400; i++) {
        await new Promise(r => setTimeout(r, 4000));
        const d = await (await fetch(`/api/produce?project_id=${projectId}`)).json().catch(() => ({})) as
          { job?: { status: string; stage: string | null; error: string | null } | null };
        const job = d.job;

        // Terminal por éxito: el worker dice 'done'. Se confirma con el archivo.
        if (job?.status === "done") { revelar(await videoListo()); return; }
        if (job?.status === "failed") {
          // El refund ya lo hizo el worker al agotar los reintentos.
          throw new Error(job.error ?? "La producción falló");
        }
        // Red de seguridad: cada ~40s se pregunta directamente por el archivo. Si
        // el video existe, se muestra aunque el job diga otra cosa — un desajuste
        // de vocabulario no puede volver a esconder un video terminado.
        if (i > 0 && i % 10 === 0) {
          const url = await videoListo();
          if (url) { revelar(url); return; }
        }
        if (job) setProd(p => p && { ...p, phase: FASE[job.stage ?? ""] ?? p.phase });
      }
      // Último intento antes de dar por perdida una producción que quizá terminó.
      const tarde = await videoListo();
      if (tarde) { revelar(tarde); return; }
      throw new Error("La producción tardó demasiado. Revisa el proyecto en tu biblioteca.");
    } catch (err) {
      const msg = mensajeLegible(err, "Error desconocido");
      setProd(p => p ? { ...p, phase: "error", error: msg } : p);
    }
  }

  // ── GENERATING — la mesa de guion ───────────────────────────────────────────
  // Antes: un cubo holográfico girando — bonito y mudo, no contaba NADA de la
  // historia del usuario. Mientras Claude escribe el guion de verdad, esta
  // pantalla muestra la suya tomando forma de guion: su universo, su premisa,
  // su elenco elegido retrato por retrato, su gancho. Los datos son reales;
  // solo el tipeo es teatro.
  if (generating) {
    const elenco = castCharacters.length
      ? castCharacters.map(c => `  ${c.name.toUpperCase()} — ${c.role}`).join("\n")
      : "  (diseñando personajes…)";
    const gancho = selectedHook ? `"${selectedHook.text}"` : "(la IA está eligiendo la primera línea…)";
    const paginaGuion =
      `PRODUCCIÓN VYNAVO\n` +
      `${"─".repeat(34)}\n\n` +
      `UNIVERSO:  ${form.niche.toUpperCase()}\n` +
      `TONO:      ${form.tone}\n` +
      `ESTILO:    ${form.visual_style}\n\n` +
      `PREMISA\n  "${form.topic}"\n\n` +
      `ELENCO\n${elenco}\n\n` +
      `ESCENA 1 — EL GANCHO\n  ${gancho}\n\n` +
      `ESCENA 2 — …`;

    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col px-4 py-6 relative overflow-hidden">
        <div className={`absolute inset-0 bg-gradient-to-br ${theme.card} opacity-40 pointer-events-none`} />

        <div className="relative z-10 max-w-5xl mx-auto w-full flex-1 flex flex-col">
          {/* Claqueta — el mismo lenguaje que la sala de montaje */}
          <div className="flex items-center justify-between gap-4 pb-4 border-b border-zinc-800/60 mb-5">
            <div className="flex items-center gap-4 min-w-0">
              <Timecode />
              <div className="min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-500">Mesa de guion · VYNAVO</p>
                <h2 className="text-sm font-extrabold text-white truncate">{GEN_STEPS[genStep]?.icon} {GEN_STEPS[genStep]?.label}</h2>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="w-28 h-1.5 bg-zinc-800 rounded-full overflow-hidden hidden sm:block">
                <div className="h-full rounded-full bg-gradient-to-r from-violet-600 to-pink-600 transition-all duration-700" style={{ width: `${GEN_STEPS[genStep]?.pct ?? 0}%` }} />
              </div>
              <span className="text-xs font-bold text-violet-300 font-mono">{GEN_STEPS[genStep]?.pct ?? 0}%</span>
            </div>
          </div>

          <div className="grid lg:grid-cols-5 gap-5 items-start flex-1">
            {/* ── Izquierda: la página escribiéndose ── */}
            <div className="lg:col-span-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 min-h-[320px]">
              <PaginaDeGuion texto={paginaGuion} />
            </div>

            {/* ── Derecha: el escritor trabajando ── */}
            <div className="lg:col-span-2 space-y-4">
              <div className="vy-glass rounded-2xl p-4">
                <div className="flex justify-center mb-1"><CinematicLoader icon={GEN_STEPS[genStep]?.icon} /></div>
                <div className="space-y-2 text-left">
                  {GEN_STEPS.slice(0, genStep + 1).map((s, i) => (
                    <div key={s.key} className="flex items-center gap-2.5">
                      {i < genStep
                        ? <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                        : <div className="w-4 h-4 rounded-full border-2 border-violet-500 border-t-transparent animate-spin shrink-0" />}
                      <span className={`text-xs ${i < genStep ? "text-zinc-600 line-through" : "text-white font-medium"}`}>{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-xs text-zinc-600 text-center">💡 Los creadores que publican a diario crecen 3× más rápido</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── PRODUCCIÓN INLINE (sin cambiar de página) ────────────────────────────────
  if (prod) {
    const phases = [
      { key: "voice",  emoji: "🎙️", label: "Dando voz a tu elenco" },
      { key: "images", emoji: "🎨", label: "Pintando las escenas" },
      ...(tier !== "kenburns" ? [{ key: "clips", emoji: "🎬", label: "Dando movimiento" }] : []),
      { key: "final",  emoji: "✨", label: "Montando tu microserie" },
    ];
    const curIdx = Math.max(0, phases.findIndex(p => p.key === prod.phase));
    const cur = phases[curIdx] ?? phases[phases.length - 1]!;
    const pct = prod.phase === "done" ? 100 : Math.round(((curIdx + 0.5) / phases.length) * 100);

    // ── REVEAL del video listo ──
    if (prod.phase === "done" && prod.videoUrl) {
      return (
        <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4 py-10">
          <div className="vy-pop max-w-sm w-full rounded-3xl vy-grad-bg p-[1.5px] vy-glow">
            <div className="rounded-3xl bg-zinc-950 p-6 text-center">
              <h2 className="text-2xl font-extrabold vy-grad-text mb-1">¡Tu microserie está lista! 🎉</h2>
              <p className="text-sm text-zinc-400 mb-4">Descárgala y conquista el feed</p>
              <video src={prod.videoUrl} controls playsInline className="w-40 mx-auto rounded-xl border border-zinc-700 mb-4 aspect-[9/16] object-cover bg-black" />
              <a href={prod.videoUrl} download className="w-full flex items-center justify-center gap-2 vy-grad-bg text-white font-extrabold py-3.5 rounded-2xl text-sm vy-press mb-2">
                Descargar MP4
              </a>
              <button onClick={() => { setProd(null); setResult(null); setHookStep(false); setCastingStep(false); setCastCharacters([]); setStep(0); }} className="w-full border border-violet-700/50 text-violet-300 hover:bg-violet-950/40 font-semibold py-2.5 rounded-2xl text-xs transition-all mb-2">
                ✨ Crear otra microserie
              </button>
              {prod.projectId && (
                <Link href={`/dashboard/projects/${prod.projectId}`}>
                  <button className="w-full text-xs text-zinc-500 hover:text-zinc-300 py-1.5 transition-colors">Ver detalle y kit de publicación →</button>
                </Link>
              )}
            </div>
          </div>
        </div>
      );
    }

    // ── ERROR ──
    if (prod.phase === "error") {
      return (
        <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4 text-center">
          <div className="max-w-sm w-full vy-glass rounded-3xl p-7">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
            <h2 className="text-lg font-extrabold text-white mb-1">Algo se atascó</h2>
            <p className="text-xs text-red-300 mb-1">{prod.error}</p>
            <p className="text-[11px] text-zinc-500 mb-5">Te devolvimos tus NAVOS. Puedes reintentar.</p>
            <button onClick={() => prod.projectId && produceInline(prod.projectId, tier)} className="w-full vy-grad-bg text-white font-extrabold py-3 rounded-2xl text-sm vy-press mb-2">
              Reintentar
            </button>
            {prod.projectId && (
              <Link href={`/dashboard/projects/${prod.projectId}`}>
                <button className="w-full text-xs text-zinc-500 hover:text-zinc-300 py-1.5">Abrir en el estudio →</button>
              </Link>
            )}
          </div>
        </div>
      );
    }

    // ── LIVE — la sala de montaje ──
    // Antes: una tarjeta angosta con una barra de progreso. Una barra dice
    // "espera"; una sala de montaje muestra al equipo TRABAJANDO. Todo lo que se
    // ve aquí sale de datos reales: el guion (quién habla, dónde, cómo se mueve
    // la cámara), las imágenes que van llegando del pipeline, y un timecode
    // corriendo. Nada es teatro — es la producción en vivo.
    const escenas = result?.scenes ?? [];
    const total = escenas.length || Math.max(Object.keys(scenePreviews).length, 3);
    const ready = Object.keys(scenePreviews).length;
    // La escena "en cámara": la primera sin imagen — la que el pipeline está
    // revelando en este momento.
    const enCamara = Array.from({ length: total }, (_, k) => k + 1).find(n => !scenePreviews[n]);
    const corto = (t?: string, w = 6) => {
      const p = (t ?? "").split(/\s+/);
      return p.slice(0, w).join(" ") + (p.length > w ? "…" : "");
    };
    // La bitácora habla en idioma de RODAJE, nunca de receta: los prompts de
    // cámara y las locaciones internas van en inglés técnico y enseñan la
    // cocina. Lo que sí puede verse: los nombres del elenco (el usuario los
    // eligió) y sus propias líneas de diálogo (las va a oír en el video).
    const feed: string[] =
      prod.phase === "voice"
        ? escenas.map(s => `🎙 Grabando a ${s.speaker ?? "tu narrador"}: «${corto(s.narration_text)}»`)
        : prod.phase === "images"
          ? escenas.map((s, i) => {
              const verbos = ["🎨 Revelando", "💡 Iluminando", "🖌 Retocando", "🎨 Componiendo"];
              return `${verbos[i % verbos.length]} la escena ${s.scene_number}${s.speaker ? ` — ${s.speaker} en cuadro` : ""}`;
            })
          : prod.phase === "clips"
            ? escenas.map((s, i) => {
                const tomas = ["🎬 ¡Acción! Escena", "🎥 Rodando la escena", "🎬 Otra toma de la escena", "🎥 La cámara sigue la escena"];
                return `${tomas[i % tomas.length]} ${s.scene_number}${s.speaker ? ` · ${s.speaker}` : ""}`;
              })
            : ["✂️ Cortando al ritmo del guion", "🎵 Mezclando música y voz", "💬 Quemando los subtítulos", "🎞 Empalmando las tomas", "✨ Pulido final de color"];

    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col px-4 py-6 relative overflow-hidden">
        {/* Atmósfera del género detrás de todo */}
        <div className={`absolute inset-0 bg-gradient-to-br ${theme.card} opacity-40 pointer-events-none`} />

        <div className="relative z-10 max-w-5xl mx-auto w-full flex-1 flex flex-col">
          {/* ── Claqueta: REC + timecode + fase + avance ── */}
          <div className="flex items-center justify-between gap-4 pb-4 border-b border-zinc-800/60 mb-5">
            <div className="flex items-center gap-4 min-w-0">
              <Timecode />
              <div className="min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-500">Sala de montaje · VYNAVO</p>
                <h2 className="text-sm font-extrabold text-white truncate">{cur.emoji} {cur.label}…</h2>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="w-28 h-1.5 bg-zinc-800 rounded-full overflow-hidden hidden sm:block">
                <div className="h-full rounded-full bg-gradient-to-r from-violet-600 to-pink-600 transition-all duration-700" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs font-bold text-violet-300 font-mono">{pct}%</span>
            </div>
          </div>

          <div className="grid lg:grid-cols-5 gap-5 items-start flex-1">
            {/* ── Izquierda: el monitor del director + el muro de escenas ── */}
            <div className="lg:col-span-3">
              <div className="flex items-center justify-between mb-2.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Tus escenas</p>
                <p className="text-[10px] font-bold text-violet-300">{ready}/{total} reveladas</p>
              </div>
              <div className="flex gap-3 items-start">
              {/* El monitor grande repasa los planos revelados; el muro al lado
                  es la bandeja de clips. Como en una sala de verdad. */}
              <div className="w-[38%] shrink-0">
                <MonitorDeRodaje tomas={
                  Array.from({ length: total }, (_, k) => ({ n: k + 1, url: scenePreviews[k + 1], esc: escenas[k] }))
                    .filter(t => t.url)
                    .map(t => ({ n: t.n, url: t.url!, quien: t.esc?.speaker }))
                } />
              </div>
              <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Array.from({ length: total }, (_, k) => {
                  const n = k + 1;
                  const url = scenePreviews[n];
                  const revelando = n === enCamara;
                  return (
                    <div
                      key={n}
                      className={`relative aspect-[9/16] rounded-xl overflow-hidden border bg-zinc-900 transition-all duration-500 ${
                        revelando ? `${theme.selected ?? "border-violet-500"} shadow-lg` : url ? "border-zinc-700" : "border-zinc-800"
                      }`}
                    >
                      {url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={url} alt={`Escena ${n}`} className="vy-pop w-full h-full object-cover" />
                      ) : (
                        <div className="absolute inset-0 vy-shimmer2 flex flex-col items-center justify-center gap-1">
                          <span className="text-sm font-bold text-zinc-600">{n}</span>
                          {revelando && <span className="text-[8px] font-bold uppercase tracking-wider text-violet-300 vy-pulse-soft">revelando</span>}
                        </div>
                      )}
                      {/* Ficha de la escena: número y quién actúa. La locación
                          interna va en inglés técnico — es receta, no rodaje,
                          y no se muestra. */}
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/85 to-transparent px-1.5 pt-4 pb-1">
                        <p className="text-[8px] font-bold text-white/90 truncate">{n}{escenas[k]?.speaker ? ` · ${escenas[k].speaker}` : ""}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              </div>
            </div>

            {/* ── Derecha: el equipo trabajando ── */}
            <div className="lg:col-span-2 space-y-4">
              <div className="vy-glass rounded-2xl p-4">
                <div className="flex justify-center mb-1"><CinematicLoader icon={cur.emoji} /></div>
                <div className="space-y-2.5">
                  {phases.map((ph, i) => (
                    <div key={ph.key} className={`flex items-center gap-2.5 text-xs ${i === curIdx ? "vy-rise" : ""}`}>
                      {i < curIdx ? <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                        : i === curIdx ? <Loader2 className="w-4 h-4 text-violet-400 animate-spin shrink-0" />
                        : <span className="w-4 h-4 rounded-full border border-zinc-700 shrink-0" />}
                      <span className={i < curIdx ? "text-emerald-300" : i === curIdx ? "text-white font-semibold" : "text-zinc-600"}>{ph.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bitácora en vivo, con los datos del guion */}
              <div className="vy-glass rounded-2xl p-4">
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-500 mb-2">En el set ahora</p>
                <LiveFeed lines={feed} />
              </div>

              {/* La producción vive en el servidor: esta pantalla es un
                  espectador, no el director. */}
              <p className="text-[11px] text-zinc-600 text-center">
                Puedes cerrar esta pantalla: la producción sigue sola y te avisamos por correo 📬
              </p>
              <Link href="/dashboard/library" className="block text-center text-[11px] text-violet-400 hover:text-violet-300 transition-colors">
                Seguir usando VYNAVO mientras tanto →
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── HOOK SELECTION ──────────────────────────────────────────────────────────
  if (hookStep && !generating) {
    const hookStepIdx = WIZARD_STEPS.length - 1; // "Gancho" is the last step
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col">
        {rechargeInfo && <RechargeModal info={rechargeInfo} onClose={() => setRechargeInfo(null)} />}
        {/* Header */}
        <div className={`relative overflow-hidden border-b border-zinc-800/60`}>
          <div className={`absolute inset-0 bg-gradient-to-r ${theme.card} opacity-80 pointer-events-none`} />
          <div className="relative px-4 pt-4 pb-5">
            {/* Step indicator — "Gancho" active (5/5) */}
            <div className="flex items-center justify-center gap-1.5 mb-4">
              {WIZARD_STEPS.map((label, i) => {
                const active = i === hookStepIdx;
                return (
                  <div key={label} className="flex items-center gap-1.5">
                    <div className="flex flex-col items-center gap-1">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-extrabold transition-all duration-300 ${
                        active ? "bg-white text-zinc-900" : "bg-emerald-600 text-white"
                      }`}>
                        {active ? i + 1 : <CheckCircle className="w-3.5 h-3.5" />}
                      </div>
                      <span className={`text-[8px] font-bold uppercase tracking-wider ${active ? "text-white" : "text-zinc-600"}`}>{label}</span>
                    </div>
                    {i < WIZARD_STEPS.length - 1 && (
                      <div className={`w-6 h-0.5 mb-4 rounded-full ${theme.bar}`} />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900/80 border border-zinc-700 mb-3">
                <Flame className="w-3.5 h-3.5 text-orange-400" />
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Último paso · el hook = el 80% de tu viral</span>
              </div>
              <h1 className="text-xl font-extrabold text-white">{form.format === "escena" ? "Elige tu primer plano" : "Elige tu gancho de apertura"}</h1>
              <p className="text-xs text-zinc-500 mt-1">{form.format === "escena" ? "Lo que se VE en los primeros 2 segundos — nadie habla, la imagen detiene el scroll" : "Toca el que más te guste y genera tu video"}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 max-w-5xl mx-auto w-full px-4 py-5 space-y-5 pb-32">

          {/* La marquesina: los tres ganchos lado a lado, como tres carteles del
              mismo estreno. Elegir la primera línea de tu película es una
              comparación — y comparar exige ver las tres opciones a la vez, no
              recordar la de arriba mientras lees la de abajo. */}
          <div className="grid md:grid-cols-3 gap-4 items-stretch">
          {hooks.map((hook) => {
            const meta = HOOK_META[hook.type] ?? HOOK_META["question"]!;
            const isSelected = selectedHook?.id === hook.id;
            return (
              <button
                key={hook.id}
                onClick={() => setSelectedHook(hook)}
                className={`flex flex-col text-left rounded-2xl border-2 p-5 transition-all duration-200 ${
                  isSelected
                    ? `${meta.bg} ${meta.border} scale-[1.02] shadow-xl`
                    : "bg-zinc-900 border-zinc-800 hover:border-zinc-700 hover:-translate-y-0.5"
                }`}
              >
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xl">{meta.icon}</span>
                  <span className={`text-[10px] font-bold uppercase tracking-widest ${isSelected ? meta.color : "text-zinc-500"}`}>
                    {hook.type_label}
                  </span>
                  {isSelected && (
                    <CheckCircle className="w-4 h-4 text-emerald-400 ml-auto shrink-0" />
                  )}
                </div>

                {/* Hook text — the star of the show. flex-1 empuja el "por qué"
                    al pie para que las tres tarjetas queden alineadas. */}
                <p className={`flex-1 text-base md:text-lg font-bold leading-snug mb-4 ${isSelected ? "text-white" : "text-zinc-200"}`}>
                  &ldquo;{hook.text}&rdquo;
                </p>

                {/* Why it works */}
                <div className={`flex items-start gap-1.5 px-3 py-2 rounded-lg ${isSelected ? "bg-black/30" : "bg-zinc-800/50"}`}>
                  <span className="text-[10px] text-zinc-500 mt-0.5">💡</span>
                  <p className={`text-[11px] leading-relaxed ${isSelected ? meta.color : "text-zinc-500"}`}>{hook.why}</p>
                </div>
              </button>
            );
          })}
          </div>

          {/* Skip hook */}
          <button
            onClick={() => void generate(null)}
            className="w-full max-w-xs mx-auto block py-3 rounded-xl border border-zinc-800 text-zinc-600 text-xs hover:border-zinc-700 hover:text-zinc-400 transition-all"
          >
            Saltar — dejar que la IA elija el hook
          </button>

          {genError && (
            <div className="flex items-start gap-2 p-3 bg-red-950/40 border border-red-700/40 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{genError}</p>
            </div>
          )}
        </div>

        {/* Fixed bottom CTA */}
        <div className="fixed bottom-0 left-0 right-0 z-20">
          <div className={`absolute inset-0 bg-gradient-to-t ${theme.card} opacity-30 pointer-events-none`} />
          <div className="relative bg-zinc-950/95 backdrop-blur-sm border-t border-zinc-800/60 px-4 py-3 max-w-5xl mx-auto">
            {/* La barra acompaña el ancho del contenido; los botones no se
                estiran — un CTA del ancho de la pantalla deja de leerse como
                botón. */}
            <div className="flex gap-3 sm:max-w-lg sm:mx-auto">
              <button
                onClick={() => { setHookStep(false); setCastingStep(true); }}
                className="flex items-center gap-1.5 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 text-sm font-medium hover:border-zinc-700 transition-all shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => void generate(selectedHook)}
                disabled={credits === 0}
                className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-extrabold text-white transition-all active:scale-[0.98] shadow-lg ${theme.glow} bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                <Sparkles className="w-5 h-5" />
                Generar mi video
                <span className="text-[10px] font-normal opacity-70 ml-1">
                  · {credits !== null ? `${credits} NAVOS` : "…"}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── CASTING SELECTION ────────────────────────────────────────────────────────
  if (castingStep && !hookStep && !generating) {
    const castingStepIdx = 3; // "Elenco" is index 3 in WIZARD_STEPS
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col">
        {rechargeInfo && <RechargeModal info={rechargeInfo} onClose={() => setRechargeInfo(null)} />}
        {/* Header */}
        <div className="relative overflow-hidden border-b border-zinc-800/60">
          <div className={`absolute inset-0 bg-gradient-to-r ${theme.card} opacity-80 pointer-events-none`} />
          <div className="relative px-4 pt-4 pb-5">
            {/* Step indicator */}
            <div className="flex items-center justify-center gap-1.5 mb-4">
              {WIZARD_STEPS.map((label, i) => {
                const active = i === castingStepIdx;
                return (
                  <div key={label} className="flex items-center gap-1.5">
                    <div className="flex flex-col items-center gap-1">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-extrabold transition-all duration-300 ${
                        i < castingStepIdx ? "bg-emerald-600 text-white" :
                        active ? "bg-white text-zinc-900" :
                        "bg-zinc-800 text-zinc-600"
                      }`}>
                        {i < castingStepIdx ? <CheckCircle className="w-3.5 h-3.5" /> : i + 1}
                      </div>
                      <span className={`text-[8px] font-bold uppercase tracking-wider ${active ? "text-white" : "text-zinc-600"}`}>{label}</span>
                    </div>
                    {i < WIZARD_STEPS.length - 1 && (
                      <div className={`w-6 h-0.5 mb-4 rounded-full ${i < castingStepIdx ? theme.bar : "bg-zinc-800"}`} />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900/80 border border-zinc-700 mb-3">
                <Users className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Tu elenco · Elige el retrato de cada personaje</span>
              </div>
              <h1 className="text-xl font-extrabold text-white">Conoce a tus personajes</h1>
              <p className="text-xs text-zinc-500 mt-1">La IA diseñó este elenco para tu historia. Elige el aspecto de cada uno.</p>
            </div>
          </div>
        </div>

        <div className="flex-1 max-w-5xl mx-auto w-full px-4 py-5 space-y-5 pb-32">

          {castError && (
            <div className="flex items-start gap-2 p-3 bg-red-950/40 border border-red-700/40 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{castError}</p>
            </div>
          )}

          {/* Tablero de casting: los personajes uno al lado del otro, como las
              fichas clavadas en la pared de una producción. Antes iban apilados
              en una columna de max-w-lg — para comparar la cara de dos
              personajes había que hacer scroll, que es exactamente lo que no se
              puede hacer mientras eliges entre ellas. */}
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
          {castCharacters.map((char, ci) => (
            <div key={char.name} className={`space-y-3 rounded-2xl border ${theme.border} bg-zinc-900/40 p-3`}>
              {/* Character header */}
              <div className={`flex items-start gap-3 p-3 rounded-xl border bg-gradient-to-br ${theme.card} ${theme.border}`}>
                <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-extrabold text-lg bg-zinc-900 border ${theme.border}`}>
                  {char.gender === "female" ? "👩" : char.gender === "male" ? "👨" : "🧑"}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-extrabold text-white text-sm">{char.name}</p>
                    <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${theme.pill}`}>{char.role}</span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed line-clamp-2">{char.personality}</p>
                  <p className={`text-[10px] font-medium mt-1 ${theme.accent}`}>
                    🎙 {VOICE_PROFILE_LABELS[char.voice_profile] ?? char.voice_profile}
                  </p>
                </div>
              </div>

              {/* Portrait grid */}
              {char.options.length > 0 ? (
                <div>
                  <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-2">Elige su aspecto</p>
                  {/* Los retratos se generan en 9:16 y esta caja era CUADRADA con
                      recorte al centro: al personaje se le cortaba la cabeza.
                      Elegir un rostro sin poder verlo es imposible, y el elenco
                      entero se veía genérico por culpa del encuadre, no del
                      modelo. 3:4 con anclaje arriba conserva la cara y el torso
                      sin volver la tarjeta interminable. */}
                  <div className="grid grid-cols-2 gap-2">
                    {char.options.map((url, oi) => (
                      <button
                        key={oi}
                        onClick={() => setCastCharacters(prev =>
                          prev.map((c, idx) => idx === ci ? { ...c, selectedIdx: oi } : c)
                        )}
                        className={`relative rounded-xl overflow-hidden aspect-[3/4] border-2 transition-all duration-200 ${
                          char.selectedIdx === oi
                            ? `${theme.selected} scale-[1.03] shadow-xl`
                            : "border-zinc-800 hover:border-zinc-600"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={`${char.name} opción ${oi + 1}`} className="w-full h-full object-cover object-top" />
                        {char.selectedIdx === oi && (
                          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg">
                            <CheckCircle className="w-4 h-4 text-white" />
                          </div>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                          <p className="text-[9px] font-bold text-zinc-300">Opción {oi + 1}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="py-3 text-center text-xs text-zinc-600 bg-zinc-900 rounded-xl border border-zinc-800">
                  Sin opciones de retrato generadas
                </div>
              )}
            </div>
          ))}
          </div>

          {/* Divider + skip */}
          <button
            onClick={() => void loadHooks()}
            className="w-full max-w-xs mx-auto block py-3 rounded-xl border border-zinc-800 text-zinc-600 text-xs hover:border-zinc-700 hover:text-zinc-400 transition-all"
          >
            Saltar selección de retratos
          </button>
        </div>

        {/* Fixed bottom CTA */}
        <div className="fixed bottom-0 left-0 right-0 z-20">
          <div className={`absolute inset-0 bg-gradient-to-t ${theme.card} opacity-30 pointer-events-none`} />
          <div className="relative bg-zinc-950/95 backdrop-blur-sm border-t border-zinc-800/60 px-4 py-3 max-w-5xl mx-auto">
            {/* La barra acompaña el ancho del contenido, pero los botones no se
                estiran a 992px: un CTA del ancho de la pantalla deja de leerse
                como un botón. */}
            <div className="flex gap-3 sm:max-w-lg sm:mx-auto">
              <button
                onClick={() => setCastingStep(false)}
                className="flex items-center gap-1.5 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 text-sm font-medium hover:border-zinc-700 transition-all shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => void loadHooks()}
                disabled={hooksLoading}
                className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-extrabold text-white transition-all active:scale-[0.98] shadow-lg ${theme.glow} bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 disabled:opacity-40`}
              >
                {hooksLoading ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Generando gancho…</>
                ) : (
                  <>Confirmar elenco <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── RESULT — auto-redirect splash ───────────────────────────────────────────
  if (result) {
    const sceneCount = result.production_notes?.scene_count ?? result.scenes.length;
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4 relative overflow-hidden">
        <div className={`absolute inset-0 bg-gradient-to-br ${theme.card} opacity-40 pointer-events-none`} />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full blur-3xl opacity-10 pointer-events-none bg-emerald-500" />

        <div className="relative z-10 max-w-sm w-full text-center space-y-6">
          {/* Success icon */}
          <div className="relative mx-auto w-20 h-20">
            <div className="w-20 h-20 rounded-3xl bg-emerald-900/60 border border-emerald-600/40 flex items-center justify-center shadow-2xl">
              <CheckCircle className="w-10 h-10 text-emerald-400" />
            </div>
            <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-400 animate-ping" />
          </div>

          <div>
            <h2 className="text-2xl font-extrabold text-white">¡Historia lista!</h2>
            <p className="text-sm text-zinc-400 mt-1">
              {sceneCount} escenas · {result.production_notes?.total_duration_seconds}s ·{" "}
              <span className={`${theme.accent} capitalize font-medium`}>{result.meta.tone}</span>
            </p>
          </div>

          {/* Hook preview */}
          <div className={`bg-gradient-to-br ${theme.card} border ${theme.border} rounded-2xl p-4 text-left`}>
            <p className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 ${theme.accent}`}>🎣 Tu hook</p>
            <p className="text-sm text-white italic leading-relaxed line-clamp-3">&ldquo;{result.story.hook}&rdquo;</p>
          </div>

          {/* Countdown + status */}
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2 text-zinc-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
              <span>
                {redirectCountdown !== null && redirectCountdown > 0
                  ? `Iniciando producción en ${redirectCountdown}s…`
                  : "Iniciando producción…"}
              </span>
            </div>

            {/* Progress bar countdown */}
            <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-600 to-pink-600 rounded-full transition-all duration-1000"
                style={{ width: redirectCountdown === 2 ? "0%" : redirectCountdown === 1 ? "50%" : "100%" }}
              />
            </div>

            {/* Manual override */}
            <button
              onClick={() => {
                if (redirectTimer.current) clearInterval(redirectTimer.current);
                router.push(dbProjectId ? `/dashboard/projects/${dbProjectId}?autostart=1` : "/dashboard");
              }}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 text-white text-sm font-extrabold shadow-lg"
            >
              <Zap className="w-4 h-4" /> Ir ahora <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── FORM WIZARD ─────────────────────────────────────────────────────────────
  const STEPS = WIZARD_STEPS;

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {rechargeInfo && <RechargeModal info={rechargeInfo} onClose={() => setRechargeInfo(null)} />}

      {/* ── Dynamic header with theme color ── */}
      <div className={`relative overflow-hidden border-b border-zinc-800/60 transition-all duration-500`}>
        <div className={`absolute inset-0 bg-gradient-to-r ${theme.card} opacity-80 pointer-events-none transition-all duration-500`} />
        <div className="relative px-4 pt-4 pb-5">
          {/* Step indicator */}
          <div className="flex items-center justify-center gap-1.5 mb-4">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className="flex flex-col items-center gap-1">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-extrabold transition-all duration-300 ${
                    i < step ? "bg-emerald-600 text-white" :
                    i === step ? "bg-white text-zinc-900" :
                    "bg-zinc-800 text-zinc-600"
                  }`}>
                    {i < step ? <CheckCircle className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  <span className={`text-[8px] font-bold uppercase tracking-wider transition-colors ${i === step ? "text-white" : "text-zinc-600"}`}>{label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-6 h-0.5 mb-4 rounded-full transition-all duration-500 ${i < step ? theme.bar : "bg-zinc-800"}`} />
                )}
              </div>
            ))}
          </div>

          {/* Title */}
          <div className="text-center">
            <h1 className="text-lg font-extrabold text-white">
              {step === 0 && "¿Qué universo quieres crear?"}
              {step === 1 && "Cuéntame tu historia"}
              {step === 2 && "Define tu visión"}
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              {step === 0 && "Elige el nicho y el tono emocional"}
              {step === 1 && "El tema y la duración de tu video"}
              {step === 2 && "Estilo visual, plataforma e idioma"}
            </p>
          </div>
        </div>
      </div>

      {/* ── STEP 0: Universo ─────────────────────────────────────────────────────
          Horizontal y cinematográfico. Elegir el nicho es elegir el MUNDO de una
          película, no llenar un formulario: cada tarjeta lleva el aura de su
          género (el mismo color que después tiñe subtítulos, música e imagen), un
          "telón" que respira, y la selección se siente física — la tarjeta se
          adelanta y las demás se apagan. Ancho completo: en desktop el paso vive
          en una sola pantalla, sin scroll. */}
      {step === 0 && (
        <div className="flex-1 max-w-5xl mx-auto w-full px-4 py-5 space-y-6 pb-32">

          {/* ¿Qué vas a crear? — el formato manda sobre todo lo que sigue:
              una ESCENA no lleva diálogo ni ganchos hablados; un CONSEJO habla
              a cámara. Elegirlo primero hace que cada paso se adapte. */}
          <div>
            <p className="text-xs font-bold text-zinc-400 mb-3">¿Qué vas a crear? <span className="text-red-400">*</span></p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {FORMAT_OPTIONS.map(fo => {
                const activa = form.format === fo.id;
                return (
                  <button key={fo.id} type="button" onClick={() => set("format")(fo.id)}
                    className={`vy-press p-4 rounded-2xl border text-left transition-all ${activa ? "bg-gradient-to-br from-fuchsia-950/60 to-zinc-900 border-fuchsia-500/70 shadow-lg" : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"}`}>
                    <p className={`text-base font-extrabold ${activa ? "text-white" : "text-zinc-300"}`}>{fo.emoji} {fo.label}</p>
                    <p className={`text-[11px] mt-1 leading-snug ${activa ? "text-fuchsia-300/90" : "text-zinc-600"}`}>{fo.hint}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Trending — del formato elegido */}
          <div>
            <div className="flex items-center gap-1.5 mb-2.5">
              <TrendingUp className="w-3.5 h-3.5 text-pink-400" />
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Trending ahora</p>
              <span className="w-1.5 h-1.5 rounded-full bg-pink-500 vy-pulse-soft" />
            </div>
            <div className="flex gap-2 flex-wrap">
              {(form.format === "escena" ? TRENDING_ESCENA : TRENDING).map(t => (
                <button
                  key={t.label}
                  onClick={() => { set("niche")(t.niche); set("tone")(t.tone); const propia = (t as { topic?: string }).topic; if (propia) set("topic")(propia); else { const ideas = QUICK_IDEAS[t.niche] ?? []; if (ideas.length) set("topic")(ideas[0] ?? ""); } }}
                  className="vy-press flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900/80 border border-zinc-800 hover:border-pink-600/70 hover:bg-zinc-800/80 text-xs text-zinc-400 hover:text-white transition-all"
                >
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Nicho — pósters horizontales, 3 columnas */}
          <div>
            <p className="text-xs font-bold text-zinc-400 mb-3">Elige tu universo <span className="text-red-400">*</span></p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {NICHOS.map(n => {
                const t = NICHO_THEME[n.id] ?? DEFAULT_THEME;
                const active = form.niche === n.id;
                const dimmed = Boolean(form.niche) && !active;
                return (
                  <button
                    key={n.id}
                    onClick={() => { set("niche")(n.id); set("sub_niche")(""); setIdeaIdx(0); const compat = TONOS_DEL_UNIVERSO[n.id] ?? []; if (!compat.includes(form.tone) || !toneTouched) set("tone")(compat[0] ?? NICHE_DEFAULT_TONE[n.id] ?? form.tone); }}
                    className={`vy-press relative overflow-hidden rounded-2xl border text-left transition-all duration-300 group ${
                      active
                        ? `bg-gradient-to-br ${t.card} ${t.selected} shadow-2xl scale-[1.03] z-10`
                        : dimmed
                          ? `bg-zinc-900/60 ${t.border} opacity-55 hover:opacity-100 hover:scale-[1.01]`
                          : `bg-zinc-900 ${t.border} hover:scale-[1.02] hover:-translate-y-0.5 hover:shadow-xl`
                    }`}
                  >
                    {/* Aura del género: respira detrás del contenido. En hover se
                        enciende aunque la tarjeta no esté elegida — un vistazo de
                        cómo se siente ese mundo antes de comprometerse. */}
                    <div
                      className={`absolute inset-0 bg-gradient-to-br ${t.card} transition-opacity duration-500 ${active ? "opacity-100" : "opacity-0 group-hover:opacity-60"}`}
                      aria-hidden
                    />
                    <div
                      className={`absolute -top-8 -right-8 w-28 h-28 rounded-full blur-2xl transition-opacity duration-500 ${t.bar} ${active ? "opacity-25 vy-pulse-soft" : "opacity-0 group-hover:opacity-15"}`}
                      style={active ? { animationDuration: "3.2s" } : undefined}
                      aria-hidden
                    />

                    <div className="relative flex items-center gap-3.5 p-4">
                      <span className={`text-4xl shrink-0 transition-transform duration-300 ${active ? "vy-float2 scale-110" : "group-hover:scale-110"}`}>
                        {t.emoji}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold text-white leading-tight">{n.label}</p>
                        <p className={`text-[10px] mt-0.5 transition-colors ${active ? t.accent : "text-zinc-500 group-hover:text-zinc-400"}`}>{t.tagline}</p>
                      </div>
                      {active && <CheckCircle className={`w-4.5 h-4.5 ml-auto shrink-0 ${t.accent}`} style={{ animation: "vyPop .3s ease-out" }} />}
                    </div>

                    {/* Barra de firma: el color del género recorriendo la base,
                        vivo solo en la tarjeta elegida. */}
                    <div className={`relative h-0.5 ${active ? "" : "opacity-0"}`} aria-hidden>
                      <div
                        className={`absolute inset-0 ${t.bar}`}
                        style={{
                          backgroundImage: "linear-gradient(90deg, transparent, rgba(255,255,255,.55), transparent)",
                          backgroundSize: "200% 100%",
                          animation: active ? "vyShimmer2 2.4s linear infinite" : undefined,
                        }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
            {errors.niche && <p className="text-xs text-red-400 mt-2">{errors.niche}</p>}
          </div>

          {/* Sub-nichos */}
          {selectedNicho && (
            <div>
              <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-2">Especialidad</p>
              <div className="flex flex-wrap gap-2">
                {selectedNicho.sub_nichos.map(s => (
                  <button
                    key={s.id}
                    onClick={() => set("sub_niche")(s.id === form.sub_niche ? "" : s.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                      form.sub_niche === s.id ? `${theme.pill} scale-105` : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tono emocional — visual: cada emoción con su cara y color */}
          <div>
            <p className="text-xs font-bold text-zinc-400 mb-1">Tono emocional <span className="text-zinc-600 font-normal">· {form.format === "escena" ? "en una escena pone la energía y la luz — aquí nadie habla" : "se ajusta solo, cámbialo si quieres"}</span></p>
            <p className="text-[10px] text-zinc-600 mb-3">¿Qué quieres que SIENTA quien lo vea? Esto guía toda la historia.</p>
            {/* Cinta horizontal: los nueve tonos en una sola fila en desktop.
                Antes era una grilla 3x3 que estiraba la página hacia abajo y
                dejaba los costados vacíos — justo al revés de cómo se lee una
                pantalla ancha. */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {TONES.filter(t => (TONOS_DEL_UNIVERSO[form.niche] ?? TONES.map(x => x.id)).includes(t.id)).map(t => {
                const v = TONE_VISUAL[t.id] ?? { emoji: "🎬", sub: "", active: theme.pill };
                const active = form.tone === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => { set("tone")(t.id); setToneTouched(true); }}
                    className={`vy-press flex flex-col items-center gap-0.5 px-1.5 py-2.5 rounded-xl border transition-all duration-200 ${
                      active
                        ? `${v.active} scale-[1.06] shadow-lg`
                        : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:-translate-y-0.5"
                    }`}
                  >
                    <span className={`text-xl transition-transform duration-200 ${active ? "scale-125" : ""}`}>{v.emoji}</span>
                    <span className={`text-[11px] font-bold ${active ? "" : "text-zinc-300"}`}>{t.label}</span>
                    <span className={`text-[9px] leading-none ${active ? "opacity-80" : "text-zinc-600"}`}>{v.sub}</span>
                  </button>
                );
              })}
            </div>
            {errors.tone && <p className="text-xs text-red-400 mt-1.5">{errors.tone}</p>}
          </div>

          {/* ── LA CONSOLA HABLA ─────────────────────────────────────────────
              Lectura en vivo del combo: qué se va a producir y qué va a sentir
              quien lo vea. Es el "sentido" de las tres decisiones juntas. */}
          <div className="rounded-2xl border border-fuchsia-500/25 bg-gradient-to-r from-zinc-900 via-zinc-900 to-violet-950/40 px-4 py-3.5 flex items-start gap-3">
            <span className="mt-0.5 w-2 h-2 rounded-full bg-fuchsia-400 vy-pulse-soft shrink-0" />
            <p className="text-[13px] leading-relaxed text-zinc-300">
              <span className="font-bold text-white">Vas a producir</span>{" "}
              {FORMATO_FRASE[form.format] ?? FORMATO_FRASE.story} en el universo{" "}
              <span className="font-bold text-fuchsia-300">{NICHOS.find((n) => n.id === form.niche)?.label ?? form.niche}</span>
              {form.sub_niche ? <> · <span className="text-violet-300">{form.sub_niche}</span></> : null}
              {". "}Quien lo vea va a sentir{" "}
              <span className="font-bold text-pink-300">{SENTIRA[form.tone] ?? "la emoción que elijas"}</span>.
              {form.format === "escena" ? " La cámara y el cuerpo cuentan todo; la música manda." : form.format === "consejo" ? " La protagonista le habla al espectador como a una amiga." : " Gancho en 2 segundos, giro que no se anuncia y clímax en el último cuarto."}
            </p>
          </div>
        </div>
      )}

      {/* ── STEP 1: Historia ── */}
      {step === 1 && (
        <div className="flex-1 max-w-5xl mx-auto w-full px-4 py-5 space-y-4 pb-32">

          {/* Nicho selected badge */}
          {form.niche && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${theme.pill} w-fit`}>
              <span>{theme.emoji}</span>
              <span className="text-xs font-bold capitalize">{form.niche}</span>
              <span className="text-[10px] opacity-60">· {form.tone}</span>
            </div>
          )}

          {/* Dos columnas en desktop: a la izquierda lo que ESCRIBES (la historia
              y su duración), a la derecha lo que te OFRECEMOS (las ideas). Antes
              era una sola columna angosta con todo apilado, y las ideas quedaban
              tan abajo que había que ir a buscarlas justo cuando no sabías qué
              escribir — el momento exacto en que deberían estar a la vista. */}
          <div className="grid lg:grid-cols-5 gap-5 items-start">

          {/* ── Izquierda: tu historia ── */}
          <div className="lg:col-span-3 space-y-5">

          {/* Topic */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-extrabold text-white">{form.format === "escena" ? "Describe lo que se va a ver" : form.format === "consejo" ? "¿Qué pregunta vas a responder?" : "Describe tu historia"} <span className="text-red-400">*</span></p>
              <div className="flex items-center gap-3">
                <button onClick={medirPotencial} disabled={!form.topic.trim() || evaluando} className="flex items-center gap-1 text-xs text-fuchsia-300 hover:text-fuchsia-200 disabled:opacity-40 transition-opacity">
                  {evaluando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />} {evaluando ? "Midiendo…" : "Medir potencial viral"}
                </button>
                {nichoIdeas.length > 0 && (
                  <button onClick={nextIdea} className={`flex items-center gap-1 text-xs ${theme.accent} hover:opacity-80 transition-opacity`}>
                    <RefreshCw className="w-3 h-3" /> Inspirarme
                  </button>
                )}
              </div>
            </div>
            <textarea
              value={form.topic}
              onChange={e => set("topic")(e.target.value)}
              rows={5}
              // El navegador no puede dejar escribir algo que el servidor va a
              // rechazar: antes se podía pegar una premisa larga, esperar la
              // generación entera y recibir un error de validación. El límite
              // vive en el esquema y se importa — no se copia, para que no
              // vuelva a haber dos números distintos.
              maxLength={TOPIC_MAX}
              placeholder={form.format === "escena" ? "Ej: un muñeco antiguo actuando solo frente a la cámara de noche, se mueve cuando nadie lo ve…" : form.format === "consejo" ? "Ej: ¿cómo saber si tu pareja te miente?" : "Ej: Una mujer descubre que su marido lleva doble vida y decide vengarse de forma inesperada…"}
              className={`w-full bg-zinc-900 border rounded-2xl px-4 py-4 text-base text-white placeholder-zinc-600 focus:outline-none transition-all resize-none ${
                errors.topic ? "border-red-700" : `border-zinc-800 focus:${theme.border}`
              }`}
            />
            {errors.topic && <p className="text-xs text-red-400 mt-1">{errors.topic}</p>}
            <div className="flex items-center justify-between mt-1">
              <p className="text-[10px] text-zinc-700">Cuanto más específico, más viral. La IA construye el resto.</p>
              {/* El contador aparece recién cerca del límite: mostrarlo siempre
                  es ruido, y esconderlo del todo deja al usuario chocando contra
                  un tope invisible. */}
              {form.topic.length > TOPIC_MAX * 0.75 && (
                <p className={`text-[10px] tabular-nums ${form.topic.length >= TOPIC_MAX ? "text-red-400" : "text-zinc-600"}`}>
                  {form.topic.length}/{TOPIC_MAX}
                </p>
              )}
            </div>
          </div>

          {/* Motor de Premisas: radar de 8 ejes + 2 reescrituras adoptables.
              FASE 1: aconseja, nunca bloquea — el botón de generar sigue vivo
              con cualquier puntaje. */}
          {evalPremisa && (
            <div className="rounded-2xl border border-fuchsia-500/25 bg-zinc-900/80 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <span className={`text-2xl font-extrabold ${evalPremisa.total >= 75 ? "text-emerald-300" : evalPremisa.total >= 55 ? "text-amber-300" : "text-pink-400"}`}>{Math.round(evalPremisa.total)}<span className="text-sm text-zinc-500">/100</span></span>
                {evalPremisa.arquetipo && <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/15 border border-violet-500/40 text-violet-300 capitalize">{evalPremisa.arquetipo.replace(/_/g, " ")}</span>}
                <p className="text-xs text-zinc-400 leading-snug flex-1">{evalPremisa.veredicto}</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5">
                {evalPremisa.ejes.map((e) => (
                  <div key={e.eje} title={e.nota}>
                    <div className="flex justify-between text-[10px] text-zinc-500 mb-0.5"><span className="capitalize">{e.eje === "identificacion" ? "identificación" : e.eje === "emocion" ? "emoción" : e.eje}</span><span className="font-bold text-zinc-300">{e.puntaje}</span></div>
                    <div className="h-1 rounded-full bg-zinc-800"><div className={`h-1 rounded-full ${e.puntaje >= 7 ? "bg-emerald-400" : e.puntaje >= 5 ? "bg-amber-400" : "bg-pink-500"}`} style={{ width: `${e.puntaje * 10}%` }} /></div>
                  </div>
                ))}
              </div>
              {evalPremisa.mejoras.length > 0 && (
                <div className="space-y-2 pt-1">
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Así sube — toca para usar</p>
                  {evalPremisa.mejoras.map((m, i) => (
                    <button key={i} onClick={() => { set("topic")(m.slice(0, TOPIC_MAX)); setEvalPremisa(null); }} className="vy-press w-full text-left text-xs text-zinc-300 leading-snug p-3 rounded-xl bg-zinc-800/60 border border-zinc-700 hover:border-fuchsia-500/60">
                      <span className="font-bold text-fuchsia-300 mr-1.5">{i === 0 ? "Fiel" : "Agresiva"} →</span>{m}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* El formato YA se eligió en el paso 1 — repetir el selector acá era
              decidir lo mismo dos veces. Queda un chip con lo elegido (y volver
              atrás si se quiere cambiar) + el aviso inteligente cuando la
              premisa suena a otro formato. */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-700 text-xs text-zinc-300">
              Estás creando: <span className="font-extrabold text-white">{FORMAT_OPTIONS.find(x => x.id === form.format)?.emoji} {FORMAT_OPTIONS.find(x => x.id === form.format)?.label ?? "Una historia"}</span>
            </span>
            <button type="button" onClick={() => setStep(0)} className="text-[11px] text-fuchsia-300 hover:text-fuchsia-200 underline underline-offset-2">cambiar</button>
            {form.format === "story" && /^\s*¿?\s*(c[oó]mo|qu[eé] hacer|por ?qu[eé]|\d+\s+(señales|formas|razones|errores|cosas|pasos|trucos|tips|hábitos|frases)|señales de|deja de|how to|why)(?=\s|$|[?:,¿])/i.test(form.topic) && (
              <button type="button" onClick={() => set("format")("consejo")} className="text-[11px] px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/40 text-amber-300 hover:bg-amber-500/20">
                💡 Tu idea suena a consejo — tocá para cambiarla a "Un consejo"
              </button>
            )}
          </div>

          {/* Duración — vive junto a la historia porque es parte de ella: cuántas
              escenas caben cambia lo que se puede contar, no es una preferencia
              técnica suelta. */}
          <div>
            <p className="text-xs font-bold text-zinc-400 mb-3">¿Cuánto dura?</p>
            {/* Solo se ofrecen duraciones que la producción entrega de verdad: la
                opción se filtra contra videoSecondsFor(), la MISMA función que
                usa el pipeline. Antes la lista prometía 20 minutos y salían 60
                segundos; derivándola de la fuente de verdad no puede repetirse. */}
            <div className="grid grid-cols-3 gap-2">
              {DURATION_OPTIONS.filter(d => videoSecondsFor(d.id) === segundosDe(d.id)).map(d => {
                const activa = form.duration_target === d.id;
                return (
                  <button
                    key={d.id}
                    onClick={() => set("duration_target")(d.id)}
                    className={`vy-press relative p-4 rounded-xl border text-left transition-all ${
                      activa ? `bg-gradient-to-br ${theme.card} ${theme.border} shadow-lg` : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"
                    }`}
                  >
                    {d.recomendada && (
                      <span className="absolute -top-2 right-2 text-[9px] font-extrabold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-emerald-500 text-black">
                        Recomendado
                      </span>
                    )}
                    <p className={`text-sm font-extrabold ${activa ? "text-white" : "text-zinc-300"}`}>{d.label}</p>
                    <p className={`text-[11px] mt-1 leading-snug ${activa ? theme.accent : "text-zinc-600"}`}>{d.hint}</p>
                    {/* El costo se ve ANTES de generar, cambia con la duración, y
                        sale del precio que el SERVIDOR va a cobrar. */}
                    {navosPor60s !== null && (
                      <p className="text-[10px] mt-1 font-bold text-violet-300/80">
                        {precioLegible(Math.round(navosPor60s * (videoSecondsFor(d.id) / 60)))}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
            {/* Aviso medido, no teórico: la misma premisa a 30s terminó en carnada
                (el consejo 5 "no te lo puedo decir") y a 60s entregó el pico al 93%.
                Con 3 personajes o en formato consejo, 30s no alcanza. */}
            {form.duration_target === "30s" && (form.format === "consejo" || castCharacters.length >= 3) && (
              <p className="text-[10px] text-amber-300/80 mt-2">
                {form.format === "consejo"
                  ? "En 30 segundos un consejo casi nunca alcanza a dar la respuesta al final. Con 60 sí entra."
                  : "Con 3 personajes, 30 segundos se quedan cortos: cada uno habla dos veces y la sorpresa llega apurada. Con 60 la historia respira."}
              </p>
            )}
            <p className="text-[10px] text-zinc-600 mt-2">
              ¿Necesitas más minutos? Se hacen como <span className="text-zinc-400">serie de episodios</span> — es el formato que se vuelve viral, y luego se unen en un video largo.
            </p>
          </div>

          {/* ── BORRADOR o ESTRENO ──
              Casi todo el costo de un video está en animar. Con un borrador el
              usuario prueba diez premisas por lo que hoy cuesta una, y paga el
              render caro solo cuando la historia ya lo convenció. */}
          <div>
            <p className="text-xs font-bold text-zinc-400 mb-3">¿Para qué es?</p>
            <div className="grid grid-cols-2 gap-2">
              {([
                { id: "borrador", t: "Para verla primero", s: "borrador", d: "Ves la historia completa con voz e imágenes en movimiento suave. Ideal para decidir si vale la pena." },
                { id: "estreno", t: "Para publicar", s: "estreno", d: "Personajes que se mueven y hablan de verdad, listo para TikTok, Reels o Shorts." },
              ] as const).map(q => {
                const activa = calidad === q.id;
                const navos = navosPor60s === null ? null
                  : Math.round((q.id === "borrador" ? BORRADOR_NAVOS : navosPor60s) * (videoSecondsFor(form.duration_target) / 60));
                return (
                  <button
                    key={q.id}
                    onClick={() => setCalidad(q.id)}
                    className={`vy-press p-4 rounded-xl border text-left transition-all ${
                      activa ? `bg-gradient-to-br ${theme.card} ${theme.border} shadow-lg` : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-baseline gap-2">
                      <p className={`text-sm font-extrabold ${activa ? "text-white" : "text-zinc-300"}`}>{q.t}</p>
                      <p className={`text-[9px] ${activa ? theme.accent : "text-zinc-600"}`}>{q.s}</p>
                    </div>
                    <p className="text-[10px] text-zinc-500 leading-tight mt-0.5">{q.d}</p>
                    {navos !== null && (
                      <p className="text-[10px] mt-1 font-bold text-violet-300/80">{precioLegible(navos)}</p>
                    )}
                  </button>
                );
              })}
            </div>
            {calidad === "borrador" && (
              <p className="text-[10px] text-emerald-400/80 mt-2">
                ✓ Si te gusta, la conviertes en la versión para publicar después — y solo pagas la diferencia: el guion, los personajes y las imágenes ya están hechos.
              </p>
            )}
          </div>

          {/* ── RESUMEN EN UNA LÍNEA ──
              Tres filas de decisiones son mucho para leer de golpe. Esta línea
              las junta en una frase que cualquiera entiende, con el precio en
              NAVOS y en dólares, ANTES de apretar generar. */}
          {navosPor60s !== null && (() => {
            const seg = videoSecondsFor(form.duration_target);
            const navos = Math.round((calidad === "borrador" ? BORRADOR_NAVOS : navosPor60s) * (seg / 60));
            return (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
                <p className="text-[11px] text-zinc-500 mb-0.5">Vas a producir</p>
                <p className="text-sm text-zinc-200">
                  <span className="font-extrabold text-white">{form.format === "consejo" ? "Un consejo" : form.format === "escena" ? "Una escena" : "Una historia"}</span>
                  {" · "}<span className="font-bold">{seg} segundos</span>
                  {" · "}<span className="font-bold">{calidad === "borrador" ? "para verla primero" : "lista para publicar"}</span>
                </p>
                <p className="text-[11px] mt-1 font-bold text-violet-300/90">
                  {precioLegible(navos)}
                  {credits !== null && (
                    <span className="font-normal text-zinc-500"> · te quedan {Math.max(0, credits - navos).toLocaleString("es")} NAVOS después</span>
                  )}
                </p>
              </div>
            );
          })()}

          </div>

          {/* ── Derecha: de dónde sacar la idea ── */}
          <div className="lg:col-span-2 space-y-4">

          {/* ── Claude sugiere historias según la emoción elegida ── */}
          <div className="rounded-2xl border border-violet-800/40 bg-gradient-to-br from-violet-950/40 to-zinc-900/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg vy-grad-bg grid place-items-center text-sm shrink-0">✨</span>
                <div>
                  <p className="text-sm font-bold text-white leading-tight">¿No sabes qué contar?</p>
                  <p className="text-[11px] text-zinc-400 leading-tight">Claude te sugiere historias de <span className="text-violet-300 font-semibold">{form.tone || "tu emoción"}</span></p>
                </div>
              </div>
              <button
                onClick={() => void suggestStories()}
                disabled={suggestLoading}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-extrabold text-white vy-grad-bg vy-press disabled:opacity-50"
              >
                {suggestLoading
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Pensando…</>
                  : <><Sparkles className="w-3.5 h-3.5" /> {aiSuggestions.length ? "Otra vez" : "Sugerir"}</>}
              </button>
            </div>

            {suggestError && <p className="text-[11px] text-red-400 mt-2">{suggestError}</p>}

            {aiSuggestions.length > 0 && (
              <div className="space-y-2 mt-3">
                {aiSuggestions.map((s, i) => {
                  const active = form.topic === s.premise;
                  return (
                    <button
                      key={i}
                      onClick={() => set("topic")(s.premise)}
                      style={{ animationDelay: `${i * 90}ms` }}
                      className={`vy-fadeup opacity-0 w-full text-left rounded-xl border p-3 transition-all ${
                        active ? `bg-gradient-to-r ${theme.card} ${theme.border}` : "bg-zinc-900/80 border-zinc-800 hover:border-violet-700/50"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="text-lg shrink-0">{s.emoji}</span>
                        <div className="min-w-0">
                          <p className={`text-xs font-bold leading-tight ${active ? "text-white" : "text-violet-200"}`}>{s.title}</p>
                          {/* El GANCHO en la tarjeta, no la premisa entera: la premisa rica
                              son seis renglones de 11px y una tarjeta que hay que
                              leer no se elige, se saltea. La premisa completa igual
                              viaja al guion cuando se toca. */}
                          <p className="text-[11px] text-zinc-400 leading-snug mt-0.5 line-clamp-2">{s.gancho ?? s.premise}</p>
                        </div>
                        {active && <CheckCircle className="w-4 h-4 text-violet-300 shrink-0 ml-auto" />}
                      </div>
                    </button>
                  );
                })}
                <p className="text-[10px] text-zinc-600 text-center">Toca una para usarla · puedes editarla arriba</p>
              </div>
            )}
          </div>

          {/* Quick ideas */}
          {nichoIdeas.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Ideas para {form.niche}</p>
                {nichoIdeas.length > 3 && (
                  <button
                    onClick={() => setIdeaIdx(v => (v + 3) % nichoIdeas.length)}
                    className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide ${theme.accent} hover:opacity-80 transition-opacity`}
                  >
                    <RefreshCw className="w-3 h-3" /> Otras
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {trioIdeas.map((idea, i) => (
                  <button
                    key={`${ideaIdx}-${i}`}
                    onClick={() => set("topic")(idea)}
                    className={`w-full text-left px-4 py-3 rounded-xl border transition-all group ${
                      form.topic === idea
                        ? `bg-gradient-to-r ${theme.card} ${theme.border}`
                        : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"
                    }`}
                  >
                    <span className={`text-[10px] font-bold uppercase mr-2 ${theme.accent}`}>Idea {i + 1}</span>
                    <span className="text-xs text-zinc-300 leading-relaxed">{idea}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          </div>
          </div>
        </div>
      )}

      {/* ── STEP 2: Visión ── */}
      {step === 2 && (
        <div className="flex-1 max-w-5xl mx-auto w-full px-4 py-5 pb-32">

          {/* Mismo criterio que los pasos anteriores: dos columnas. A la izquierda
              lo que se MIRA (el estilo, la cara del personaje), a la derecha lo
              que se DECIDE (plataforma, idioma, notas). */}
          <div className="grid lg:grid-cols-5 gap-5 items-start">

          {/* ── Izquierda: lo visual ── */}
          <div className="lg:col-span-3 space-y-5">

          {/* Estilo visual — el MISMO fotograma renderizado en los cinco estilos
              (generados con nano-banana): el usuario compara el estilo, no la
              suerte. El fotograma manda: el texto vive sobre la imagen en un
              degradado, no en una franja gris aparte — como se rotula un still
              de película, no una opción de formulario. */}
          <div>
            <div className="flex items-baseline justify-between mb-3">
              <p className="text-xs font-bold text-zinc-400">Estilo visual</p>
              <p className="text-[10px] text-zinc-600">La misma escena · así se verá tu historia</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {VISUAL_STYLES.map(v => {
                const active = form.visual_style === v.id;
                const thumb = STYLE_THUMB[v.id] ?? STYLE_THUMB.cinematic!;
                return (
                  <button
                    key={v.id}
                    onClick={() => set("visual_style")(v.id)}
                    className={`group relative rounded-xl overflow-hidden border-2 text-left transition-all duration-300 ${
                      active
                        ? `${theme.selected} shadow-xl scale-[1.02] z-10`
                        : "border-zinc-800/80 hover:border-zinc-600 hover:-translate-y-0.5 hover:shadow-lg"
                    }`}
                  >
                    <div className="relative aspect-video overflow-hidden bg-zinc-900">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {/* Carga inmediata: estas cinco imágenes SON el paso — el
                          usuario llega aquí a mirarlas, no hay nada que diferir. */}
                      <img src={thumb.img} alt={`Estilo ${v.label}`}
                        className={`absolute inset-0 w-full h-full object-cover transition-transform duration-500 ${active ? "scale-[1.04]" : "group-hover:scale-[1.06]"}`} />
                      {/* Degradado para rotular sobre el fotograma */}
                      <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/90 via-black/35 to-transparent" />
                      {/* Los no elegidos se apagan un poco cuando hay elegido */}
                      {!active && form.visual_style && <div className="absolute inset-0 bg-black/35 group-hover:bg-transparent transition-colors duration-300" />}
                      {active && (
                        <span className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-sm border border-white/20">
                          <CheckCircle className={`w-3 h-3 ${theme.accent}`} />
                          <span className="text-[8px] font-bold uppercase tracking-wider text-white">Tu estilo</span>
                        </span>
                      )}
                      <div className="absolute bottom-0 inset-x-0 px-2.5 pb-2">
                        <p className="text-xs font-extrabold text-white leading-tight drop-shadow">{v.label}</p>
                        <p className="text-[9px] text-zinc-300/90 leading-tight truncate">{v.description}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Personaje recurrente (opcional) */}
          {savedCharacters.length > 0 && (
            <div>
              <p className="text-xs font-bold text-zinc-400 mb-3">
                Personaje <span className="text-zinc-600 font-normal">· reusa el mismo en esta historia (opcional)</span>
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                <button
                  onClick={() => setCharacterId(null)}
                  className={`flex-shrink-0 w-20 rounded-xl border p-2 text-center transition-all ${
                    characterId === null ? `bg-gradient-to-br ${theme.card} ${theme.border}` : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"
                  }`}
                >
                  <div className="w-full aspect-square rounded-lg bg-zinc-800 grid place-items-center mb-1">
                    <span className="text-lg">✨</span>
                  </div>
                  <p className="text-[10px] font-semibold text-zinc-300 truncate">Nuevo</p>
                </button>
                {savedCharacters.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCharacterId(c.id)}
                    className={`flex-shrink-0 w-20 rounded-xl border p-2 text-center transition-all ${
                      characterId === c.id ? `bg-gradient-to-br ${theme.card} ${theme.border}` : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"
                    }`}
                  >
                    <div className="w-full aspect-square rounded-lg bg-zinc-950 overflow-hidden mb-1">
                      {c.reference_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={c.reference_image_url} alt={c.name} className="w-full h-full object-cover" />
                      ) : null}
                    </div>
                    <p className="text-[10px] font-semibold text-white truncate">{c.name}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          </div>

          {/* ── Derecha: lo que se decide ── */}
          <div className="lg:col-span-2 space-y-5">

          {/* Platform + Language */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-bold text-zinc-400 mb-2.5">Plataforma</p>
              <div className="space-y-1.5">
                {PLATFORMS.map(p => {
                  const active = form.target_platform === p.id;
                  const t = PLATFORM_THUMB[p.id] ?? PLATFORM_THUMB.tiktok!;
                  return (
                    <button
                      key={p.id}
                      onClick={() => set("target_platform")(p.id)}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl border text-xs font-medium text-left transition-all ${
                        active ? `${theme.pill} border font-bold` : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                      }`}
                    >
                      {/* Mini frame con la proporción real de la plataforma */}
                      <span className="relative h-7 grid place-items-center shrink-0" style={{ width: 28 }}>
                        <span className="grid place-items-center rounded-[3px] text-[9px]"
                          style={{ aspectRatio: t.ratio, height: t.ratio === "16 / 9" ? 16 : 28, background: t.tint }}>
                          {t.icon}
                        </span>
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block truncate">{p.label}</span>
                        <span className={`block text-[9px] ${active ? "opacity-70" : "text-zinc-600"}`}>{p.aspect_ratio}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-zinc-400 mb-2.5">Idioma</p>
              <div className="space-y-1.5">
                {[{ value: "es", flag: "🇲🇽", label: "Español", native: "Latino" }, { value: "en", flag: "🇺🇸", label: "English", native: "US" }, { value: "pt", flag: "🇧🇷", label: "Português", native: "Brasil" }].map(l => {
                  const active = form.language === l.value;
                  return (
                    <button
                      key={l.value}
                      onClick={() => set("language")(l.value)}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl border text-xs font-medium text-left transition-all ${
                        active ? `${theme.pill} border font-bold` : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                      }`}
                    >
                      <span className="w-7 h-7 rounded-lg bg-zinc-950/60 grid place-items-center text-base shrink-0 border border-white/5">{l.flag}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block truncate">{l.label}</span>
                        <span className={`block text-[9px] ${active ? "opacity-70" : "text-zinc-600"}`}>{l.native}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Instrucciones adicionales — plegadas: la mayoría no las usa, y un
              textarea vacío siempre visible es ruido en el paso de decisión.
              Si ya traen texto, se muestran abiertas. */}
          <div>
            {form.additional_instructions || notasAbiertas ? (
              <>
                <p className="text-xs font-bold text-zinc-400 mb-2">Instrucciones adicionales <span className="text-zinc-700">(opcional)</span></p>
                <textarea
                  value={form.additional_instructions}
                  onChange={e => set("additional_instructions")(e.target.value)}
                  rows={2}
                  autoFocus={notasAbiertas && !form.additional_instructions}
                  placeholder="Ej: La protagonista debe ser mayor de 50 años. Incluir giro inesperado al final."
                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-zinc-700 rounded-xl px-4 py-3 text-xs text-zinc-300 placeholder-zinc-700 focus:outline-none resize-none transition-all"
                />
              </>
            ) : (
              <button
                onClick={() => setNotasAbiertas(true)}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                + Agregar instrucciones para la IA <span className="text-zinc-700">(opcional)</span>
              </button>
            )}
          </div>

          {/* Calidad premium — un solo nivel, el mejor. Va al final de la columna
              derecha, pegado al botón: lo último que ves antes de gastar es
              cuánto cuesta. */}
          <div className="vy-glass rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl vy-grad-bg flex items-center justify-center shrink-0 text-xl">🗣️</div>
            <p className="flex-1 text-sm font-bold vy-grad-text">Generar video</p>
            <span className="text-[11px] font-bold text-violet-300 shrink-0">{CREDIT_COST_BY_TIER.talking.toLocaleString("es")} NAVOS</span>
          </div>

          {/* Error */}
          {genError && (
            <div className="flex items-start gap-2 p-3 bg-red-950/40 border border-red-700/40 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{genError}</p>
            </div>
          )}

          </div>
          </div>
        </div>
      )}

      {/* ── Fixed bottom nav ── */}
      <div className="fixed bottom-0 left-0 right-0 z-20">
        <div className={`absolute inset-0 bg-gradient-to-t ${theme.card} opacity-30 pointer-events-none`} />
        <div className="relative bg-zinc-950/95 backdrop-blur-sm border-t border-zinc-800/60 px-4 py-3 max-w-5xl mx-auto">
          {credits === 0 && (
            <div className="flex items-center gap-2 mb-2.5 p-2.5 bg-red-950/40 border border-red-800/40 rounded-xl">
              <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <p className="text-xs text-red-300">Sin NAVOS. <a href="/pricing" className="underline font-bold">Recargar →</a></p>
            </div>
          )}
          {/* La barra acompaña el ancho del contenido, pero los botones no se
              estiran a 992px: un CTA del ancho de la pantalla deja de leerse
              como un botón. */}
          <div className="flex gap-3 sm:max-w-lg sm:mx-auto">
            {step > 0 && (
              <button
                onClick={goBack}
                className="flex items-center gap-1.5 px-4 py-3 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 text-sm font-medium hover:border-zinc-700 transition-all shrink-0"
              >
                <ArrowLeft className="w-4 h-4" /> Atrás
              </button>
            )}
            {step < 2 ? (
              <button
                onClick={goNext}
                className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-extrabold text-white transition-all active:scale-[0.98] shadow-lg ${theme.glow} bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500`}
              >
                Continuar <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => void loadCasting()}
                disabled={credits === 0 || castingLoading}
                className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-extrabold text-white transition-all active:scale-[0.98] shadow-lg ${theme.glow} bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {castingLoading ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Diseñando el elenco…</>
                ) : (
                  <><Users className="w-4 h-4" /> Conocer mi elenco <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
