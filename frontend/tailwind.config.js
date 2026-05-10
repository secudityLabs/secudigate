/** @type {import('tailwindcss').Config} */
//
// All theme-flippable colors are driven by CSS custom properties defined in
// src/index.css under :root (dark, default) and html[data-theme="light"].
// The /<alpha-value> syntax lets utility variants like bg-bg/60 still work.
//
// Colors that intentionally stay the same across modes (brand, good, warn,
// bad) are kept as fixed hex values.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "rgb(var(--color-bg)      / <alpha-value>)",
          soft:    "rgb(var(--color-bg-soft) / <alpha-value>)",
          card:    "rgb(var(--color-bg-card) / <alpha-value>)",
        },
        line: "rgb(var(--color-line) / <alpha-value>)",
        ink: {
          DEFAULT: "rgb(var(--color-ink)       / <alpha-value>)",
          dim:     "rgb(var(--color-ink-dim)   / <alpha-value>)",
          faint:   "rgb(var(--color-ink-faint) / <alpha-value>)",
        },
        brand: {
          DEFAULT: "#7c5cff",
          soft:    "#a892ff",
        },
        good: "#22c55e",
        warn: "#f59e0b",
        bad:  "#ef4444",
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        // Composed from CSS vars so light mode can swap the inset highlight
        // and the drop shadow density independently.
        card: "0 1px 0 0 var(--card-inset, rgba(255,255,255,0.04)) inset, 0 8px 24px -12px var(--card-shadow, rgba(0,0,0,0.6))",
      },
    },
  },
  plugins: [],
};
