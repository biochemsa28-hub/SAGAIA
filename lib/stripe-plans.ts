// ─── Plans config — safe to import on client AND server ──────────────────────

export interface Plan {
  id: string;
  name: string;
  description: string;
  price: number;   // USD cents
  credits: number;
  popular?: boolean;
  features: string[];
}

export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    description: "Para empezar a crear",
    price: 900,
    credits: 10,
    features: [
      "10 microseries completas",
      "Voz profesional en español e inglés",
      "Imágenes cinematográficas 9:16",
      "Clips animados con movimiento",
      "Video final MP4 1080×1920",
      "Subtítulos sincronizados",
      "Paquete SEO incluido",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    description: "Para creadores activos",
    price: 2900,
    credits: 40,
    popular: true,
    features: [
      "40 microseries completas",
      "Todo lo del plan Starter",
      "Exportación de assets en ZIP",
      "Hashtags y títulos optimizados",
      "Producción en lote (hasta 10 a la vez)",
      "Soporte por email",
    ],
  },
  {
    id: "studio",
    name: "Studio",
    description: "Para agencias y equipos",
    price: 7900,
    credits: 120,
    features: [
      "120 microseries completas",
      "Todo lo del plan Pro",
      "Mayor velocidad de producción",
      "Acceso anticipado a nuevas funciones",
      "Soporte prioritario",
    ],
  },
];

export function getPlanById(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}
