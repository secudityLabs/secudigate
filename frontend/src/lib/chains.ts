// Chain registry. Adding a new chain = one entry here + populating its token
// addresses in tokens.ts + flipping `enabled: true`.
//
// `enabled: false` means the chain is visible in the Customize UI as
// "Coming soon" but cannot be toggled on or used. Sepolia is the only
// active chain for the testnet demo.

export interface ChainInfo {
  id: number;
  key: string;            // short key for URL-style references
  name: string;
  shortName: string;
  testnet: boolean;
  enabled: boolean;
  explorerUrl: string;    // base, append /tx/<hash> or /address/<addr>
  faucetUrl?: string;
  iconColor: string;      // chip background
  iconLetter: string;     // single-letter mark
}

// Sepolia is the only testnet we ship today; everything else is mainnet
// (disabled until the gateway contract is deployed there).
export const SEPOLIA_ID = 11155111;
export const ETHEREUM_ID = 1;
export const BSC_ID = 56;
export const ARBITRUM_ONE_ID = 42161;
export const LINEA_ID = 59144;
export const BASE_ID = 8453;
export const OPTIMISM_ID = 10;
export const POLYGON_ID = 137;

export const CHAINS: Record<number, ChainInfo> = {
  [SEPOLIA_ID]: {
    id: SEPOLIA_ID,
    key: "sepolia",
    name: "Ethereum Sepolia",
    shortName: "Sepolia",
    testnet: true,
    enabled: true,
    explorerUrl: "https://sepolia.etherscan.io",
    faucetUrl: "https://sepoliafaucet.com",
    iconColor: "#627eea",
    iconLetter: "E",
  },
  [ETHEREUM_ID]: {
    id: ETHEREUM_ID,
    key: "ethereum",
    name: "Ethereum",
    shortName: "Ethereum",
    testnet: false,
    enabled: false,
    explorerUrl: "https://etherscan.io",
    iconColor: "#3c3c3d",
    iconLetter: "Ξ",
  },
  [BSC_ID]: {
    id: BSC_ID,
    key: "bsc",
    name: "BNB Smart Chain",
    shortName: "BSC",
    testnet: false,
    enabled: false,
    explorerUrl: "https://bscscan.com",
    iconColor: "#f3ba2f",
    iconLetter: "B",
  },
  [ARBITRUM_ONE_ID]: {
    id: ARBITRUM_ONE_ID,
    key: "arbitrum",
    name: "Arbitrum One",
    shortName: "Arbitrum",
    testnet: false,
    enabled: false,
    explorerUrl: "https://arbiscan.io",
    iconColor: "#28a0f0",
    iconLetter: "A",
  },
  [LINEA_ID]: {
    id: LINEA_ID,
    key: "linea",
    name: "Linea",
    shortName: "Linea",
    testnet: false,
    enabled: false,
    explorerUrl: "https://lineascan.build",
    iconColor: "#121212",
    iconLetter: "L",
  },
  [BASE_ID]: {
    id: BASE_ID,
    key: "base",
    name: "Base",
    shortName: "Base",
    testnet: false,
    enabled: false,
    explorerUrl: "https://basescan.org",
    iconColor: "#0052ff",
    iconLetter: "B",
  },
  [OPTIMISM_ID]: {
    id: OPTIMISM_ID,
    key: "optimism",
    name: "OP Mainnet",
    shortName: "Optimism",
    testnet: false,
    enabled: false,
    explorerUrl: "https://optimistic.etherscan.io",
    iconColor: "#ff0420",
    iconLetter: "O",
  },
  [POLYGON_ID]: {
    id: POLYGON_ID,
    key: "polygon",
    name: "Polygon",
    shortName: "Polygon",
    testnet: false,
    enabled: false,
    explorerUrl: "https://polygonscan.com",
    iconColor: "#8247e5",
    iconLetter: "P",
  },
};

export const CHAIN_LIST: ChainInfo[] = Object.values(CHAINS);
export const ENABLED_CHAINS: ChainInfo[] = CHAIN_LIST.filter((c) => c.enabled);
export const ENABLED_CHAIN_IDS: number[] = ENABLED_CHAINS.map((c) => c.id);
export const DEFAULT_CHAIN_ID = SEPOLIA_ID;

export function getChain(id: number): ChainInfo | undefined {
  return CHAINS[id];
}

export function getChainOrDefault(id: number | undefined): ChainInfo {
  return (id !== undefined ? CHAINS[id] : undefined) ?? CHAINS[DEFAULT_CHAIN_ID];
}

export function explorerTxUrl(chainId: number, txHash: string): string {
  const base = getChainOrDefault(chainId).explorerUrl;
  return `${base}/tx/${txHash}`;
}
