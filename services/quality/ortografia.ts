// Corrector ortográfico del guion — solo erratas, nunca reescrituras.
//
// Medido en producción: el guionista escribió "Anoche fui al faño" (baño). El
// clip lo pronunció tal cual, "faño", y el espectador oyó una palabra que no
// existe en el momento más serio de la historia. El texto del guion es lo que
// se ACTÚA (Seedance lo lee literal), así que una letra mal costó un clip.
//
// La regla de esta pasada: se le pide a Claude que corrija SOLO tipeos y
// ortografía, y encima se acepta cada línea corregida solo si cambió poco
// (misma cantidad de palabras y ≤ 3 caracteres de distancia). Una "corrección"
// que reescribe la frase se descarta — la voz del guion no se toca.
type Escena = { scene_number?: number; narration_text?: string | null };

const ORTOGRAFIA = (process.env.ORTOGRAFIA_GATE ?? "on").toLowerCase();

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n]!;
}

const palabras = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export async function corregirOrtografia(
  escenas: Escena[],
  nombres: string[] = [],
): Promise<{ corregidas: number; cambios: Array<{ escena: number; antes: string; despues: string }> }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const vacio = { corregidas: 0, cambios: [] as Array<{ escena: number; antes: string; despues: string }> };
  if (ORTOGRAFIA === "off" || !apiKey) return vacio;
  const lineas = escenas.map((e) => (e.narration_text ?? "").trim());
  if (!lineas.some(Boolean)) return vacio;

  const pedido =
    "Sos corrector ortográfico de un guion en español. Corregí SOLO erratas y faltas de ortografía " +
    "(letras cambiadas o faltantes, tildes, mayúsculas de nombres). NO cambies palabras por sinónimos, " +
    "NO reordenes, NO agregues ni quites nada, NO 'mejores' el estilo. Los nombres propios del elenco son " +
    (nombres.length ? `exactamente: ${nombres.join(", ")} — ` : "") +
    "respetalos letra por letra. Si una línea está bien, devolvela IDÉNTICA.\n" +
    "Devolvé SOLO un JSON con la misma cantidad de líneas, en el mismo orden: {\"lineas\": [\"...\", ...]}\n\n" +
    JSON.stringify({ lineas });

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
        max_tokens: 2000,
        system: "Respondé SOLO con JSON válido, sin markdown.",
        messages: [{ role: "user", content: pedido }],
      }),
    });
    if (!res.ok) { console.warn("[ortografía] no se pudo revisar:", res.status); return vacio; }
    const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const raw = json.content?.find((c) => c.type === "text")?.text ?? "{}";
    const m = /\{[\s\S]*\}/.exec(raw);
    const out = JSON.parse(m ? m[0] : "{}") as { lineas?: unknown };
    const nuevas = Array.isArray(out.lineas) ? (out.lineas as unknown[]) : [];
    if (nuevas.length !== lineas.length) { console.warn("[ortografía] respuesta con otra cantidad de líneas — se ignora"); return vacio; }

    const cambios: Array<{ escena: number; antes: string; despues: string }> = [];
    escenas.forEach((e, i) => {
      const antes = lineas[i]!;
      const despues = typeof nuevas[i] === "string" ? (nuevas[i] as string).trim() : antes;
      if (!antes || despues === antes) return;
      // Solo erratas: mismas palabras, poca distancia.
      // Tildes y signos ¿¡ se aceptan sin límite; las LETRAS pueden cambiar ≤ 3.
      const plano = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[¿¡]/g, "").toLowerCase();
      if (palabras(antes) !== palabras(despues) || levenshtein(plano(antes), plano(despues)) > 3) return;
      e.narration_text = despues;
      cambios.push({ escena: e.scene_number ?? i + 1, antes, despues });
    });
    if (cambios.length) {
      console.log(`[ortografía] ${cambios.length} línea(s) corregida(s): ` + cambios.map((c) => `esc ${c.escena} «${c.antes}» → «${c.despues}»`).join(" · "));
    }
    return { corregidas: cambios.length, cambios };
  } catch (e) {
    console.warn("[ortografía] error:", e instanceof Error ? e.message.slice(0, 120) : e);
    return vacio;
  }
}
