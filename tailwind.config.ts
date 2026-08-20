import type { Config } from "tailwindcss";

// ─── REBRAND POR TOKENS (identidad v3) ───────────────────────────────────────
// La app entera usa zinc/violet/pink/fuchsia de Tailwind. En vez de tocar miles
// de clases, se re-mapean AQUÍ las cuatro familias a la marca:
//   · zinc   → grises azulados profundos (fondo #07080f, superficie #0c0e18)
//   · violet → el violeta de marca (#7c5cff)
//   · pink   → el acento cálido REC (#ff4d7d)
//   · fuchsia→ el cian eléctrico (#4de3ff) — el "color IA" de la marca
// Un cambio acá re-pinta wizard, dashboard, sala de montaje y landing de la app
// de forma coherente. Los tonos intermedios están interpolados a mano para que
// hover/borde/sombra sigan teniendo la misma jerarquía que antes.
const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        zinc: {
          50:  "#f6f7fc",
          100: "#eef0f9",
          200: "#dde1f0",
          300: "#b9bfd9",
          400: "#8b93b4",
          500: "#596180",
          600: "#3a4060",
          700: "#242a44",
          800: "#171b2e",
          900: "#0c0e18",
          950: "#07080f",
        },
        violet: {
          50:  "#f4f1ff",
          100: "#ece6ff",
          200: "#ddd4ff",
          300: "#c4b5ff",
          400: "#a189ff",
          500: "#7c5cff",
          600: "#6a46f2",
          700: "#5836cf",
          800: "#452ba3",
          900: "#2f1e73",
          950: "#1b1147",
        },
        pink: {
          50:  "#fff0f4",
          100: "#ffe1ea",
          200: "#ffc4d5",
          300: "#ff9cb9",
          400: "#ff739b",
          500: "#ff4d7d",
          600: "#ec3369",
          700: "#c62355",
          800: "#94193f",
          900: "#5f102a",
          950: "#380918",
        },
        fuchsia: {
          50:  "#effcff",
          100: "#dcf8ff",
          200: "#b8f1ff",
          300: "#8aeaff",
          400: "#63e6ff",
          500: "#4de3ff",
          600: "#24c4e6",
          700: "#189cba",
          800: "#127890",
          900: "#0e5a6c",
          950: "#083744",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
