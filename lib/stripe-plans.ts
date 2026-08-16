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
// Con el costo MEDIDO de $4.08 y margen 3×, un video cuesta 12.240 NAVOS.
//
// El campo `videos` se anuncia REDONDEADO HACIA ABAJO, a propósito. Creador da
// 2,37 videos por mes y promete 2. Los NAVOS sobrantes no se pierden: quedan en el
// saldo y se acumulan, así que cada tres meses sale un video extra que nadie
// prometió. Se promete de menos y se entrega de más — nunca al revés, porque un
// plan que rinde menos de lo anunciado se cancela el primer mes.
//
// Se quitó el plan Starter: a $9 daba 9.000 NAVOS, por debajo del costo de UN
// video. Vender un plan que no alcanza para producir nada es la peor primera
// experiencia posible.
export const PLANS: Plan[] = [
  {
    id: "creator",
    name: "Creador",
    description: "Para creadores constantes",
    priceMonthly: 2900,
    priceAnnual: 2400,
    credits: 29000,
    videos: 2,
    features: [
      "2 videos de 60s al mes (o 4 de 30s)",
      "Los NAVOS que no uses se acumulan",
      "Personajes que hablan, con su propia voz",
      "Personajes recurrentes guardados",
      "Descarga MP4 sin marca de agua",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    description: "El favorito de los profesionales",
    priceMonthly: 4900,
    priceAnnual: 3900,
    credits: 49000,
    videos: 4,
    popular: true,
    features: [
      "4 videos de 60s al mes (o 8 de 30s)",
      "Los NAVOS que no uses se acumulan",
      "Máxima calidad visual y de voz",
      "Personajes y anuncios UGC",
      "Soporte prioritario + acceso anticipado",
    ],
  },
  {
    id: "studio",
    name: "Estudio",
    description: "Volumen para agencias y marcas",
    priceMonthly: 9900,
    priceAnnual: 7900,
    credits: 99000,
    videos: 8,
    features: [
      "8 videos de 60s al mes (o 16 de 30s)",
      "Los NAVOS que no uses se acumulan",
      "Máximo volumen, misma calidad",
      "Soporte 24/7 + facturación empresarial",
      "Acceso API (próximamente)",
    ],
  },
];

export function getPlanById(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}
