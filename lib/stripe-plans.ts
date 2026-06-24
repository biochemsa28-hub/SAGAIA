// Plans — safe to import on client AND server

export interface Plan {
  id: string;
  name: string;
  description: string;
  priceMonthly: number;   // USD cents/month
  priceAnnual: number;    // USD cents/month (billed annually)
  credits: number;        // NAVOS per month
  videos: number;
  popular?: boolean;
  features: string[];
}

// NAVOS por plan = precio_mensual_USD × 1000 (ver lib/config NAVOS_PER_USD).
// UN SOLO TIER PREMIUM: cada video es "obra de arte" con personajes que hablan
// (lip-sync) y cuesta 9.000 NAVOS. Margen 3×. Videos/mes = NAVOS / 9.000.
export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    description: "Tu primera obra de arte",
    priceMonthly: 900,
    priceAnnual: 750,
    credits: 9000,
    videos: 1,
    features: [
      "1 video premium / mes",
      "Personajes que HABLAN (lip-sync)",
      "Elenco IA + voz por personaje",
      "Subtítulos karaoke + kit de publicación",
      "Descarga MP4 sin marca de agua",
    ],
  },
  {
    id: "creator",
    name: "Creador",
    description: "Para creadores constantes",
    priceMonthly: 2900,
    priceAnnual: 2400,
    credits: 29000,
    videos: 3,
    features: [
      "3 videos premium / mes",
      "Personajes que hablan (lip-sync)",
      "Personajes recurrentes guardados",
      "Sube tu producto a los anuncios",
      "Todo lo de Starter",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    description: "El favorito de los profesionales",
    priceMonthly: 4900,
    priceAnnual: 3900,
    credits: 49000,
    videos: 5,
    popular: true,
    features: [
      "5 videos premium / mes",
      "Máxima calidad visual y de voz",
      "Personajes y anuncios UGC",
      "Soporte prioritario + acceso anticipado",
      "Todo lo de Creador",
    ],
  },
  {
    id: "studio",
    name: "Estudio",
    description: "Volumen para agencias y marcas",
    priceMonthly: 9900,
    priceAnnual: 7900,
    credits: 99000,
    videos: 11,
    features: [
      "11 videos premium / mes",
      "Máximo volumen, misma calidad obra de arte",
      "Soporte 24/7 + facturación empresarial",
      "Acceso API (próximamente)",
      "Todo lo de Pro",
    ],
  },
];

export function getPlanById(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}
