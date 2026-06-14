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

export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    description: "Para probar la plataforma",
    priceMonthly: 900,
    priceAnnual: 750,
    credits: 30,
    videos: 3,
    features: [
      "30 NAVOS / mes",
      "3 videos completos",
      "Kit de publicación",
      "Descarga MP4",
    ],
  },
  {
    id: "creator",
    name: "Creador",
    description: "Para creadores ocasionales",
    priceMonthly: 2900,
    priceAnnual: 2400,
    credits: 70,
    videos: 7,
    features: [
      "70 NAVOS / mes",
      "7 videos completos",
      "Kit de publicación",
      "Descarga MP4",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    description: "Para creadores activos",
    priceMonthly: 4900,
    priceAnnual: 3900,
    credits: 200,
    videos: 20,
    popular: true,
    features: [
      "200 NAVOS / mes",
      "20 videos completos",
      "Kit de publicación",
      "Descarga MP4",
      "Soporte prioritario",
      "Acceso anticipado a nuevas funciones",
    ],
  },
  {
    id: "studio",
    name: "Estudio",
    description: "Para agencias y equipos",
    priceMonthly: 9900,
    priceAnnual: 7900,
    credits: 500,
    videos: 50,
    features: [
      "500 NAVOS / mes",
      "50 videos completos",
      "Kit de publicación",
      "Descarga MP4",
      "Soporte 24/7",
      "Acceso API (próximamente)",
      "Facturación empresarial",
    ],
  },
];

export function getPlanById(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}
