import { SEPOLIA_ID } from "./chains";

export type StablecoinSymbol = "USDC" | "USDT" | "DAI";

export interface StablecoinInfo {
  chainId: number;
  symbol: StablecoinSymbol;
  name: string;
  decimals: number;
  address: `0x${string}`;
  color: string;
}

// Per-chain token registry. Sepolia addresses fall back to commonly-used
// faucet stablecoins, but each can be overridden via VITE_*_ADDRESS env vars
// — set those after running `forge script script/Deploy.s.sol` so the
// frontend points at your freshly deployed mock stablecoins instead.
function envAddr(value: string | undefined, fallback: `0x${string}`): `0x${string}` {
  if (value && /^0x[a-fA-F0-9]{40}$/.test(value)) return value as `0x${string}`;
  return fallback;
}

const REGISTRY: Record<number, Partial<Record<StablecoinSymbol, StablecoinInfo>>> = {
  [SEPOLIA_ID]: {
    USDC: {
      chainId: SEPOLIA_ID,
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
      address: envAddr(import.meta.env.VITE_USDC_ADDRESS, "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"),
      color: "#2775ca",
    },
    USDT: {
      chainId: SEPOLIA_ID,
      symbol: "USDT",
      name: "Tether USD",
      decimals: 6,
      address: envAddr(import.meta.env.VITE_USDT_ADDRESS, "0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0"),
      color: "#26a17b",
    },
    DAI: {
      chainId: SEPOLIA_ID,
      symbol: "DAI",
      name: "Dai Stablecoin",
      decimals: 18,
      address: envAddr(import.meta.env.VITE_DAI_ADDRESS, "0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357"),
      color: "#f5ac37",
    },
  },
};

const ALL_SYMBOLS: StablecoinSymbol[] = ["USDC", "USDT", "DAI"];

export const SUPPORTED_SYMBOLS: StablecoinSymbol[] = ALL_SYMBOLS;

// Brand colors for symbols regardless of chain — used for UI chips when no
// token entry exists yet (e.g. on a chain we haven't populated).
const SYMBOL_COLORS: Record<StablecoinSymbol, string> = {
  USDC: "#2775ca",
  USDT: "#26a17b",
  DAI: "#f5ac37",
};

export function symbolColor(symbol: StablecoinSymbol): string {
  return SYMBOL_COLORS[symbol];
}

export function getTokensForChain(chainId: number): StablecoinInfo[] {
  const map = REGISTRY[chainId];
  if (!map) return [];
  return ALL_SYMBOLS.map((s) => map[s]).filter((t): t is StablecoinInfo => Boolean(t));
}

export function getToken(chainId: number, symbol: StablecoinSymbol): StablecoinInfo | undefined {
  return REGISTRY[chainId]?.[symbol];
}

export function chainHasTokens(chainId: number): boolean {
  return getTokensForChain(chainId).length > 0;
}
