# Stable Pay — frontend

React + Vite + TypeScript app for the demo crypto payment gateway. Wallet UX via RainbowKit; chain reads via wagmi + viem; styling via Tailwind.

## Run it

```bash
cd frontend
cp .env.example .env   # fill in WalletConnect project id
npm install
npm run dev
```

Open http://localhost:5173.

## Routes

- `/` — landing page with token list and how-it-works.
- `/merchant` — merchant dashboard. Connect a wallet → create invoices → copy share links.
- `/pay/:invoiceId` — customer checkout. Shows invoice details and a simulated approve + pay flow.

## State of things

- **Storage is local**: invoices live in `localStorage` (key `stablepay:invoices:v1`). This will be replaced with REST calls to the backend in a later step.
- **Payment is simulated**: the `/pay/:id` page mimics the approve + pay timing without real chain calls. Once the `PaymentGateway` contract is deployed, the simulation gets swapped for `useWriteContract` calls (ERC20 `approve` → gateway `pay`).
- **Token registry is hard-coded** in `src/lib/tokens.ts` against well-known Sepolia stablecoin addresses. Override these to match whatever you decide to whitelist on the contract.

## Environment

| Variable                          | Purpose                                                                |
| --------------------------------- | ---------------------------------------------------------------------- |
| `VITE_WALLETCONNECT_PROJECT_ID`   | Required for WalletConnect modal. Grab one at cloud.walletconnect.com. |
| `VITE_SEPOLIA_RPC_URL`            | Optional. Falls back to the public Sepolia RPC if blank.               |
| `VITE_PAYMENT_GATEWAY_ADDRESS`    | Filled in once the contract is deployed.                               |
| `VITE_API_BASE_URL`               | Backend base URL once the API exists.                                  |
