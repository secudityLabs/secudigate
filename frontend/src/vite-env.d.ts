/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
  readonly VITE_SEPOLIA_RPC_URL?: string;
  readonly VITE_PAYMENT_GATEWAY_ADDRESS?: string;
  readonly VITE_USDC_ADDRESS?: string;
  readonly VITE_USDT_ADDRESS?: string;
  readonly VITE_DAI_ADDRESS?: string;
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
