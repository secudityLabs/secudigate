# Secudigate backend

Node 20 + TypeScript + Fastify + Prisma + SQLite + viem. REST API that backs
the merchant dashboard, the customer pay/deposit pages, and (next iteration)
indexes the gateway's on-chain events into webhooks.

## Quickstart

```bash
cd backend

# 1. Install deps (run yourself — agent does not run npm installs).
npm install

# 2. Create a local .env from the template.
cp .env.example .env

# 3. Generate Prisma client + create the SQLite schema.
npm run prisma:generate
npm run prisma:migrate    # name the first migration when prompted, e.g. "init"

# 4. Run the dev server.
npm run dev               # boots on http://localhost:4000
```

You should be able to:

```bash
curl http://localhost:4000/v1/health
# → { ok: true, name: "secudigate-backend", ... }
```

## API surface

All authenticated endpoints expect a header `x-merchant-address: 0x…` (DEMO
auth — replace with SIWE/EIP-4361 before production). Public endpoints below
have no auth.

| Method | Path                                  | Auth | Purpose                                            |
| ------ | ------------------------------------- | ---- | -------------------------------------------------- |
| GET    | `/v1/health`                          |  —   | Liveness probe                                     |
| GET    | `/v1/merchants/:address`              |  —   | Read off-chain merchant settings (branding etc.)   |
| PUT    | `/v1/merchants/me/settings`           |  ✓   | Upsert caller's merchant settings                  |
| GET    | `/v1/invoices/:id`                    |  —   | Fetch a single invoice (used by `/pay/:id`)        |
| GET    | `/v1/invoices?status=&scope=`         |  ✓   | List invoices (default: ones the caller created)   |
| POST   | `/v1/invoices`                        |  ✓   | Create an invoice                                  |
| POST   | `/v1/invoices/:id/cancel`             |  ✓   | Cancel a pending invoice                           |
| GET    | `/v1/deposit-links/:slug`             |  —   | Fetch a deposit link (used by `/deposit/:slug`)    |
| GET    | `/v1/deposit-links`                   |  ✓   | List caller's deposit links                        |
| POST   | `/v1/deposit-links`                   |  ✓   | Create a deposit link                              |
| PATCH  | `/v1/deposit-links/:slug`             |  ✓   | Edit a deposit link                                |
| DELETE | `/v1/deposit-links/:slug`             |  ✓   | Remove a deposit link                              |
| GET    | `/v1/deposits?linkSlug=&limit=`       |  ✓   | List deposits for the caller's merchant            |
| GET    | `/v1/webhooks`                        |  ✓   | List webhooks                                      |
| POST   | `/v1/webhooks`                        |  ✓   | Register a webhook (full secret returned ONCE)     |
| PATCH  | `/v1/webhooks/:id`                    |  ✓   | Edit a webhook (url/events/active)                 |
| DELETE | `/v1/webhooks/:id`                    |  ✓   | Remove a webhook                                   |

## What's still TODO

Tracked separately from this scaffold; will land in the next iteration:

- **Chain indexer** — watches `Secudigate.PaymentReceived` and
  `Secudigate.DepositReceived` events on Sepolia and writes invoice / deposit
  rows when they land. Needs `SEPOLIA_PAYMENT_GATEWAY_ADDRESS` set.
- **Webhook dispatcher** — HMAC-signed POSTs to `Webhook.url`, with retries
  and `WebhookDelivery` records.
- **SIWE auth** — replace the trusted-header model with EIP-4361 sign-in.
- **Frontend wiring** — flip `frontend/src/lib/storage.ts` etc. from
  localStorage to `fetch` against `VITE_API_BASE_URL`.

## Folder layout

```
backend/
  prisma/schema.prisma     # Merchant, Invoice, DepositLink, Deposit, Webhook, IndexerState
  src/
    config.ts              # zod-validated env loader
    db.ts                  # Prisma client
    index.ts               # Fastify bootstrap
    lib/
      auth.ts              # demo auth: x-merchant-address header
      ids.ts               # bytes32 invoice id, slug suggester, secrets
    plugins/
      error-handler.ts     # zod + Prisma error mapping
    routes/
      health.ts
      merchants.ts
      invoices.ts
      deposit-links.ts
      deposits.ts
      webhooks.ts
```
