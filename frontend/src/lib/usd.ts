import type { StablecoinSymbol } from "./tokens";

// Demo-only USD rates. All supported tokens are USD-pegged stablecoins, so
// we use 1.0 across the board. Swap this for a price-oracle feed later.
const RATES: Record<StablecoinSymbol, number> = {
  USDC: 1,
  USDT: 1,
  DAI: 1,
};

export function tokenToUsd(symbol: StablecoinSymbol, amount: string | number): number {
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n)) return 0;
  return n * RATES[symbol];
}

export function formatUsd(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
