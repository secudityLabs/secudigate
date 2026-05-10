import { createPublicClient, fallback, http } from "viem";
import { sepolia } from "viem/chains";
import { config } from "../config.js";

// 30s timeout — viem's default 10s is too tight when the app sits behind a
// slow VPN/proxy. Indexer ticks happen every INDEXER_POLL_MS, so spending up
// to a third of that on a single RPC call is acceptable.
const HTTP_OPTS = { timeout: 30_000, retryCount: 3 };

// Fallback chain: if the operator configured a Sepolia RPC, trust it
// exclusively — in restricted/proxied networks the public endpoints below
// are often DNS-blocked and would just burn retries before failing. Only
// fall through to public endpoints when no RPC was configured at all.
const urls: string[] = config.SEPOLIA_RPC_URL
  ? [config.SEPOLIA_RPC_URL]
  : [
      "https://ethereum-sepolia.publicnode.com",
      "https://sepolia.gateway.tenderly.co",
      "https://rpc.sepolia.org",
    ];

export const sepoliaClient = createPublicClient({
  chain: sepolia,
  transport: fallback(urls.map((u) => http(u, HTTP_OPTS))),
});
