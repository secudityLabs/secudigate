# Contributing

Thanks for your interest in Secudigate. This is open-source infrastructure;
pseudonymous contributions are welcome.

## Ground rules

- **Be a good citizen.** Don't open spam PRs to farm contributor stats.
- **Security issues do NOT go in public issues.** Email
  `security@secudigate.com` instead — see [`/security`](frontend/src/pages/Security.tsx).
- **One concern per PR.** A bug fix shouldn't also rename a variable or
  reformat a file. Reviewers will ask you to split it.
- **No new dependencies without a reason.** The repo is intentionally lean.
  If your PR adds a package to `package.json`, justify it in the PR
  description.

## Local setup

You need:
- Foundry ([install](https://book.getfoundry.sh/getting-started/installation))
- Node 20+ (`nvm install 20`)
- A Sepolia RPC URL (free tier from Alchemy or Infura is fine)
- A test wallet with some Sepolia ETH from [sepoliafaucet.com](https://sepoliafaucet.com)

```bash
# Clone
git clone https://github.com/<org>/secudigate
cd secudigate

# Contracts
forge install
forge build
forge test           # all tests should pass

# Backend
cd backend
cp .env.example .env # fill in SEPOLIA_RPC_URL + deployed addresses
npm install
npx prisma migrate dev
npm run dev

# Frontend (in a separate terminal)
cd ../frontend
cp .env.example .env # fill in VITE_PAYMENT_GATEWAY_ADDRESS + token addresses
npm install
npm run dev
```

Without a Sepolia deployment, the frontend falls back to a client-side
simulation so you can develop the UI end-to-end. To exercise the real
contract flow, run `forge script script/Deploy.s.sol:Deploy --broadcast`
and copy the printed addresses into the `.env` files.

## Repo conventions

- **TypeScript everywhere.** No JavaScript files in `frontend/` or `backend/`.
- **Solidity 0.8.24** for contracts, OpenZeppelin v5.
- **Strict type-check before submitting:**
  ```bash
  (cd frontend && npx tsc --noEmit)
  (cd backend && npx tsc --noEmit)
  forge test
  ```
- **No `console.log` in production paths.** `console.warn` for best-effort
  failures (RPC outages, etc.) is fine.
- **Comments explain why, not what.** A well-named function doesn't need a
  one-line summary. Comments are for non-obvious invariants, references to
  past incidents, or workarounds.
- **No emojis in code or commit messages** unless the user explicitly opts
  in. Markdown files like this one are OK.

## Where to start

Good first issues are tagged in the issue tracker. If you don't see one
that fits, areas where help is welcome:

- **Multi-chain enablement.** Token + chain registry entries for Base,
  Arbitrum, Optimism, Polygon, BNB, Linea. Per-chain deploy of the gateway.
- **Wallet adapter coverage.** Right now the dashboard is RainbowKit-only.
  A WalletConnect v2 SIWE flow would help.
- **Indexer optimization.** The current implementation polls; an event-
  subscription mode (eth_subscribe) for WSS RPCs would lower latency.
- **Translations.** The dashboard is English-only.
- **Audit findings.** Once the audit lands, fixing flagged issues.

## Commit + PR style

- Commit messages: imperative mood, short, no period.
  - Good: `fix indexer cursor desync on RPC fallback`
  - Bad: `Fixed the bug.`
- PR titles: scope-tagged.
  - `contract: foo`, `backend: bar`, `frontend: baz`, `docs: qux`.
- PR descriptions answer: **what changed**, **why**, and **how to test**.

## Code of conduct

Don't be a jerk. Personal attacks, harassment, or off-topic political
flamewars get the PR closed and the author blocked. Beyond that, we trust
contributors to be adults.

## License

By contributing you agree your changes are licensed under the
[MIT license](LICENSE) of this repo.
