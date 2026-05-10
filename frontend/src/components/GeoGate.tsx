import { useEffect, useState } from "react";
import { checkGeo, type GeoCheckResult } from "../lib/geoBlock";
import Blocked from "../pages/Blocked";

interface GeoGateProps {
  children: React.ReactNode;
}

// Wraps the app and short-circuits to a Blocked page when the visitor's IP
// resolves to a comprehensive-embargo jurisdiction. Fails open when the
// geo lookup is unreachable so a network blip doesn't lock real users out
// — the on-chain Chainalysis sanctions screen remains the hard gate.
export default function GeoGate({ children }: GeoGateProps) {
  const [state, setState] = useState<GeoCheckResult | "loading">("loading");

  useEffect(() => {
    let active = true;
    checkGeo().then((r) => {
      if (active) setState(r);
    });
    return () => { active = false; };
  }, []);

  if (state === "loading") return null; // brief flash; cached after first hit
  if (state.status === "blocked") return <Blocked country={state.country} />;
  return <>{children}</>;
}
