// OFAC sanctioned-jurisdiction geo-block.
//
// The list mirrors the comprehensive-embargo set the US Treasury maintains
// (Iran, North Korea, Cuba, Syria, plus the contested Crimea/Donetsk/Luhansk
// regions of Ukraine — those last three resolve to UA via IP geolocation,
// which is the limit of what we can do at this layer).
//
// We hit the free https://api.country.is endpoint client-side. No API key,
// no rate-limit signup, returns just `{ ip, country }`. If the lookup fails
// we fail OPEN (allow access) rather than locking a real user out of the
// pay page over a network blip — the on-chain Chainalysis sanctions screen
// remains the hard gate for actual payments.
//
// Decisions are cached in sessionStorage so we don't hit the API on every
// route change.
export const SANCTIONED_COUNTRIES = ["IR", "KP", "CU", "SY"] as const;

export type GeoCheckResult =
  | { status: "allowed";  country: string }
  | { status: "blocked";  country: string }
  | { status: "unknown" }; // lookup failed — fail open

const SESSION_KEY = "secudigate:geo:v1";

export async function checkGeo(): Promise<GeoCheckResult> {
  // Cached decision wins for the rest of the tab session.
  try {
    const cached = sessionStorage.getItem(SESSION_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as GeoCheckResult;
      if (parsed && (parsed.status === "allowed" || parsed.status === "blocked")) {
        return parsed;
      }
    }
  } catch { /* ignore parse errors */ }

  let result: GeoCheckResult = { status: "unknown" };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch("https://api.country.is", { signal: ctrl.signal });
    clearTimeout(timer);
    if (r.ok) {
      const json = (await r.json()) as { country?: string };
      const country = (json.country ?? "").toUpperCase();
      if (country) {
        const blocked = (SANCTIONED_COUNTRIES as readonly string[]).includes(country);
        result = blocked
          ? { status: "blocked", country }
          : { status: "allowed", country };
      }
    }
  } catch { /* network error → unknown → fail open */ }

  if (result.status !== "unknown") {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(result)); } catch { /* quota */ }
  }
  return result;
}
