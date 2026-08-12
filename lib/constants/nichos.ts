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

export const DURATION_OPTIONS = [
  { id: "30s", label: "30 segundos (TikTok viral)", scenes: "3-5" },
  { id: "60s", label: "60 segundos (Reel/Short)", scenes: "5-8" },
  { id: "3-5min", label: "3-5 minutos (YouTube Short largo)", scenes: "8-15" },
  { id: "10-20min", label: "10-20 minutos (YouTube largo)", scenes: "15-40" },
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
