import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        glass: "var(--glass-radius)",
      },
      colors: {
        surface: {
          DEFAULT: "var(--surface)",
          muted: "var(--surface-muted)",
          border: "var(--surface-border)",
        },
        tier: {
          hot: { DEFAULT: "var(--tier-hot)", bg: "var(--tier-hot-bg)" },
          warm: { DEFAULT: "var(--tier-warm)", bg: "var(--tier-warm-bg)" },
          cold: { DEFAULT: "var(--tier-cold)", bg: "var(--tier-cold-bg)" },
        },
      },
      // Global defaults: any unqualified `transition-*` utility (or `transition`
      // alone) inherits 200ms + Apple-feel spring easing. If you need a faster
      // tooltip or instant feedback, opt out with `duration-75` / `transition-none`.
      transitionDuration: { DEFAULT: "200ms" },
      transitionTimingFunction: {
        DEFAULT: "cubic-bezier(0.32, 0.72, 0, 1)",
      },
    },
  },
  plugins: [],
} satisfies Config;
