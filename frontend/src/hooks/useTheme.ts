import { useEffect, useState } from "react";

// Light/dark theme manager.
//
// Resolution order on first paint:
//   1. localStorage value, if the user explicitly chose one
//   2. window.matchMedia('(prefers-color-scheme: light)') — system preference
//   3. fallback to dark
//
// Setting the theme writes data-theme="light" or removes it. CSS variables
// in index.css respond automatically; every Tailwind class that consumes
// those vars (bg-bg, text-ink, border-line, …) re-renders without code
// changes. The actual paint is driven by the inline bootstrap in index.html
// that runs *before* React mounts, so there's no flash-of-wrong-theme.

export type Theme = "light" | "dark";

const STORAGE_KEY = "secudigate:theme:v1";

function readStored(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch { return null; }
}

// Resolve the current theme value at first render. Must match the inline
// bootstrap script in index.html or the page will flash on hydrate.
//
// Dark is the hard default — first-time visitors always land in dark
// regardless of their OS's prefers-color-scheme. The brand is dark-coded
// and a consistent first impression matters more than respecting system
// preference. Once a user clicks the toggle, their choice is saved and
// honored on every future visit.
function initialTheme(): Theme {
  const stored = readStored();
  if (stored) return stored;
  return "dark";
}

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === "light") root.setAttribute("data-theme", "light");
  else root.removeAttribute("data-theme");
}

export function useTheme(): { theme: Theme; toggle: () => void; set: (t: Theme) => void } {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  // Sync the attribute whenever theme changes from inside this tab.
  useEffect(() => {
    apply(theme);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* quota */ }
  }, [theme]);

  // Cross-tab sync — if the user toggles theme in another tab the storage
  // event fires here and we mirror.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      if (e.newValue === "light" || e.newValue === "dark") setTheme(e.newValue);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return {
    theme,
    set: setTheme,
    toggle: () => setTheme((t) => (t === "light" ? "dark" : "light")),
  };
}
