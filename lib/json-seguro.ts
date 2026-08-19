// Parse JSON de una respuesta SIN reventar con la página de error del proxy.
//
// Medido en producción: durante un redeploy, Railway contesta el texto plano
// "upstream error" (o una página HTML) con content-type cualquiera. El sondeo
// de producción hace `res.json()` cada pocos segundos, así que el usuario veía
// literalmente: «Unexpected token 'u', "upstream error" is not valid JSON».
//
// Esta función lee el cuerpo como texto, intenta parsear, y si no es JSON
// lanza un error LEGIBLE que las pantallas ya saben mostrar — o, para los
// sondeos, permite tratarlo como "todavía no" y reintentar en silencio.
export class RespuestaNoJson extends Error {
  constructor(public readonly cuerpo: string, public readonly status: number) {
    super(status >= 500 || /upstream|bad gateway|unavailable/i.test(cuerpo)
      ? "El servidor se está reiniciando (despliegue en curso). Se reintenta solo — no pierdas la página."
      : `Respuesta inesperada del servidor (${status}).`);
    this.name = "RespuestaNoJson";
  }
}

export async function jsonSeguro<T>(res: Response): Promise<T> {
  const texto = await res.text();
  try {
    return JSON.parse(texto) as T;
  } catch {
    throw new RespuestaNoJson(texto.slice(0, 200), res.status);
  }
}

// Traducción para los catch de la interfaz: el JSON.parse de fetch revienta
// con «Unexpected token u, "upstream error" is not valid JSON» durante un
// redeploy. Eso no es un error del usuario ni del video: es el servidor
// reiniciándose. Se muestra en cristiano.
export function mensajeLegible(err: unknown, porDefecto: string): string {
  const m = err instanceof Error ? err.message : String(err);
  if (/is not valid JSON|Unexpected token|upstream error|Failed to fetch|NetworkError|load failed/i.test(m)) {
    return "El servidor se está actualizando (tarda ~1 minuto). Espera un momento y vuelve a intentar — tu proyecto no se pierde.";
  }
  return m || porDefecto;
}
