import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        /* ── Adaptive tokens (CSS var–backed) ── */
        fg:    "var(--c-fg)",
        muted: "var(--c-muted)",
        dim:   "var(--c-dim)",
        /* ── 0G brand purples ── */
        zg: {
          purple: "#9200e1",
          accent: "#b75fff",
          pink:   "#dd23bb",
          deep:   "#320071",
          dark:   "#0d0018",
        },
        /* legacy – kept so nothing breaks */
        brand: {
          50:  "#faf5ff",
          100: "#f3e8ff",
          200: "#e9d5ff",
          300: "#d8b4fe",
          400: "#c084fc",
          500: "#a855f7",
          600: "#9200e1",
          700: "#7e22ce",
          800: "#6b21a8",
          900: "#581c87",
        },
        ink: {
          900: "#1a003a",
          800: "#2d005f",
          700: "#4b0082",
          600: "#6b21a8",
          500: "#9333ea",
          400: "#a855f7",
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"Geist Mono"', "ui-monospace", "monospace"],
      },
      backgroundImage: {
        "gradient-zg":
          "linear-gradient(135deg, #9200e1 0%, #dd23bb 100%)",
        "gradient-zg-soft":
          "linear-gradient(135deg, rgba(146,0,225,0.12) 0%, rgba(221,35,187,0.08) 100%)",
      },
      boxShadow: {
        soft:        "0 1px 3px rgba(146,0,225,0.06), 0 1px 2px rgba(146,0,225,0.04)",
        card:        "0 2px 16px rgba(146,0,225,0.08), 0 1px 0 rgba(146,0,225,0.04) inset",
        "card-dark": "0 1px 0 rgba(183,95,255,0.06) inset, 0 8px 32px rgba(0,0,0,0.45)",
        glow:        "0 0 20px rgba(146,0,225,0.35)",
        "glow-pink": "0 0 20px rgba(221,35,187,0.35)",
      },
    },
  },
  plugins: [],
};
export default config;
