// ─── PICO POR DEFECTO DE CADA GÉNERO ────────────────────────────────────────
//
// Red de seguridad para cuando el guion sale sin ningún pico físico: la REGLA
// #2.8 lo exige, pero una regla en el prompt es una petición, y el modelo puede
// entregar seis escenas de conversación con acciones chiquitas.
//
// Es una TABLA, no una llamada a la IA. Pedirle al modelo que repare cuesta
// dinero, tarda, y puede volver otra vez sin pico — o sea que el arreglo tendría
// el mismo modo de falla que el problema. Una tabla es gratis, instantánea, y
// cada texto se puede verificar contra la regla de acá abajo (se hace: hay una
// prueba que los pasa todos por ACCION_CLAVE).
//
// Están escritos como se EJECUTAN, en el formato "antes | después" que pide el
// campo physical_action, y cada uno es el pico que el TONE_GUIDE describe para
// su género.
export const PICO_POR_DEFECTO: Record<string, string> = {
  romance:       "her hand goes to the back of his neck, their lips meet and hold | they part an inch, foreheads still touching, breathing hard",
  horror:        "a hand reaches out of the dark and grabs her wrist | she is yanked backwards, her feet losing the floor",
  thriller:      "he shoves the door closed as she runs for it | they struggle against it, shoulder to shoulder, neither giving",
  mystery:       "she opens the drawer and unfolds the letter with both hands | the paper drops from her hands and she stops dead",
  drama:         "the slap lands flat across his face | she turns away and slams the door behind her",
  confesion:     "her knees give way and she sinks to the floor | the sobbing doubles her over, hands over her face",
  inspirational: "he pushes off the ground with both hands and rises to his feet | he stands square, shoulders back, and does not look down",
  comedy:        "he trips over his own foot and goes down flat | he slips again trying to get up, taking the chair with him",
  fantasy:       "his knees buckle under the weight of the light | he goes down on one hand, staring up at it",
  chisme:        "she sets the cup down hard and grabs the other woman's arm | she pulls her in close to say the rest",
  documentary:   "her hands open the box and lift the object out | she turns it over slowly, and her hands stop",
};

/** El pico del género, o el de drama si el tono no está en la tabla. */
export function picoPorDefecto(tono?: string | null): string {
  const k = (tono ?? "").trim().toLowerCase();
  return PICO_POR_DEFECTO[k] ?? PICO_POR_DEFECTO["drama"]!;
}

// ─── Qué cuenta como PICO FÍSICO ────────────────────────────────────────────
//
// Vivía dentro de app/api/videos/route.ts, y eso dejaba al guionista sin poder
// consultarla: la app sabía reconocer un pico pero no podía EXIGIRLO al escribir,
// así que un guion entero de diálogo pasaba sin que nada lo notara hasta ver el
// video terminado. Una regla que decide algo importante tiene que vivir donde
// todos los que la necesitan puedan leerla — es la misma lección que el guardia
// de palabra colgante, que protegía un corte de tres.
//
// La usan tres lugares: el guion (para exigir el pico y repararlo si falta), el
// enrutador de video (para dibujar el cuadro destino) y la contabilidad.
// EL PRINCIPIO, no el caso: image-to-video interpola entre dos
// cuadros, y una acción que CAMBIA el estado del cuerpo no puede
// salir de una foto que no la contiene. Con el beso quedó medido
// —el modelo de imagen deja siempre el centímetro y el clip se queda
// en el "casi"— pero aplica igual a una caída (la foto muestra a
// alguien de pie → el clip hace un tambaleo), a un quiebre en llanto,
// a una bofetada o a un desmayo. El endpoint de referencias no está
// esclavizado al cuadro inicial: recibe a los personajes como
// referencias y EJECUTA la acción — el beso salió entero en la prueba.
//
// Se enruta por CATEGORÍA de acción, con conjugaciones ES/EN:
export const ACCION_CLAVE = new RegExp(
  [
    /kiss\w*|lips|embrac\w+|hugs?|hugging|bes[oa]\w*|abraz\w+/, // contacto
    /falls?|falling|collaps\w+|cae\w*|derrumb\w+|desplom\w+|knees? (give|buckle)|goes? down/, // caídas
    /slaps?|hits?|strikes?|punch\w*|golpe\w*|bofetad\w*|cachetad\w*/, // golpes
    /sob\w*|breaks? down|weep\w*|llor\w+|quiebr\w+|tears stream\w*/, // quiebre en llanto
    /scream\w*|shout\w*|grit\w+|doubl\w+ over/, // gritos con cuerpo
    /faints?|desmay\w+|collapses unconscious/, // desmayos
    /throws?|smash\w*|shatters?|lanz\w+|romp\w+|arroj\w+|slams?|portazo/, // romper/arrojar/portazo
    // TERROR: el cuerpo reacciona a algo que llega desde afuera.
    /grabs?|grabbing|yanks?|drags?|seizes?|agarr\w+|jal\w+|arrastr\w+|sujet\w+|tir[óo]n/,
    /reach\w+ out of|appears? behind|lunges?|surges? forward|aparec\w+ detr[áa]s|sale de la/,
    // THRILLER / ACCIÓN: huir, empujar, forcejear.
    // "corre"/"runs" a secas atrapaba el ambiente —"la lluvia corre
    // por el vidrio"— y mandaba una escena contemplativa al endpoint
    // caro. Se exige que haya alguien yendo a alguna parte.
    /runs? (to|toward|for|out|away|at)|running (to|toward|away)|bolts?|flees?|shoves?|pushes? (her|him|through|past)|struggl\w+|sale corriendo|echa a correr|corre (hacia|hasta|por el pasillo)|huy\w+|empuj\w+|forcej\w+/,
    // INSPIRACIONAL: el cuerpo que vence.
    /rises? (to|from)|stands? up|gets? up|levant\w+|endereza|se pone de pie/,
    // COMEDIA física.
    /slips?|trips?|stumbl\w+|resbal\w+|tropiez\w+|se vuelca|spills?/,
    // MISTERIO: descubrir con las manos.
    /opens? the|unfolds?|flips? over|abre el|despliega|da vuelta/,
    // ── Huecos encontrados por el banco de premisas ──────────────────────────
    // Tres picos evidentes y virales que la regla NO reconocía, o sea que el
    // sistema no les habría dibujado cuadro destino y habrían salido como amago:
    //
    //   "she tears the veil off her head in one pull"  → arrancar algo del cuerpo
    //   "he drops a heavy folder on the table"         → solo cubría "drops THE"
    //   "the body sits up inside the casket"           → incorporarse no es "rise"
    //
    // El banco existe para esto: probar premisas de a centavos encuentra los
    // agujeros de la regla antes que un video de dos dólares.
    // El verbo y la partícula NO van pegados: "tears THE VEIL off", "rips HER
    // HAND away". Exigirlos contiguos dejaba fuera la forma en que se escribe de
    // verdad — la primera versión de esta línea no reconocía el propio caso que
    // la motivó. Se permite el objeto en el medio, sin cruzar puntuación.
    /\b(tears?|rips?|yanks?|tugs?|pulls?)\b[^.,;]{0,24}\b(off|away|out of|from her|from his)\b|arranca|le quita de un/,
    /drops? (the|a|an|his|her|their|it)\b|deja caer|se le cae|slams? down|sets? .* down hard/,
    /sits? up|sits? upright|bolts? upright|se incorpora|se sienta de golpe/,
  ].map((r) => r.source).join("|"),
  "i",
);
