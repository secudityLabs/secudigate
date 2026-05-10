import { erc20Abi, formatUnits } from "viem";
import { sepoliaClient } from "./client.js";
import { config } from "../config.js";

type Symbol = "USDC" | "USDT" | "DAI";

const KNOWN: Record<string, Symbol> = {};
function register(addr: string | undefined, symbol: Symbol) {
  if (!addr) return;
  KNOWN[addr.toLowerCase()] = symbol;
}
register(config.SEPOLIA_USDC_ADDRESS, "USDC");
register(config.SEPOLIA_USDT_ADDRESS, "USDT");
register(config.SEPOLIA_DAI_ADDRESS,  "DAI");

export function symbolForToken(address: string): Symbol | undefined {
  return KNOWN[address.toLowerCase()];
}

const decimalsCache = new Map<string, number>();

// Cached on-chain decimals lookup; falls back to 18 on revert.
export async function getDecimals(token: `0x${string}`): Promise<number> {
  const key = token.toLowerCase();
  const cached = decimalsCache.get(key);
  if (cached !== undefined) return cached;
  try {
    const d = await sepoliaClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "decimals",
    });
    decimalsCache.set(key, Number(d));
    return Number(d);
  } catch {
    decimalsCache.set(key, 18);
    return 18;
  }
}

export function formatTokenAmount(wei: bigint, decimals: number): string {
  return formatUnits(wei, decimals);
}
