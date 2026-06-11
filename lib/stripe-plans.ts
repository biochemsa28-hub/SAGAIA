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
      "10 microdramas completos",
      "Voz IA (ElevenLabs)",
      "Imágenes Flux Schnell",
      "Clips animados Kling",
      "Video final MP4",
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
      "40 microdramas completos",
      "Todo lo de Starter",
      "Prioridad en generación",
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
      "120 microdramas completos",
      "Todo lo de Pro",
      "Acceso anticipado a nuevas funciones",
      "Soporte prioritario",
    ],
  },
];

export function getPlanById(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}
