// Números EN LETRAS en el guion. Medido en video terminado: "Te vi en la foto,
// Osvaldo. La de 1962." — la voz dijo "la de Quiño en su óxido". El modelo de
// video lee los dígitos como puede, y el juez de voz no lo ve porque su
// normalizador descarta todo lo que no es letra: "1962" desaparece del guion y
// de la transcripción a la vez, y la línea pasa con 100%.
//
// Así que los números se escriben en letras ANTES de guardar: la voz lee
// "mil novecientos sesenta y dos" (lo pronuncia bien), el subtítulo lo muestra
// igual (el guion manda sobre Whisper) y el juez puede compararlo.
//
// Cubre 0–999.999, horas ("3:30" → "tres y media" no: se deja "tres treinta"),
// porcentajes y ordinales comunes. Lo que no reconoce, lo deja como está.
const UNIDADES = ["cero","uno","dos","tres","cuatro","cinco","seis","siete","ocho","nueve","diez","once","doce","trece","catorce","quince","dieciséis","diecisiete","dieciocho","diecinueve","veinte","veintiuno","veintidós","veintitrés","veinticuatro","veinticinco","veintiséis","veintisiete","veintiocho","veintinueve"];
const DECENAS = ["","","veinte","treinta","cuarenta","cincuenta","sesenta","setenta","ochenta","noventa"];
const CENTENAS = ["","ciento","doscientos","trescientos","cuatrocientos","quinientos","seiscientos","setecientos","ochocientos","novecientos"];

function hastaMil(n: number): string {
  if (n < 30) return UNIDADES[n]!;
  if (n < 100) { const d = Math.floor(n / 10), u = n % 10; return u ? `${DECENAS[d]} y ${UNIDADES[u]}` : DECENAS[d]!; }
  if (n === 100) return "cien";
  const c = Math.floor(n / 100), r = n % 100;
  return r ? `${CENTENAS[c]} ${hastaMil(r)}` : CENTENAS[c]!;
}

export function numeroALetras(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n > 999_999 || Math.floor(n) !== n) return String(n);
  if (n < 1000) return hastaMil(n);
  const miles = Math.floor(n / 1000), r = n % 1000;
  const m = miles === 1 ? "mil" : `${hastaMil(miles)} mil`;
  return r ? `${m} ${hastaMil(r)}` : m;
}

// "1962" → "mil novecientos sesenta y dos"; "3 años" → "tres años"; "50%" → "cincuenta por ciento";
// "1.500" / "1,500" → "mil quinientos"; "7:30" → "siete treinta"; "2ª"/"1er" → "segunda"/"primer".
export function numerosEnLetras(texto: string): string {
  if (!/\d/.test(texto)) return texto;
  let t = texto;
  t = t.replace(/\b(\d{1,2}):(\d{2})\b/g, (_, h, m) => `${numeroALetras(Number(h))} ${Number(m) === 0 ? "en punto" : numeroALetras(Number(m))}`);
  t = t.replace(/\b(\d+)\s?%/g, (_, n) => `${numeroALetras(Number(n))} por ciento`);
  const ORD: Record<string, [string, string]> = { "1": ["primer", "primera"], "2": ["segundo", "segunda"], "3": ["tercer", "tercera"], "4": ["cuarto", "cuarta"], "5": ["quinto", "quinta"] };
  t = t.replace(/\b([1-5])(º|°|er|o|ª|a)(?=\s|$|[,.;:!?])/g, (m0, n, suf) => {
    const o = ORD[n as string]; if (!o) return m0;
    return /ª|a/.test(suf) ? o[1] : o[0];
  });
  t = t.replace(/\b\d{1,3}(?:[.,]\d{3})+\b/g, (m0) => numeroALetras(Number(m0.replace(/[.,]/g, ""))));
  t = t.replace(/\b\d+\b/g, (m0) => (m0.length > 6 ? m0 : numeroALetras(Number(m0))));
  // Mayúscula si el número abría la oración.
  t = t.replace(/(^|[.!?¿¡]\s*)([a-záéíóú])/g, (_, p, c) => p + c.toUpperCase());
  return t;
}

// Aplica a todas las líneas del guion; devuelve cuántas cambió (para el log).
export function guionEnLetras(escenas: Array<{ scene_number?: number; narration_text?: string | null }>): number {
  let n = 0;
  for (const e of escenas) {
    const antes = e.narration_text ?? "";
    const despues = numerosEnLetras(antes);
    if (despues !== antes) { e.narration_text = despues; n++; console.log(`[números] esc ${e.scene_number ?? "?"}: «${antes}» → «${despues}»`); }
  }
  return n;
}
