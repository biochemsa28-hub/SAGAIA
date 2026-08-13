// ─── Router de proveedores de video ──────────────────────────────────────────
// Hasta hoy el pipeline hablaba directo con fal. El día que fal contestó "User is
// locked. Reason: Exhausted balance." el producto entero se detuvo: no hay video
// que salga, ni caro ni barato, aunque el modelo que necesitamos se venda en
// otras tres puertas. Un solo proveedor no es una dependencia técnica, es un
// interruptor de apagado en manos ajenas.
//
// Esta capa hace tres cosas y ninguna más:
//   1. Elige proveedor según lo que el plano NECESITA (borrador, normal, pico).
//   2. Si el elegido no acepta el trabajo, prueba el siguiente.
//   3. Recuerda QUIÉN encoló cada clip, para preguntarle a ese y no a otro.
//
// El punto 3 no es un detalle. Ya nos costó un video entero: reference-to-video e
// image-to-video son colas distintas dentro del MISMO proveedor, y preguntar en
// la equivocada es un 404 que mata el trabajo por tiempo de espera. Con varios
// proveedores el problema se multiplica, así que la identidad viaja pegada al
// identificador en vez de deducirse.

export type TipoDePlano = "borrador" | "normal" | "pico";

export type PeticionDeClip = {
  prompt: string;
  imageUrl?: string;
  endImageUrl?: string;
  /** Personajes como referencia. Su presencia ES lo que define un pico. */
  referenceImageUrls?: string[];
  segundos: number;
  resolucion: string;
  generarAudio?: boolean;
  escena: number;
};

export type EstadoDeClip = {
  status: "queued" | "in_progress" | "completed" | "failed";
  url?: string;
  error?: string;
};

export type Proveedor = {
  /** Corto y estable: viaja dentro del identificador del trabajo. */
  nombre: string;
  modelo: string;
  sirvePara: TipoDePlano[];
  /** Tiene credenciales configuradas. Un proveedor sin llave no se intenta. */
  disponible: () => boolean;
  /** Para que el gasto quede bien contado por cola, no por promedio. */
  costoPorSegundo: (resolucion: string) => number;
  enviar: (p: PeticionDeClip) => Promise<string>;
  consultar: (requestId: string) => Promise<EstadoDeClip>;
};

// ── Registro ─────────────────────────────────────────────────────────────────

const REGISTRO = new Map<string, Proveedor>();

export function registrarProveedor(p: Proveedor): void {
  if (p.nombre.includes(SEP)) throw new Error(`Nombre de proveedor inválido: "${p.nombre}"`);
  REGISTRO.set(p.nombre, p);
}

export function proveedorPorNombre(nombre: string): Proveedor | undefined {
  return REGISTRO.get(nombre);
}

// ── La identidad del clip ────────────────────────────────────────────────────
// "proveedor::modelo". Se guarda en el campo `model` que ya viaja de punta a
// punta (submit → worker → collect), así que no hace falta migrar nada.
const SEP = "::";

export function armarHandle(p: Proveedor): string {
  return `${p.nombre}${SEP}${p.modelo}`;
}

/** Un `model` viejo —sin separador— es de antes del router: era fal por
 *  definición, y se resuelve contra el proveedor que declare ese modelo. */
export function proveedorDeHandle(handle?: string): Proveedor | undefined {
  if (!handle) return undefined;
  const i = handle.indexOf(SEP);
  if (i > 0) return REGISTRO.get(handle.slice(0, i));
  for (const p of REGISTRO.values()) if (p.modelo === handle) return p;
  return undefined;
}

export function modeloDeHandle(handle?: string): string | undefined {
  if (!handle) return undefined;
  const i = handle.indexOf(SEP);
  return i > 0 ? handle.slice(i + SEP.length) : handle;
}

// ── Elección ─────────────────────────────────────────────────────────────────
// El orden es EXPLÍCITO, no "el más barato disponible". Un proveedor más barato
// puede ser más lento o peor, y esa decisión se toma mirando videos, no precios:
// VIDEO_PROVIDER_ORDER="byteplus-referencias,fal-referencias" la cambia sin tocar
// código. Lo que no esté nombrado va después, en orden de registro.
function ordenPreferido(): string[] {
  return (process.env.VIDEO_PROVIDER_ORDER ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
}

export function candidatosPara(tipo: TipoDePlano): Proveedor[] {
  const aptos = [...REGISTRO.values()].filter((p) => p.sirvePara.includes(tipo) && p.disponible());
  const orden = ordenPreferido();
  if (!orden.length) return aptos;
  const puesto = (p: Proveedor) => {
    const i = orden.indexOf(p.nombre);
    return i === -1 ? orden.length : i;
  };
  return [...aptos].sort((a, b) => puesto(a) - puesto(b));
}

export type ClipEncolado = { requestId: string; handle: string; proveedor: Proveedor };

/** Encola el clip en el primer proveedor que lo acepte. Si ninguno acepta, lanza
 *  con TODOS los motivos: cuando la producción falla, "no se pudo" no sirve —
 *  hay que poder leer si fue saldo, cuota o un prompt rechazado. */
export async function encolarClip(tipo: TipoDePlano, peticion: PeticionDeClip): Promise<ClipEncolado> {
  const candidatos = candidatosPara(tipo);
  if (!candidatos.length) {
    throw new Error(`Sin proveedor disponible para un plano de tipo "${tipo}" (¿faltan credenciales?)`);
  }
  const fallos: string[] = [];
  for (const p of candidatos) {
    try {
      const requestId = await p.enviar(peticion);
      if (fallos.length) {
        console.warn(`[router] escena ${peticion.escena}: ${fallos.length} proveedor(es) fallaron, encolado en ${p.nombre}`);
      }
      return { requestId, handle: armarHandle(p), proveedor: p };
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      fallos.push(`${p.nombre}: ${motivo.slice(0, 160)}`);
      console.warn(`[router] escena ${peticion.escena}: ${p.nombre} rechazó el clip — ${motivo.slice(0, 160)}`);
    }
  }
  throw new Error(`Ningún proveedor aceptó el clip (${tipo}). ${fallos.join(" | ")}`);
}

/** Se le pregunta SIEMPRE a quien encoló. */
export async function consultarClip(requestId: string, handle?: string): Promise<EstadoDeClip> {
  const p = proveedorDeHandle(handle);
  if (!p) {
    return { status: "failed", error: `No hay proveedor registrado para "${handle ?? "(sin handle)"}"` };
  }
  return p.consultar(requestId);
}

/** El costo real de ese clip, en la cola donde de verdad se generó. */
export function costoDeClip(handle: string | undefined, segundos: number, resolucion: string): number {
  const p = proveedorDeHandle(handle);
  return p ? p.costoPorSegundo(resolucion) * Math.max(1, segundos) : 0;
}

export function resumenDeProveedores(): string {
  const filas = [...REGISTRO.values()].map(
    (p) => `${p.nombre}${p.disponible() ? "" : " (sin credenciales)"} → ${p.sirvePara.join("/")}`,
  );
  return filas.join(" · ") || "(ninguno registrado)";
}
