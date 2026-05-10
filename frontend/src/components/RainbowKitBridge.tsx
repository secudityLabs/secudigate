import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { useTheme } from "../hooks/useTheme";

const SHARED = {
  accentColor: "#7c5cff",
  accentColorForeground: "#ffffff",
  borderRadius: "large" as const,
  fontStack: "system" as const,
};

// Wraps RainbowKitProvider so its theme follows our app-wide light/dark
// state. RainbowKit's theme is set per-render, so swapping the object
// here is enough — the connect modal + chain switcher will repaint when
// the user flips the toggle.
export default function RainbowKitBridge({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const rkTheme = theme === "light" ? lightTheme(SHARED) : darkTheme(SHARED);
  return <RainbowKitProvider theme={rkTheme}>{children}</RainbowKitProvider>;
}
