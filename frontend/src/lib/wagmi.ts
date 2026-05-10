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

// Register every chain we plan to support so users can connect to any of
// them — but tokens.ts and chains.ts only expose Sepolia as enabled today.
// Mainnets sit here ready for activation when the gateway contract is
// deployed there and token registry entries are added.
export const wagmiConfig = getDefaultConfig({
  appName: "Secudigate",
  projectId,
  chains: [sepolia, mainnet, bsc, arbitrum, linea, base, optimism, polygon],
  transports: {
    [sepolia.id]:  sepoliaTransport(),
    [mainnet.id]:  http(undefined, HTTP_OPTS),
    [bsc.id]:      http(undefined, HTTP_OPTS),
    [arbitrum.id]: http(undefined, HTTP_OPTS),
    [linea.id]:    http(undefined, HTTP_OPTS),
    [base.id]:     http(undefined, HTTP_OPTS),
    [optimism.id]: http(undefined, HTTP_OPTS),
    [polygon.id]:  http(undefined, HTTP_OPTS),
  },
  ssr: false,
});
