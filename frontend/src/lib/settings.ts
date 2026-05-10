import type { StablecoinSymbol } from "./tokens";
import { DEFAULT_CHAIN_ID, ENABLED_CHAIN_IDS } from "./chains";
import { isApiEnabled } from "./api";
import { getMerchantSettings, putMerchantSettings } from "./api/settings";

export interface MerchantSettings {
  merchant: `0x${string}`;
  businessName: string;
  brandColor: string;          // hex like "#7c5cff"
  logoUrl?: string;
  defaultTreasury: `0x${string}`;
  acceptedTokens: StablecoinSymbol[];
  acceptedChains: number[];    // chain IDs the merchant accepts
  defaultChainId: number;
  /// Merchant's optional fee on their own customers, in basis points.
  /// 0 = disabled. Capped at MAX_MERCHANT_FEE_BPS (1000) by the contract.
  merchantFeeBps: number;
  /// Where the merchant fee goes when feeBps > 0. Defaults to defaultTreasury.
  merchantFeeReceiver: `0x${string}`;
  /// Per-payer daily USD limit with 6 decimals, as a decimal string. The
  /// contract converts each token amount to USD via Chainlink price feeds
  /// and accumulates per (payer, merchant) per day. "0" = disabled.
  merchantDailyLimit: string;
  updatedAt: number;
}

const KEY = "secudigate:settings:v1";
const DEFAULT_BRAND = "#7c5cff";
const ALL_TOKENS: StablecoinSymbol[] = ["USDC", "USDT", "DAI"];

type Map = Record<string, MerchantSettings>;

function read(): Map {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Map;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function write(map: Map, opts: { silent?: boolean } = {}) {
  // Short-circuit when nothing changed. localStorage.setItem fires a
  // `storage` event in every OTHER tab whenever it runs (even when the
  // value is byte-identical), so re-writing a no-op cascades into a
  // multi-tab fetch storm: each tab's useSettings refetches on storage,
  // hydrate returns a fresh object, cacheLocally calls write again, etc.
  // Comparing serialized payloads keeps the cross-tab event quiet.
  const next = JSON.stringify(map);
  const prev = localStorage.getItem(KEY);
  if (next === prev) return;
  localStorage.setItem(KEY, next);
  if (!opts.silent) window.dispatchEvent(new CustomEvent("secudigate:settings-updated"));
}

export function defaultSettings(merchant: `0x${string}`): MerchantSettings {
  return {
    merchant,
    businessName: "",
    brandColor: DEFAULT_BRAND,
    // Pre-fill with our own logomark so an unconfigured merchant doesn't
    // end up with a placeholder "first-letter-of-businessName" badge. Real
    // merchants overwrite this in Customize the moment they upload their
    // own logo; the value is just an opinionated default for the empty
    // state, not a permanent association.
    logoUrl: "/logo-secudigate.png",
    defaultTreasury: merchant,
    acceptedTokens: ALL_TOKENS,
    acceptedChains: [...ENABLED_CHAIN_IDS],
    defaultChainId: DEFAULT_CHAIN_ID,
    merchantFeeBps: 0,
    merchantFeeReceiver: merchant,
    merchantDailyLimit: "0",
    updatedAt: 0,
  };
}

// Migrate old saved settings that pre-date newer fields. Keeps the store
// backward-compatible without losing the merchant's branding.
function hydrate(raw: Partial<MerchantSettings>, merchant: `0x${string}`): MerchantSettings {
  const base = defaultSettings(merchant);
  return {
    ...base,
    ...raw,
    merchant,
    // logoUrl gained a default after a/b launch — settings saved before
    // that came back with `logoUrl: undefined`, which the spread above
    // preserves. Coalesce empty values to the base default so existing
    // merchants pick up the brand mark without having to manually reset.
    logoUrl: raw.logoUrl && raw.logoUrl.trim() !== "" ? raw.logoUrl : base.logoUrl,
    acceptedChains: raw.acceptedChains?.length ? raw.acceptedChains : base.acceptedChains,
    defaultChainId: raw.defaultChainId ?? base.defaultChainId,
    merchantFeeBps: raw.merchantFeeBps ?? base.merchantFeeBps,
    merchantFeeReceiver: raw.merchantFeeReceiver ?? base.merchantFeeReceiver,
    merchantDailyLimit: raw.merchantDailyLimit ?? base.merchantDailyLimit,
  };
}

export const settingsStore = {
  /// Async fetch of merchant settings. Hits the backend when configured;
  /// falls back to localStorage when the backend isn't reachable or absent.
  async get(merchant: string): Promise<MerchantSettings | undefined> {
    if (isApiEnabled()) {
      try {
        const remote = await getMerchantSettings(merchant);
        if (remote) {
          // Run the API response through hydrate too so old backend rows
          // that pre-date a field (e.g. logoUrl) pick up the current
          // defaults without requiring a manual reset.
          const healed = hydrate(remote, merchant as `0x${string}`);
          // Mirror to localStorage so future reads are instant + offline-tolerant.
          // Silent: this is a cache update, not a user-driven mutation, so it
          // must not trigger the change event (subscribers would re-fetch and
          // we'd loop forever).
          settingsStore.cacheLocally(healed, { silent: true });
          return healed;
        }
      } catch {
        // Fall through to localStorage on network/server errors.
      }
    }
    return readLocal(merchant);
  },

  /// Synchronous read from localStorage only — used by code paths that need
  /// settings before the React tree mounts (very rare). Prefer `get`.
  getCached(merchant: string): MerchantSettings | undefined {
    return readLocal(merchant);
  },

  /// Async fetch with a default fallback for first-time merchants.
  async getOrDefault(merchant: `0x${string}`): Promise<MerchantSettings> {
    return (await settingsStore.get(merchant)) ?? defaultSettings(merchant);
  },

  /// Persist settings. When the API is configured, the API is the source of
  /// truth; localStorage is updated to mirror what the server returned.
  async save(settings: MerchantSettings): Promise<MerchantSettings> {
    let saved: MerchantSettings = { ...settings, updatedAt: Date.now() };
    if (isApiEnabled()) {
      try {
        saved = await putMerchantSettings(settings);
      } catch (e) {
        // If the backend rejects, surface the error to the caller.
        throw e;
      }
    }
    settingsStore.cacheLocally(saved);
    return saved;
  },

  cacheLocally(settings: MerchantSettings, opts: { silent?: boolean } = {}) {
    const map = read();
    map[settings.merchant.toLowerCase()] = settings;
    write(map, opts);
  },

  /// Reset is local-only — there's no backend "delete merchant" endpoint
  /// (registration on-chain is the source of truth for the merchant slot).
  reset(merchant: `0x${string}`) {
    const map = read();
    delete map[merchant.toLowerCase()];
    write(map);
  },

  subscribe(cb: () => void): () => void {
    // In-tab custom events only — we deliberately do NOT subscribe to the
    // cross-tab `storage` event here. Reason: every byte-different write
    // to localStorage fires `storage` in every OTHER tab; when two tabs
    // run useSettings concurrently, each silent cacheLocally write wakes
    // the other tab, which re-fetches, hydrates a freshly-allocated
    // object, and silent-writes back. Even with my JSON-equality short-
    // circuit and an 80ms debounce, a single byte of drift in the
    // response (timestamp, ordering, anything) keeps the loop alive.
    // Cross-tab sync of merchant settings isn't critical for the demo,
    // and a stuck tab just needs a refresh.
    let timer: number | null = null;
    const fire = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => { timer = null; cb(); }, 80);
    };
    window.addEventListener("secudigate:settings-updated", fire);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener("secudigate:settings-updated", fire);
    };
  },
};

function readLocal(merchant: string): MerchantSettings | undefined {
  const map = read();
  const raw = map[merchant.toLowerCase()];
  if (!raw) return undefined;
  if (/^0x[a-fA-F0-9]{40}$/.test(merchant)) {
    return hydrate(raw, merchant as `0x${string}`);
  }
  return raw;
}

export function isValidHexColor(s: string): boolean {
  return /^#([0-9a-fA-F]{6})$/.test(s);
}
