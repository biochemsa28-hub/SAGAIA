export interface Nicho {
  id: string;
  label: string;
  sub_nichos: { id: string; label: string }[];
}

export const NICHOS: Nicho[] = [
  {
    id: "terror",
    label: "Terror y Horror",
    sub_nichos: [
      { id: "terror_psicologico", label: "Terror Psicológico" },
      { id: "casas_embrujadas", label: "Casas Embrujadas" },
      { id: "criaturas", label: "Criaturas y Monstruos" },
      { id: "folklorico", label: "Leyendas y Folklore" },
      { id: "paranormal", label: "Paranormal y Espiritual" },
    ],
  },
  {
    id: "romance",
    label: "Romance y Drama",
    sub_nichos: [
      { id: "amor_imposible", label: "Amor Imposible" },
      { id: "segundas_oportunidades", label: "Segundas Oportunidades" },
      { id: "romance_historico", label: "Romance Histórico" },
      { id: "drama_familiar", label: "Drama Familiar" },
      { id: "traicion", label: "Traición y Redención" },
    ],
  },
  {
    id: "misterio",
    label: "Misterio y Thriller",
    sub_nichos: [
      { id: "detectives", label: "Detectives y Crimen" },
      { id: "conspiraciones", label: "Conspiraciones" },
      { id: "desapariciones", label: "Desapariciones" },
      { id: "true_crime", label: "True Crime Dramatizado" },
      { id: "espionaje", label: "Espionaje" },
    ],
  },
  {
    id: "inspiracional",
    label: "Inspiracional y Motivacional",
    sub_nichos: [
      { id: "superacion", label: "Superación Personal" },
      { id: "exito_empresarial", label: "Éxito Empresarial" },
      { id: "historias_reales", label: "Historias Reales Inspiradoras" },
      { id: "resiliencia", label: "Resiliencia y Adversidad" },
      { id: "liderazgo", label: "Liderazgo y Visión" },
    ],
  },
  {
    id: "fantasia",
    label: "Fantasía y Ciencia Ficción",
    sub_nichos: [
      { id: "mundos_magicos", label: "Mundos Mágicos" },
      { id: "viajes_tiempo", label: "Viajes en el Tiempo" },
      { id: "distopia", label: "Distopía y Futuro" },
      { id: "mitologia", label: "Mitología Reimaginada" },
      { id: "superhéroes", label: "Superhéroes Originales" },
    ],
  },
  {
    id: "historia",
    label: "Historia y Documentales",
    sub_nichos: [
      { id: "civilizaciones_perdidas", label: "Civilizaciones Perdidas" },
      { id: "guerras", label: "Guerras y Batallas" },
      { id: "personajes_historicos", label: "Personajes Históricos" },
      { id: "inventos", label: "Inventos y Descubrimientos" },
      { id: "misterios_historicos", label: "Misterios Históricos" },
    ],
  },
];

export const TONES = [
  { id: "horror", label: "Terror" },
  { id: "romance", label: "Romance" },
  { id: "mystery", label: "Misterio" },
  { id: "inspirational", label: "Inspiracional" },
  { id: "comedy", label: "Comedia" },
  { id: "thriller", label: "Thriller" },
  { id: "documentary", label: "Documental" },
  { id: "fantasy", label: "Fantasía" },
  { id: "drama", label: "Drama" },
  // Estos dos existían completos en el backend (schema, guía de tono, visual)
  // pero no estaban en la cinta: dos formatos que dominan el feed
  // hispanohablante eran inalcanzables desde la UI.
  { id: "chisme", label: "Chisme" },
  { id: "confesion", label: "Confesión" },
] as const;

// SOLO DURACIONES QUE EL SISTEMA ENTREGA DE VERDAD.
//
// Antes esta lista ofrecía "3-5 minutos" y "10-20 minutos", y la producción
// devolvía 60 segundos: la config mapeaba ambas a 120s y MAX_VIDEO_SECONDS las
// recortaba a 60. El usuario elegía 20 minutos, pagaba, y recibía uno. Ofrecer
// lo que no se entrega no es una limitación técnica: es cobrar por algo que no
// existe.
//
// Los minutos no desaparecen — llegan como SERIE de episodios encadenados, que
// además es el formato que de verdad se vuelve viral en Reels y TikTok. Un
// video de 10 minutos se abandona al minuto dos; ocho episodios con cliffhanger
// se ven los ocho.
// 60s es la RECOMENDADA, y no por gusto: el algoritmo pesa segundos vistos (un
// 60s visto al 60% le gana a un 30s visto al 90%), y medido con la misma
// premisa, a 30s la historia terminó en carnada y el pico salió tibio; a 60s el
// diálogo respiró y el pico cayó al 93%. 30s sirve para un gag único o un
// borrador. La mitad de segundos cuesta la mitad de NAVOS — no es un descuento
// por elegir corto, es que el precio es por segundo.
export const DURATION_OPTIONS = [
  { id: "30s", label: "30 segundos", hint: "Corto y directo. Perfecto para una escena graciosa o para probar una idea.", scenes: "5-6", recomendada: false },
  { id: "60s", label: "60 segundos", hint: "El que más se ve. Tiene tiempo para enganchar, sorprender y cerrar bien.", scenes: "10-12", recomendada: true },
  { id: "90s", label: "90 segundos", hint: "Para una historia con más personajes o más vueltas.", scenes: "15-18", recomendada: false },
] as const;

export const VISUAL_STYLES = [
  { id: "cinematic", label: "Cinemático", description: "Fotografía de película, dramático" },
  { id: "anime", label: "Anime", description: "Estilo animación japonesa" },
  { id: "realistic", label: "Hiperrealista", description: "Fotografía ultra-realista" },
  { id: "cartoon", label: "Cartoon", description: "Ilustración colorida y expresiva" },
  { id: "vintage", label: "Vintage", description: "Años 70-90, grano de película" },
] as const;

export const PLATFORMS = [
  { id: "tiktok", label: "TikTok", aspect_ratio: "9:16" },
  { id: "instagram", label: "Instagram Reels", aspect_ratio: "9:16" },
  { id: "youtube_shorts", label: "YouTube Shorts", aspect_ratio: "9:16" },
  { id: "youtube_long", label: "YouTube Largo", aspect_ratio: "16:9" },
] as const;
