import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { fallback, http } from "viem";
import {
  sepolia,
  mainnet,
  bsc,
  arbitrum,
  linea,
  base,
  optimism,
  polygon,
} from "wagmi/chains";

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? "secudigate-demo";
const sepoliaRpc = import.meta.env.VITE_SEPOLIA_RPC_URL;

// Tuning for flaky / proxied networks. The default 10s timeout + 3 retries
// is fine on a residential connection but loses races behind a VPN.
const HTTP_OPTS = { timeout: 30_000, retryCount: 5, retryDelay: 250 };

// Sepolia gets a fallback transport so a single RPC hiccup doesn't break
// the pay-flow's pre-simulation. Order matters: viem picks the first
// healthy one. If the user explicitly configured a Sepolia RPC, trust it
// and skip the public fallbacks — in restricted/proxied networks the
// public endpoints are often unreachable (DNS-blocked) and would just
// waste retry budget before failing the same way.
function sepoliaTransport() {
  const urls = sepoliaRpc
    ? [sepoliaRpc]
    : [
        "https://ethereum-sepolia.publicnode.com",
        "https://sepolia.gateway.tenderly.co",
        "https://rpc.sepolia.org",
      ];
  return fallback(urls.map((u) => http(u, HTTP_OPTS)));
}

// All chains here register for the wallet selector; only Sepolia is enabled
// in tokens.ts / chains.ts. Every transport must use an explicit CORS-friendly
// RPC — viem's defaults (eth.merkle.io for mainnet, etc.) reject browser CORS
// and rate-limit. Do not collapse these back to `http(undefined)`.
export const wagmiConfig = getDefaultConfig({
  appName: "Secudigate",
  projectId,
  chains: [sepolia, mainnet, bsc, arbitrum, linea, base, optimism, polygon],
  transports: {
    [sepolia.id]:  sepoliaTransport(),
    [mainnet.id]:  fallback([
      http("https://cloudflare-eth.com", HTTP_OPTS),
      http("https://eth.llamarpc.com", HTTP_OPTS),
      http("https://ethereum-rpc.publicnode.com", HTTP_OPTS),
    ]),
    [bsc.id]:      fallback([
      http("https://bsc-rpc.publicnode.com", HTTP_OPTS),
      http("https://binance.llamarpc.com", HTTP_OPTS),
    ]),
    [arbitrum.id]: fallback([
      http("https://arbitrum-one-rpc.publicnode.com", HTTP_OPTS),
      http("https://arbitrum.llamarpc.com", HTTP_OPTS),
    ]),
    [linea.id]:    fallback([
      http("https://linea-rpc.publicnode.com", HTTP_OPTS),
      http("https://1rpc.io/linea", HTTP_OPTS),
    ]),
    [base.id]:     fallback([
      http("https://base-rpc.publicnode.com", HTTP_OPTS),
      http("https://base.llamarpc.com", HTTP_OPTS),
    ]),
    [optimism.id]: fallback([
      http("https://optimism-rpc.publicnode.com", HTTP_OPTS),
      http("https://optimism.llamarpc.com", HTTP_OPTS),
    ]),
    [polygon.id]:  fallback([
      http("https://polygon-bor-rpc.publicnode.com", HTTP_OPTS),
      http("https://polygon.llamarpc.com", HTTP_OPTS),
    ]),
  },
  ssr: false,
});
