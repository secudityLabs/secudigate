# Secudigate

[![CI](https://github.com/secuditylabs/secudigate/actions/workflows/test.yml/badge.svg)](https://github.com/secuditylabs/secudigate/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-7c5cff.svg)](LICENSE)
[![Sepolia](https://img.shields.io/badge/network-sepolia-f59e0b.svg)](https://sepolia.etherscan.io/)
[![Tests](https://img.shields.io/badge/forge%20tests-157%20passing-22c55e.svg)](test/)
[![Security](https://img.shields.io/badge/SECURITY.md-published-22c55e.svg)](SECURITY.md)

**An open-source, non-custodial stablecoin payment gateway for the wallet-native economy.**

Secudigate turns any wallet into a merchant-grade checkout: merchants share
a link, customers click and pay, and the merchant's backend gets a signed
webhook the moment the funds arrive — with no custody, no manual
reconciliation, no chargebacks.

> Status: **Sepolia testnet · 157 tests passing (incl. 80 adversarial) · audit pending**.
> Mainnet readiness is gated by an external security audit (see [Roadmap](#roadmap)).
> Full test breakdown in [`SECURITY.md`](SECURITY.md).

---

## Live demo

Try the dashboard at **[secudigate.com](https://secudigate.com)** — running in **demo mode**.

- The contract is **live on Sepolia testnet** at [`0x5d398ab8…AB612`](https://sepolia.etherscan.io/address/0x5d398ab8AaB4D49c0694271959Ca06A3fD3AB612). Wallet connect, on-chain `pay()` / `quote()` / merchant registration, and the embeddable checkout flow all work end-to-end against the deployed contract.
- The merchant dashboard persists state **in your browser's `localStorage`** — no backend is hosted publicly, so each visitor sees only their own session. The full Fastify backend (chain indexer + HMAC-signed webhook dispatcher) ships in this repo; self-host the [`backend/`](backend/) directory to enable cross-device sync and webhook delivery.
- Need Sepolia ETH? Use any faucet (e.g. [sepoliafaucet.com](https://sepoliafaucet.com)). Mint test stablecoins via the `/admin` page after connecting your wallet.

---

## Why this exists

Crypto payments are technically possible today — anyone can publish a wallet
address. But running a real business on top of *"send USDC to 0xabc…"* is
operationally brutal: no correlation between payments and orders, no expiry,
no partial-payment handling, no webhooks, no token enforcement, no audit
trail. Existing custodial alternatives (Coinbase Commerce, BitPay,
NOWPayments) all take custody of the merchant's funds — which is exactly the
regulatory + reputational risk surface a non-custodial protocol can avoid.

**Secudigate is the operational layer** that turns raw stablecoin transfers
into *payments*. The contract is open, the funds go straight from the
payer's wallet to the merchant's treasury in one transaction, and the
backend speaks the same webhook + REST patterns every developer already
knows.

---

## What's in the box

- **Smart contract** ([`src/Secudigate.sol`](src/Secudigate.sol)) — multi-tenant,
  one-tx fee deduction (platform + optional merchant fee + net to treasury,
  all in the same transaction), per-payer USD daily cap via Chainlink price
  feeds, OFAC sanctions screening, fully open-source. **157 tests** including
  an [80-test adversarial suite](test/attacks/) and Foundry stateful invariants.
- **Backend API** ([`backend/`](backend/)) — Node 20 · TypeScript · Fastify ·
  Prisma · SQLite · viem. REST API for invoices / deposit links / settings,
  chain indexer that watches `PaymentReceived` and `DepositReceived` events,
  HMAC-signed webhook dispatcher with retries and per-delivery audit log.
- **Frontend dashboard** ([`frontend/`](frontend/)) — React · Vite · wagmi ·
  RainbowKit · TailwindCSS. Branded checkout pages, invoice + deposit-link
  management, analytics, webhooks UI, and an `/admin` console for operators.
- **Embed snippet** — one `<script>` tag drops a styled "Pay with Secudigate"
  button onto any HTML page.

---

## Architecture

```
┌──────────────┐   1. signs pay()   ┌────────────────┐
│  Customer    │ ─────────────────▶ │   Secudigate   │
│  wallet      │                    │   contract     │  3 transfers in 1 tx:
└──────────────┘                    │  (no custody)  │   - platform fee
                                    └────────┬───────┘   - merchant fee
                                             │           - net to treasury
            emits PaymentReceived event      │
                                             ▼
                                    ┌────────────────┐
                                    │  Chain indexer │  2. ingests events
                                    │  (Node + viem) │
                                    └────────┬───────┘
                                             │
                                             ▼ 3. HMAC-signed POST
                                    ┌────────────────┐
                                    │  Merchant's    │  4. ships order
                                    │  backend       │
                                    └────────────────┘
```

The contract is the source of truth. The backend is convenience: it indexes
events, persists invoice metadata, signs and retries webhook deliveries. A
merchant could in principle interact with the contract directly — but in
practice nobody wants to write that plumbing themselves, which is the value
the operator layer adds.

---

## Quick start (local)

You need: Foundry, Node 20+, a Sepolia RPC URL, and a test wallet with some
Sepolia ETH.

```bash
# 1. Contracts: build + test
forge install
forge build
forge test           # 157 tests should pass

# 2. Deploy to Sepolia (or skip and use the public Sepolia deployment)
forge script script/Deploy.s.sol:Deploy \
  --rpc-url $SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast

# 3. Backend
cd backend
cp .env.example .env  # set SEPOLIA_RPC_URL + deployed addresses
npm install
npx prisma migrate dev
npm run dev           # http://localhost:3001

# 4. Frontend
cd ../frontend
cp .env.example .env  # set VITE_PAYMENT_GATEWAY_ADDRESS + token addresses
npm install
npm run dev           # http://localhost:5173
```

Full developer walkthrough: [`docs/integration.md`](docs/integration.md).

---

## Public demo deploy

The frontend is a standard Vite SPA. Vercel and Cloudflare Pages both work
out of the box; SPA-rewrite config ships with the repo.

**Vercel** (recommended):

1. Import the repo in the Vercel dashboard.
2. Set **Root directory** = `frontend`.
3. Framework preset is auto-detected (Vite). `vercel.json` handles the
   rewrites + security headers.
4. Env vars: copy from `frontend/.env.example`. **Leave `VITE_API_BASE_URL`
   blank** for the public demo — the app falls back to a localStorage-only
   mode that doesn't need a hosted backend. Set the four contract addresses
   that `forge script script/Deploy.s.sol` printed.
5. Deploy. The site lives at `<your-project>.vercel.app`; you can attach
   a custom domain later.

**Cloudflare Pages** is identical: point at `frontend/` as the project
root, set the same env vars, and the bundled `public/_redirects` file
handles SPA fallback.

> Backend hosting is **intentionally not required** for the public demo.
> Without a backend the dashboard is single-tab / localStorage-only — fine
> for showing the flow, dodges the operational + compliance footprint of
> running a server. Spin up a backend on Railway / Fly.io / Render only
> when a specific user needs persistent storage or webhook delivery.

---

## Repo layout

```
.
├── src/                     # Solidity contracts
│   ├── Secudigate.sol       # The gateway
│   ├── interfaces/          # AggregatorV3, IChainalysisSanctionsList
│   └── mocks/               # MockStablecoin, MockAggregator, MockSanctionsList
├── script/Deploy.s.sol      # Foundry deploy script
├── test/                    # Foundry tests (157 total)
│   ├── Secudigate.t.sol     # main suite
│   └── attacks/             # 80-test adversarial suite + invariants
├── backend/                 # Fastify API + chain indexer + webhook dispatcher
│   └── src/
│       ├── chain/           # viem client, ABI, indexer
│       ├── webhooks/        # HMAC dispatcher with retries
│       └── routes/          # REST endpoints
├── frontend/                # React/Vite/wagmi dashboard
│   └── src/
│       ├── pages/           # Home, Merchant, Customize, Pay, Deposit, Admin…
│       ├── components/      # GeoGate, AdminGate, RegistrationModal…
│       └── lib/             # storage, settings, txErrors, geoBlock…
├── docs/                    # Integration guide, threat model, demo script
└── SECURITY.md              # Threat model, full per-test breakdown, disclosure
```

---

## Feature highlights

- **Non-custodial by construction.** The contract holds no funds at any
  point. Each `pay()` does three direct `transferFrom`s (platform fee →
  merchant fee → net to treasury) atomically.
- **USD-denominated daily caps via Chainlink.** Per-payer limits are set in
  dollars (e.g. "$25/day") and applied across all accepted tokens, with the
  contract converting each payment using the configured price feed.
- **OFAC sanctions screening.** Plug in the [Chainalysis sanctions oracle](https://go.chainalysis.com/chainalysis-oracle-docs.html)
  via `setSanctionsList(address)`; both payer and merchant are screened on
  every payment. Free; ~5k gas per call.
- **HMAC-signed webhooks.** SHA-256 signature in `x-secudigate-signature`,
  retries with exponential backoff, per-delivery audit log queryable via
  API, 24h dual-secret rotation grace window.
- **Geo-block** on the hosted front-end for comprehensive-embargo
  jurisdictions (Iran, North Korea, Cuba, Syria) — soft gate at the UI
  layer; the contract's sanctions oracle is the hard gate.
- **Admin console** at `/admin`, gated client-side by `owner()` /
  `isAdmin()` and server-side by the contract's `onlyOwner` /
  `onlyRole(ADMIN_ROLE)` modifiers.
- **Merchant slots are admin-immutable.** The protocol operator (you) can
  set platform-level config (fee, receiver, pause, sanctions oracle, price
  feeds) but **cannot** edit any merchant's treasury, fee, or daily-limit.
  Merchants self-gate via `msg.sender`. This is intentional: the operator
  cannot rug an individual merchant.

---

## Security

**Posture:**
- **Open-source contract**, MIT-licensed.
- **No `selfdestruct`, no upgradability, no proxy.** The contract you deploy
  is the contract that runs forever.
- **No fund custody.** There is no `withdraw`, no escrow, no balance held by
  the contract.
- **OpenZeppelin v5** for `Ownable`, `AccessControl`, `Pausable`,
  `ReentrancyGuard`, `SafeERC20`.

**Test coverage — 157 passing, 0 failing:**
- **80-test adversarial suite** across 9 files under [`test/attacks/`](test/attacks/)
  covering reentrancy, malicious tokens (return-false / reverting / fee-on-transfer /
  USDT-shaped), price-feed manipulation, access-control bypasses, sanctions oracle
  attacks, daily-limit boundaries, replay protection, and gas griefing.
- **Foundry stateful invariants** assert that *the gateway never holds tokens*
  and that token supply is conserved across 128,000 randomized operations.
- **Property-based fuzz** on fee math: sum-to-gross, cap respect, no-custody, atomic-or-revert.

**Process:**
- **External audit**: not yet completed. Tracked in the roadmap below.
- **Threat model**: [`docs/threat-model.md`](docs/threat-model.md).
- **Full test breakdown + disclosure policy**: [`SECURITY.md`](SECURITY.md).
- **Runtime disclosure page**: `/security` route on the hosted demo.
- **Security contact**: `security@secudigate.com`. We aim to acknowledge new
  reports within 48 hours.

---

## Roadmap

**Done**
- [x] Multi-tenant contract with one-tx fee deduction (platform + optional merchant fee + net, all atomic)
- [x] Daily USD caps via Chainlink price feeds
- [x] OFAC sanctions screen (Chainalysis oracle)
- [x] HMAC webhook dispatcher with retries
- [x] Webhook secret rotation with 24h dual-verify grace window
- [x] Chain indexer with cursor + fallback RPC transport
- [x] Merchant dashboard (invoices, deposit links, branding, webhooks)
- [x] Customer pay + deposit pages with QR codes + fee preview
- [x] Embed snippet for one-line HTML integration
- [x] Admin console at `/admin`
- [x] Sign-In-With-Ethereum (EIP-4361) auth on the dashboard API
- [x] Geo-block + disclosure policy
- [x] 157 contract tests including 80-test adversarial suite and Foundry stateful invariants
- [x] Public threat model + per-test breakdown ([`SECURITY.md`](SECURITY.md))

**Next**
- [ ] External security audit
- [ ] Mainnet deployment
- [ ] Multi-chain enable (Base, Arbitrum, Optimism, Polygon, BNB, Linea —
  already registered in `tokens.ts`, awaiting per-chain deploy)
- [ ] Fiat on-ramp partnerships (Ramp, Transak, MoonPay)

---

## Contributing

Pseudonymous PRs welcome. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the
local setup, repo conventions, and "good first issue" scope.

---

## License

[MIT](LICENSE). The contract, dashboard, embed snippet, backend, and docs
are all freely usable. Forks are encouraged; if you ship something
interesting on top, drop us a note.

---

## Contact

- Security disclosures: `security@secudigate.com` (policy: [`SECURITY.md`](SECURITY.md))
- General: see the `/docs` route on the running app

This is open-source infrastructure. It is not financial, legal, or tax
advice. Merchants integrating Secudigate are responsible for their own
KYC/AML obligations toward their customers.
