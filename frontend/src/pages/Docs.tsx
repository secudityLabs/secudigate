import { Link } from "react-router-dom";

// Documentation hub. Three audiences, one page:
//   - Merchants: onboarding, configuring, going live.
//   - Developers: architecture, API, contract, webhooks, embed.
//   - Payers:    what paying a Secudigate invoice actually looks like.
//
// Each anchor is bookmarkable. The sidebar TOC is grouped by audience so
// readers can jump straight into their lane without scrolling.
export default function Docs() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-10 py-8">
      <aside className="hidden lg:block">
        <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-2">
          <div className="text-xs uppercase tracking-widest text-ink-faint mb-3">Documentation</div>

          <TocGroup label="Start here">
            <TocItem id="overview">What is Secudigate?</TocItem>
            <TocItem id="architecture">Architecture at a glance</TocItem>
            <TocItem id="status">Status &amp; roadmap</TocItem>
          </TocGroup>

          <TocGroup label="For merchants">
            <TocItem id="m-quickstart">Quickstart</TocItem>
            <TocItem id="m-customize">Customize your gateway</TocItem>
            <TocItem id="m-invoices">Issuing an invoice</TocItem>
            <TocItem id="m-freelance">Freelancer billing</TocItem>
            <TocItem id="m-deposits">Deposit links</TocItem>
            <TocItem id="m-webhooks">Webhooks</TocItem>
            <TocItem id="m-mainnet">Going to mainnet</TocItem>
          </TocGroup>

          <TocGroup label="For developers">
            <TocItem id="d-auth">Authentication (SIWE)</TocItem>
            <TocItem id="d-api">REST API</TocItem>
            <TocItem id="d-webhooks">Webhook verification</TocItem>
            <TocItem id="d-rotation">Secret rotation</TocItem>
            <TocItem id="d-embed">Embed snippet</TocItem>
            <TocItem id="d-contract">Smart contract</TocItem>
            <TocItem id="d-chains">Chains</TocItem>
            <TocItem id="d-selfhost">Self-hosting</TocItem>
          </TocGroup>

          <TocGroup label="For payers">
            <TocItem id="p-pay">How to pay an invoice</TocItem>
            <TocItem id="p-custody">What "non-custodial" means</TocItem>
            <TocItem id="p-receipt">Reading your transaction</TocItem>
            <TocItem id="p-refunds">Refunds &amp; disputes</TocItem>
            <TocItem id="p-gas">Network fees &amp; gas</TocItem>
          </TocGroup>

          <TocGroup label="Reference">
            <TocItem id="r-security">Security model</TocItem>
            <TocItem id="r-tests">Test coverage</TocItem>
            <TocItem id="r-license">License &amp; open source</TocItem>
            <TocItem id="r-contact">Security disclosure</TocItem>
          </TocGroup>
        </div>
      </aside>

      <main className="prose-secudigate">
        <Header />

        {/* ────────── Start here ────────── */}
        <Section id="overview" title="What is Secudigate?">
          <p>
            Secudigate is an open-source, non-custodial stablecoin payment
            gateway. A merchant shares a pay link, a customer clicks and
            pays, and the merchant's backend gets a signed webhook the
            moment the funds settle on-chain. The gateway contract never
            holds the money — every payment routes directly from the
            payer's wallet to the merchant's treasury in a single
            transaction, alongside an optional platform fee.
          </p>
          <p>
            You can use Secudigate three different ways, all backed by the
            same smart contract:
          </p>
          <ul className="text-sm text-ink-dim list-disc pl-5 space-y-1 mt-2">
            <li><strong>E-commerce / marketplace invoices</strong> — fixed-amount, single-use, expirable. Customer follows a <code>/pay/:id</code> link.</li>
            <li><strong>Freelancer billing</strong> — same invoice primitive, plus client name + sequential invoice number. No "merchant fee on customer" surface, just the platform's network fee.</li>
            <li><strong>Account-funding deposit links</strong> — reusable, open-amount, customer-tagged with a reference (account number, user ID). Built for forex brokers and exchanges.</li>
          </ul>
        </Section>

        <Section id="architecture" title="Architecture at a glance">
          <div className="not-prose grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card title="Smart contract">
              <p className="text-sm text-ink-dim">
                One <code>Secudigate</code> contract per chain. Multi-tenant
                — merchants self-register their treasury, fee config, and
                an optional per-payer USD daily cap.
              </p>
              <p className="text-sm text-ink-dim mt-2">
                Reads token amounts in USD via Chainlink price feeds.
                Screens both payer and merchant against the Chainalysis
                on-chain sanctions oracle on every call.
              </p>
            </Card>
            <Card title="Backend">
              <p className="text-sm text-ink-dim">
                Node 20 + Fastify + Prisma + SQLite. REST API for invoices,
                deposit links, settings, webhooks. A chain indexer watches
                <code>PaymentReceived</code> / <code>DepositReceived</code>{" "}
                events and flips status + fires webhooks.
              </p>
              <p className="text-sm text-ink-dim mt-2">
                Stateless HS256 JWT sessions issued via Sign-In with
                Ethereum (EIP-4361). No passwords.
              </p>
            </Card>
            <Card title="Frontend">
              <p className="text-sm text-ink-dim">
                React + Vite + wagmi + RainbowKit. Merchant dashboard,
                customer pay + deposit pages, admin console at{" "}
                <code>/admin</code>, embed snippet for one-line HTML
                integration, geo-block on comprehensive-embargo
                jurisdictions.
              </p>
              <p className="text-sm text-ink-dim mt-2">
                Runs in two modes: backend-attached (full API) and
                localStorage-only (frontend-only demos).
              </p>
            </Card>
          </div>
          <p className="mt-4 text-sm text-ink-dim">
            The contract is the protocol, the backend is the operational
            convenience layer, and the frontend is the UX. All three are
            open source, MIT-licensed.
          </p>
        </Section>

        <Section id="status" title="Status & roadmap">
          <p>
            <strong>Today:</strong> Sepolia testnet, 69 contract tests
            passing, full dashboard + customer flows live, OFAC sanctions
            oracle wired, geo-block on the hosted frontend, webhook
            dispatcher with retries and 24h dual-secret rotation grace.
          </p>
          <p className="mt-2">
            <strong>Before mainnet:</strong> external security audit,
            mainnet deploy, multi-chain enable (Base, Arbitrum, Optimism,
            Polygon, BNB Smart Chain, Linea — already wired in{" "}
            <code>tokens.ts</code>, awaiting per-chain deployment), fiat
            on-ramp partnerships.
          </p>
        </Section>

        {/* ────────── MERCHANTS ────────── */}
        <SectionDivider label="For merchants" />

        <Section id="m-quickstart" title="Quickstart">
          <ol className="list-decimal list-inside space-y-2 text-sm text-ink-dim">
            <li><strong>Connect a wallet</strong> (top-right). Sepolia is the only chain enabled in this demo.</li>
            <li><strong>Get test ETH</strong> from a Sepolia faucet (link appears on the pay page when your wallet has 0 ETH).</li>
            <li><strong>Register on-chain</strong> from <Link className="text-brand-soft hover:underline" to="/merchant/customize">Customize</Link>. One-time tx; sets your treasury + fee config in the gateway contract.</li>
            <li><strong>Customize</strong> — business name, brand color, logo URL, accepted tokens + chains, optional per-payer USD daily cap.</li>
            <li><strong>Issue an invoice</strong> from <Link className="text-brand-soft hover:underline" to="/merchant">Invoices</Link>, or a <strong>freelance invoice</strong> from <Link className="text-brand-soft hover:underline" to="/merchant/freelancers">Freelancers</Link>. Share the <code>/pay/:id</code> link.</li>
            <li><strong>Add a webhook</strong> at <Link className="text-brand-soft hover:underline" to="/merchant/webhooks">Webhooks</Link> if you want your backend notified the moment a payment lands.</li>
            <li><strong>Watch the dashboard</strong>. Invoices flip from <code>pending</code> to <code>paid</code> within seconds of an on-chain confirmation.</li>
          </ol>
        </Section>

        <Section id="m-customize" title="Customize your gateway">
          <p>
            <Link className="text-brand-soft hover:underline" to="/merchant/customize">Customize</Link>{" "}
            holds everything a customer sees, plus what's wired into the
            contract:
          </p>
          <ul className="text-sm text-ink-dim list-disc pl-5 space-y-1.5 mt-2">
            <li><strong>Branding</strong> — business name, brand color, logo URL. Used on the pay + deposit pages.</li>
            <li><strong>Accepted tokens</strong> — toggle USDC / USDT / DAI. The pay page only offers what you've enabled.</li>
            <li><strong>Accepted chains</strong> — same idea. Today Sepolia is the only one fully enabled; others appear with an "Enable in production" tag.</li>
            <li><strong>On-chain config</strong> — treasury address (where net amounts settle), optional fee receiver + bps (capped at 10%), per-payer daily USD cap (Chainlink-priced). Set via a one-tx call to <code>registerMerchant</code>.</li>
            <li><strong>Demo tools</strong> — seed sample data, clear all local invoices/links/deposits.</li>
          </ul>
        </Section>

        <Section id="m-invoices" title="Issuing an invoice">
          <p>
            From <Link className="text-brand-soft hover:underline" to="/merchant">Invoices</Link>:
            pick a token + chain, enter an amount (flat or itemized with
            line items + tax %), set an expiry, optionally describe it.
            The form previews exactly what the customer will see.
          </p>
          <p>
            On submit, the dashboard generates a 32-byte invoice ID. The
            ID is the contract's replay-protection key — once paid, the
            same ID can never be paid again. Share the URL:
          </p>
          <Code>{`https://secudigate.com/pay/0x3ac74a0c…`}</Code>
          <p>
            The customer doesn't need an account; they connect a wallet,
            approve the token once if needed, and pay. Funds route to
            your treasury <em>in the same transaction</em>.
          </p>
        </Section>

        <Section id="m-freelance" title="Freelancer billing">
          <p>
            <Link className="text-brand-soft hover:underline" to="/merchant/freelancers">Freelancers</Link>{" "}
            is the same invoice primitive shaped for independent work.
            What's different from the e-commerce flow:
          </p>
          <ul className="text-sm text-ink-dim list-disc pl-5 space-y-1.5 mt-2">
            <li><strong>Client info</strong> — name + email recorded on the invoice. Shown on the pay page so the client knows who's billing them.</li>
            <li><strong>Sequential invoice number</strong> — <code>INV-2026-001</code>-style, auto-suggested per merchant per year, editable.</li>
            <li><strong>Payment terms</strong> — Net 7 / 14 / 30 / 60, mapped to <code>expiresInMinutes</code>.</li>
            <li><strong>No merchant-fee surface</strong> — freelancers bill clients direct; the only fee deducted is Secudigate's platform fee, set elsewhere.</li>
          </ul>
          <p className="mt-3 text-sm text-ink-dim">
            The on-chain contract treats freelance invoices identically to
            e-commerce ones — the discriminator is a UI / record-keeping
            distinction only.
          </p>
        </Section>

        <Section id="m-deposits" title="Deposit links">
          <p>
            <Link className="text-brand-soft hover:underline" to="/merchant/deposit-links">Deposit links</Link>{" "}
            are reusable, open-amount pay-pages designed for{" "}
            <strong>account-funding flows</strong>: forex brokers,
            exchanges, prop-trading firms, anything where a customer is
            depositing money to credit their own internal account.
          </p>
          <p>
            The merchant creates one durable link per token (or one per
            customer-tier, or however they want to slice it). The customer
            visits <code>/deposit/:slug</code>, picks an amount, enters a
            reference (e.g. their account number), and pays. The webhook
            fires with the reference in the payload; the merchant's
            backend reads it and credits the right internal user.
          </p>
          <p>
            Optional knobs: a minimum amount, a maximum amount, a custom
            reference label, an active/paused toggle.
          </p>
        </Section>

        <Section id="m-webhooks" title="Webhooks">
          <p>
            <Link className="text-brand-soft hover:underline" to="/merchant/webhooks">Webhooks</Link>{" "}
            push events to your backend the moment the chain indexer sees
            a <code>PaymentReceived</code> or <code>DepositReceived</code>{" "}
            event. Standard HMAC-SHA256 signed envelope. Retries on
            non-2xx with exponential backoff (30s → 2m → 10m → 1h → 6h,
            max 5 attempts). Every attempt is logged and visible in the{" "}
            <strong>Deliveries</strong> panel.
          </p>
          <p>
            Rotation: when you click <strong>Rotate</strong>, the current
            secret moves to a 24h grace slot and a new secret is minted.
            Update your verifier to accept either during the window —
            <a className="text-brand-soft hover:underline" href="#d-rotation"> dual-verify recipe below</a>.
          </p>
        </Section>

        <Section id="m-mainnet" title="Going to mainnet">
          <p>
            Mainnet is gated on three things:
          </p>
          <ol className="list-decimal list-inside space-y-1.5 text-sm text-ink-dim mt-2">
            <li><strong>External audit</strong> of <code>Secudigate.sol</code>. Trail of Bits / Spearbit / Cantina-grade.</li>
            <li><strong>Mainnet deploy</strong> + setting the Chainalysis sanctions oracle to its real address (<code>0x40C57923924B5c5c5455c48D93317139ADDaC8fb</code>).</li>
            <li><strong>Per-chain token registry update</strong> in <code>tokens.ts</code> with the real USDC / USDT / DAI addresses for whichever chain you're enabling.</li>
          </ol>
          <p className="mt-2 text-sm text-ink-dim">
            Until then, this is a Sepolia testnet demo. The persistent
            yellow banner at the top of every page exists so customers
            don't confuse the demo with a production system.
          </p>
        </Section>

        {/* ────────── DEVELOPERS ────────── */}
        <SectionDivider label="For developers" />

        <Section id="d-auth" title="Authentication (SIWE)">
          <p>
            All merchant-scoped API routes require a Sign-In-with-Ethereum
            session ({" "}
            <a className="text-brand-soft hover:underline" href="https://eips.ethereum.org/EIPS/eip-4361" target="_blank" rel="noreferrer">EIP-4361</a>
            ). Three-step flow:
          </p>
          <ol className="list-decimal list-inside space-y-1.5 text-sm text-ink-dim mt-2">
            <li>Frontend requests a one-shot nonce: <code>GET /v1/auth/nonce</code>.</li>
            <li>Frontend builds the canonical EIP-4361 message, the wallet signs it (free, no on-chain tx).</li>
            <li>Frontend posts <code>{`{ address, signature, nonce, issuedAt, chainId, uri, domain }`}</code> to <code>POST /v1/auth/verify</code>. Backend reconstructs the message, recovers the signature, and mints an HS256 JWT.</li>
          </ol>
          <p>
            The token is bearer — sent on every authenticated request:
          </p>
          <Code>{`Authorization: Bearer eyJhbGciOi…`}</Code>
          <p className="mt-2 text-sm text-ink-dim">
            Tokens are stateless, signed with <code>SESSION_SECRET</code>,
            default TTL 7 days. The frontend stores the JWT in
            localStorage and validates it against <code>GET /v1/auth/me</code>{" "}
            on first mount. Cross-tab logout is synced via storage events.
          </p>
        </Section>

        <Section id="d-api" title="REST API">
          <p>
            Base URL is whatever you set <code>VITE_API_BASE_URL</code> to.
            All routes are JSON-in, JSON-out. Errors come back as{" "}
            <code>{`{ error: string, details?: any }`}</code> with the
            appropriate HTTP status.
          </p>
          <ApiRow method="GET"  path="/v1/auth/nonce" returns="{ nonce: string }" />
          <ApiRow method="POST" path="/v1/auth/verify" body="{ address, signature, nonce, issuedAt, chainId, uri, domain }" returns="{ token, address, expiresIn }" />
          <ApiRow method="GET"  path="/v1/auth/me" returns="{ address, expiresAt }" auth />

          <ApiRow method="POST" path="/v1/invoices" body="{ merchant, chainId, token, amount, description?, items?, taxRateBps?, expiresInMinutes, kind?, clientName?, clientEmail?, invoiceNumber? }" returns="Invoice" auth />
          <ApiRow method="GET"  path="/v1/invoices/:id" returns="Invoice" />
          <ApiRow method="GET"  path="/v1/invoices?scope=created&kind=invoice|freelance&status=pending|paid|expired" returns="Invoice[]" auth />
          <ApiRow method="POST" path="/v1/invoices/:id/cancel" returns="Invoice" auth />

          <ApiRow method="POST" path="/v1/deposit-links" body="{ slug?, title, treasury, chainId, requireReference, referenceLabel?, minAmount?, maxAmount?, description? }" returns="DepositLink" auth />
          <ApiRow method="GET"  path="/v1/deposit-links/:slug" returns="DepositLink" />
          <ApiRow method="PATCH" path="/v1/deposit-links/:slug" body="partial fields" returns="DepositLink" auth />
          <ApiRow method="DELETE" path="/v1/deposit-links/:slug" returns="204" auth />

          <ApiRow method="GET"  path="/v1/deposits?merchant=&linkSlug=" returns="Deposit[]" auth />

          <ApiRow method="GET"  path="/v1/merchants/:address" returns="Settings" />
          <ApiRow method="PUT"  path="/v1/merchants/me/settings" body="Settings (without address)" returns="Settings" auth />

          <ApiRow method="GET"  path="/v1/webhooks" returns="Webhook[]" auth />
          <ApiRow method="POST" path="/v1/webhooks" body="{ url, events[] }" returns="Webhook (full secret)" auth />
          <ApiRow method="PATCH" path="/v1/webhooks/:id" body="partial fields" returns="Webhook" auth />
          <ApiRow method="DELETE" path="/v1/webhooks/:id" returns="204" auth />
          <ApiRow method="POST" path="/v1/webhooks/:id/rotate" returns="Webhook (full new secret)" auth />
          <ApiRow method="POST" path="/v1/webhooks/:id/test" returns="{ deliveryId }" auth />
          <ApiRow method="GET"  path="/v1/webhooks/:id/deliveries" returns="Delivery[]" auth />
        </Section>

        <Section id="d-webhooks" title="Webhook verification">
          <p>
            Every outgoing webhook carries an HMAC-SHA256 signature over
            the raw request body. The shape is conventional:
          </p>
          <Code>{`POST https://your-server.com/webhooks/secudigate
Content-Type: application/json
X-Secudigate-Signature: sha256=<hex>
X-Secudigate-Delivery:  <unique-attempt-id>
X-Secudigate-Event:     invoice.paid | deposit.received
X-Secudigate-Timestamp: <ISO timestamp>

{ "type": "invoice.paid", "createdAt": "...", "data": { "invoice": { ... } } }`}</Code>
          <p>Node.js verification — sign over the <em>raw</em> body bytes, not the parsed JSON:</p>
          <Code>{`import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET = process.env.SECUDIGATE_SECRET!;

export function verify(rawBody: Buffer, header: string): boolean {
  const expected = "sha256=" + createHmac("sha256", SECRET).update(rawBody).digest("hex");
  if (expected.length !== header.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(header));
}`}</Code>
          <p className="mt-2 text-sm text-ink-dim">
            Idempotency: the dispatcher guarantees <em>at-least-once</em>{" "}
            delivery. Dedupe by <code>X-Secudigate-Delivery</code> on your
            side (a unique index on that column is enough).
          </p>
          <p className="mt-2 text-sm text-ink-dim">
            Test events carry a <code>{`"test": true`}</code> flag on the
            top-level payload. Your receiver should branch on it before
            firing real side effects.
          </p>
        </Section>

        <Section id="d-rotation" title="Secret rotation (dual-verify)">
          <p>
            When a merchant rotates a webhook secret, the new one becomes
            the signing key immediately, and the old one keeps verifying
            for 24 hours so in-flight retries don't strand the merchant.
            Your receiver should try the new secret first, then the old:
          </p>
          <Code>{`const CURRENT  = process.env.SECUDIGATE_SECRET!;
const PREVIOUS = process.env.SECUDIGATE_PREVIOUS_SECRET || "";  // set during rotation only

function tryHmac(rawBody, header, secret) {
  if (!secret) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  return expected.length === header.length &&
         timingSafeEqual(Buffer.from(expected), Buffer.from(header));
}

export function verifyWithRotation(rawBody, header) {
  return tryHmac(rawBody, header, CURRENT) || tryHmac(rawBody, header, PREVIOUS);
}`}</Code>
          <p className="mt-2 text-sm text-ink-dim">
            After ~24h, you can clear <code>SECUDIGATE_PREVIOUS_SECRET</code>;
            Secudigate will have stopped honoring it server-side by then.
          </p>
        </Section>

        <Section id="d-embed" title="Embed snippet">
          <p>Drop a Pay or Deposit button onto any HTML page:</p>
          <Code>{`<script async src="https://secudigate.com/embed.js"></script>
<button data-secudigate-invoice="<invoice-id>">Pay with Secudigate</button>`}</Code>
          <p className="mt-3">For deposits:</p>
          <Code>{`<button data-secudigate-deposit="<slug>">Deposit with Secudigate</button>`}</Code>
          <p className="mt-3 text-sm text-ink-dim">Optional attributes:</p>
          <ul className="text-sm text-ink-dim list-disc pl-5 space-y-1 mt-2">
            <li><code>data-color="#7c5cff"</code> — override the brand color for this button.</li>
            <li><code>data-label="Pay $25"</code> — override the default text.</li>
            <li><code>data-base="https://..."</code> on the <code>{'<script>'}</code> tag — point at a specific Secudigate origin (defaults to where the script loaded from).</li>
          </ul>
          <p className="mt-3 text-sm text-ink-dim">
            Clicks open a centered popup. If popups are blocked the script
            falls back to <code>target="_blank"</code>. Mutation-observer
            aware, so SPAs that inject the buttons after page-load also
            work.
          </p>
        </Section>

        <Section id="d-contract" title="Smart contract">
          <p>
            One <code>Secudigate</code> contract per chain. Multi-tenant.
            No custody. Audited test suite (69 passing) lives at{" "}
            <code>test/Secudigate.t.sol</code>.
          </p>
          <Code>{`function registerMerchant(
  address treasury,
  address feeReceiver,
  uint16  feeBps,           // <= 1000 (10%)
  uint256 dailyLimitUsd6    // per-payer USD cap, 6 decimals; 0 = disabled
) external whenNotPaused;

function pay(
  bytes32 invoiceId,
  address merchant,
  address token,
  uint256 amount
) external nonReentrant whenNotPaused;

function deposit(
  address merchant,
  string  calldata paymentRef,
  address token,
  uint256 amount
) external nonReentrant whenNotPaused;`}</Code>
          <p className="mt-3 text-sm text-ink-dim">
            Inside <code>pay</code> / <code>deposit</code>, the contract
            executes up to three sequential <code>transferFrom</code>{" "}
            calls — platform fee, optional merchant fee, net to treasury —
            all from the payer's allowance. The contract itself never
            holds the tokens.
          </p>
          <p className="mt-3">Events the indexer listens for:</p>
          <Code>{`event PaymentReceived(
  bytes32 indexed invoiceId,
  address indexed merchant,
  address indexed payer,
  address token,
  uint256 grossAmount,
  uint256 platformFee,
  uint256 merchantFee,
  uint256 netToTreasury
);

event DepositReceived(
  address indexed merchant,
  address indexed payer,
  address token,
  string  paymentRef,
  uint256 grossAmount,
  uint256 platformFee,
  uint256 merchantFee,
  uint256 netToTreasury
);`}</Code>
          <p className="mt-3 text-sm text-ink-dim">
            Other surfaces worth knowing: <code>setTokenPriceFeed</code>{" "}
            (admin-only, wires a Chainlink USD aggregator per token);{" "}
            <code>setSanctionsList</code> (admin-only, the Chainalysis
            oracle); <code>setMerchantPaused</code> (merchant-only, halts
            their own slot); <code>pause</code> / <code>unpause</code>{" "}
            (admin-only, global kill switch).
          </p>
        </Section>

        <Section id="d-chains" title="Chains">
          <p>
            Sepolia is the only chain enabled today. Every other chain in{" "}
            <Link className="text-brand-soft hover:underline" to="/merchant/customize">Customize → Networks</Link>{" "}
            is registered in wagmi but flagged "Enable in production".
          </p>
          <p className="mt-2 text-sm text-ink-dim">
            Activating a new chain is three edits: flip{" "}
            <code>enabled: true</code> in <code>chains.ts</code>; add the
            chain's stablecoin addresses to <code>tokens.ts</code>{" "}
            <code>REGISTRY</code>; deploy the gateway contract to that
            chain and call <code>setTokenPriceFeed</code> for each token
            against the chain's Chainlink aggregator. Existing settings,
            invoices, and deposit links carry a <code>chainId</code> so
            customers are auto-switched to the right chain at pay time.
          </p>
        </Section>

        <Section id="d-selfhost" title="Self-hosting">
          <p>
            The full stack is MIT-licensed and reproducible. Clone the
            repo, set up the three components:
          </p>
          <ul className="text-sm text-ink-dim list-disc pl-5 space-y-1.5 mt-2">
            <li><strong>Contracts</strong> — <code>forge script script/Deploy.s.sol --rpc-url $RPC --broadcast</code>. Set <code>VITE_PAYMENT_GATEWAY_ADDRESS</code> on the frontend to the printed address.</li>
            <li><strong>Backend</strong> — <code>cd backend &amp;&amp; npm install &amp;&amp; npx prisma migrate dev &amp;&amp; npm run dev</code>. Generate a real <code>SESSION_SECRET</code> with <code>openssl rand -hex 32</code>.</li>
            <li><strong>Frontend</strong> — <code>cd frontend &amp;&amp; npm install &amp;&amp; npm run dev</code>. For a public demo, leave <code>VITE_API_BASE_URL</code> blank and the dashboard runs entirely in localStorage — no backend hosting required.</li>
          </ul>
          <p className="mt-2 text-sm text-ink-dim">
            Vercel + Cloudflare Pages configs ship in <code>frontend/</code> already.{" "}
            <code>vercel.json</code> handles SPA rewrites + security
            headers; <code>public/_redirects</code> covers Pages and
            Netlify.
          </p>
        </Section>

        {/* ────────── PAYERS ────────── */}
        <SectionDivider label="For payers" />

        <Section id="p-pay" title="How to pay an invoice">
          <p>
            Click the pay link the merchant sent you. You'll land on a
            <code> /pay/0x…</code> page that shows:
          </p>
          <ul className="text-sm text-ink-dim list-disc pl-5 space-y-1 mt-2">
            <li>The merchant's name + logo</li>
            <li>The amount, in the token the merchant chose (USDC, USDT, or DAI)</li>
            <li>The network (Sepolia testnet today)</li>
            <li>The expiry — usually 24h for e-commerce invoices, Net 30 for freelance</li>
          </ul>
          <ol className="list-decimal list-inside space-y-1.5 text-sm text-ink-dim mt-3">
            <li>Click <strong>Connect Wallet</strong>. Pick whichever wallet you use — MetaMask, Rainbow, Coinbase Wallet, etc.</li>
            <li>If your wallet isn't on the right network, the page prompts you to switch. One click.</li>
            <li>If you don't have enough of the required token, a "claim test tokens" button appears for the mock stablecoins. (On mainnet, you'd top up from an exchange.)</li>
            <li>Click <strong>Pay</strong>. Your wallet asks you to approve the gateway to spend the exact amount (one-time per token), then prompts you to sign the payment transaction.</li>
            <li>Wait for the transaction to confirm — usually 10–20 seconds on Sepolia. The page flips to a green "Payment confirmed" with a link to the on-chain transaction.</li>
          </ol>
          <p className="mt-3 text-sm text-ink-dim">
            That's it. The merchant's backend gets notified within seconds
            and can fulfill your order / credit your account / send your
            receipt automatically.
          </p>
        </Section>

        <Section id="p-custody" title="What &quot;non-custodial&quot; means">
          <p>
            When you pay through Secudigate, your money <strong>never
            touches Secudigate's wallets</strong>. The gateway contract
            executes up to three direct transfers from your wallet to the
            recipients in a single transaction:
          </p>
          <ul className="text-sm text-ink-dim list-disc pl-5 space-y-1 mt-2">
            <li>A small platform fee (~1%) goes to Secudigate's fee receiver.</li>
            <li>An optional merchant fee (configured by the merchant, capped at 10%) goes to their fee wallet.</li>
            <li>The remainder goes directly to the merchant's treasury.</li>
          </ul>
          <p className="mt-3">
            There's no "Secudigate holding account." There's no withdrawal
            flow. There's nothing for Secudigate to freeze or delay. If
            our company disappeared overnight, your past payments would be
            unaffected — they already settled, on-chain, the moment you
            signed.
          </p>
        </Section>

        <Section id="p-receipt" title="Reading your transaction">
          <p>
            After payment, the confirmation page links to the transaction
            on a block explorer (Etherscan on Sepolia). What you'll see:
          </p>
          <ul className="text-sm text-ink-dim list-disc pl-5 space-y-1 mt-2">
            <li><strong>Up to three "Transfer" log entries</strong> on the token contract — one per recipient (platform fee, optional merchant fee, treasury).</li>
            <li><strong>A <code>PaymentReceived</code> (or <code>DepositReceived</code>) event</strong> on the gateway contract, indexed by your wallet address, the invoice ID, and the merchant.</li>
            <li><strong>No <code>Transfer</code> to the gateway contract itself</strong>. That's the non-custodial property visible on-chain.</li>
          </ul>
          <p className="mt-3 text-sm text-ink-dim">
            Keep the transaction hash if you want a receipt — it's the
            authoritative record. Most accounting tools accept Etherscan
            URLs as evidence.
          </p>
        </Section>

        <Section id="p-refunds" title="Refunds & disputes">
          <p>
            <strong>There are no chargebacks.</strong> Crypto payments are
            final; once the transaction confirms, the merchant has the
            money and Secudigate has no ability to claw it back.
          </p>
          <p className="mt-2">
            If you need a refund, contact the merchant directly. They can
            send you funds back from their treasury wallet — that's a
            separate transaction they initiate, not something the gateway
            controls. The merchant chooses their own refund policy.
          </p>
          <p className="mt-2 text-sm text-ink-dim">
            Bottom line: only pay merchants you trust, the same way you
            would with a wire transfer. The gateway is the rails, not the
            arbiter.
          </p>
        </Section>

        <Section id="p-gas" title="Network fees & gas">
          <p>
            You pay gas (in the chain's native token — ETH on Sepolia /
            mainnet, MATIC on Polygon, etc.) for the on-chain
            transactions. Two-step flow:
          </p>
          <ul className="text-sm text-ink-dim list-disc pl-5 space-y-1 mt-2">
            <li>An <strong>approve</strong> transaction the first time you pay with a given token from a given wallet. ~30k gas.</li>
            <li>The <strong>pay</strong> transaction itself. ~100–160k gas, depending on whether all three transfers fire.</li>
          </ul>
          <p className="mt-3 text-sm text-ink-dim">
            On L2s (Base, Arbitrum, etc.) the combined cost is usually
            $0.10–$0.50. On Ethereum mainnet it depends on the gas market.
            On Sepolia it's free testnet ETH — see the faucet link if
            your wallet is empty.
          </p>
        </Section>

        {/* ────────── REFERENCE ────────── */}
        <SectionDivider label="Reference" />

        <Section id="r-security" title="Security model">
          <ul className="text-sm text-ink-dim list-disc pl-5 space-y-2">
            <li><strong>No custody.</strong> The gateway contract never holds funds, even between blocks. Three direct <code>transferFrom</code>s from the payer's allowance.</li>
            <li><strong>Replay protection.</strong> Each invoice ID is a 32-byte value the contract marks as paid; second use reverts with <code>InvoiceAlreadyPaid</code>.</li>
            <li><strong>Per-payer daily caps</strong> — denominated in USD with 6 decimals, applied across every accepted token via Chainlink price feeds. Per (payer, merchant) accumulator, reset at UTC day boundary.</li>
            <li><strong>OFAC sanctions screen.</strong> Both payer and merchant are checked against the Chainalysis oracle on every <code>pay</code> / <code>deposit</code>. Free, ~5k gas per call.</li>
            <li><strong>Geo-block.</strong> The hosted frontend refuses to render for visitors connecting from comprehensive-embargo jurisdictions (IR, KP, CU, SY). UI-layer; the contract is the hard gate.</li>
            <li><strong>Webhook signing.</strong> Every outbound webhook is HMAC-SHA256 over the raw body, 24h dual-secret rotation grace window. Receivers should verify before processing.</li>
            <li><strong>Admin-can't-rug.</strong> The contract owner and ADMIN_ROLE holders cannot edit any merchant's slot. Merchants are walled off from operator interference by <code>msg.sender</code> checks.</li>
            <li><strong>Pre-mainnet</strong> — external audit, mainnet deploy, multi-chain enable. Threat model at <a className="text-brand-soft hover:underline" href="https://github.com/secuditylabs/secudigate/blob/main/docs/threat-model.md" target="_blank" rel="noreferrer">docs/threat-model.md</a>.</li>
            <li><strong>Security disclosure</strong> — see <Link className="text-brand-soft hover:underline" to="/security">/security</Link>.</li>
          </ul>
        </Section>

        <Section id="r-tests" title="Test coverage">
          <p>
            The smart contract ships with <strong>157 tests</strong>, including
            a dedicated <strong>adversarial suite of 80 tests across 9 files</strong>{" "}
            that probe every threat-model surface we could think of.
          </p>
          <ul className="text-sm text-ink-dim list-disc pl-5 space-y-1 mt-3">
            <li><strong>Reentrancy</strong> — hostile token re-entering <code>pay</code>/<code>deposit</code> at every <code>transferFrom</code> stage, in every cross-function combination.</li>
            <li><strong>Malicious tokens</strong> — return-false, reverting, fee-on-transfer, USDT-shaped (no return value), and <code>decimals()</code>-reverting shapes.</li>
            <li><strong>Price feed</strong> — negative / zero / min-int answers, staleness boundary, admin feed-swap mid-block, decimals overflow.</li>
            <li><strong>Access control</strong> — merchant-slot isolation, admin can't edit any merchant's config, DEFAULT_ADMIN_ROLE escape locked, renounce-and-reclaim blocked.</li>
            <li><strong>Sanctions</strong> — reverting / deny-all / gas-grief oracles, what's screened (payer + merchant) vs. what isn't (treasury, feeReceiver, platform receiver — documented design).</li>
            <li><strong>Daily limits</strong> — exact-cap boundary, one-wei-over, UTC day rollover, per-(payer, merchant) isolation, multi-token accumulation, mid-day cap changes.</li>
            <li><strong>Replay protection</strong> — same invoice ID twice, cross-merchant collision, failed-pay doesn't burn the ID (atomic revert), <code>bytes32(0)</code> is single-use.</li>
            <li><strong>Gas griefing</strong> — same-address-for-all-three recipients, contract recipients, the gateway-as-treasury foot-gun (funds stuck, by design — no rescue path).</li>
            <li><strong>Invariants &amp; fuzz</strong> — Foundry stateful invariants assert <em>the gateway never holds tokens</em> and supply is conserved across 256 random-call sequences. Plus property fuzz on fee math (sums to gross, respects caps).</li>
          </ul>
          <p className="mt-3 text-sm text-ink-dim">
            Full per-test breakdown in{" "}
            <a className="text-brand-soft hover:underline" href="https://github.com/secuditylabs/secudigate/blob/main/SECURITY.md" target="_blank" rel="noreferrer">SECURITY.md</a>.
            Reproduce with{" "}
            <code className="bg-card-2 px-1.5 py-0.5 rounded">forge test</code>{" "}
            from the repo root.
          </p>
        </Section>

        <Section id="r-license" title="License & open source">
          <p>
            All three components — contract, backend, frontend — are
            MIT-licensed. Source lives at{" "}
            <a className="text-brand-soft hover:underline" href="https://github.com/secuditylabs/secudigate" target="_blank" rel="noreferrer">github.com/secuditylabs/secudigate</a>.
          </p>
          <p className="mt-2 text-sm text-ink-dim">
            Forks welcome. The protocol's value is in the canonical mainnet
            deployment and the brand around it — not in keeping the code
            secret. If you fork the gateway to run your own instance and
            route through your own contract, your platform fee goes to
            you, not us. That's how open infrastructure is supposed to work.
          </p>
        </Section>

        <Section id="r-contact" title="Security disclosure">
          <p>
            Found a vulnerability? Email{" "}
            <a className="text-brand-soft hover:underline" href="mailto:security@secudigate.com">security@secudigate.com</a>.
            Full disclosure policy, scope, severity bands, and safe-harbor
            at <Link className="text-brand-soft hover:underline" to="/security">/security</Link>.
          </p>
          <p className="mt-2 text-sm text-ink-dim">
            We aim to acknowledge new reports within 48 hours and provide
            a remediation timeline within 5 business days.
          </p>
        </Section>

        <footer className="mt-16 pt-8 border-t border-line/60 text-xs text-ink-faint">
          Documentation is open-source and version-controlled.{" "}
          <a className="underline hover:text-ink" href="https://github.com/secuditylabs/secudigate/blob/main/frontend/src/pages/Docs.tsx" target="_blank" rel="noreferrer">
            Suggest an edit on GitHub
          </a>
          .
        </footer>
      </main>
    </div>
  );
}

function Header() {
  return (
    <header className="mb-10">
      <span className="text-xs uppercase tracking-widest text-brand-soft">Documentation</span>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Build with Secudigate</h1>
      <p className="mt-3 text-ink-dim leading-relaxed max-w-2xl">
        Everything you need to use, integrate with, or self-host the
        gateway — organized for whichever side of the transaction you're
        on. Merchants run a business; developers integrate code; payers
        pay invoices. Pick your lane from the sidebar.
      </p>
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
        <AudiencePivot href="#m-quickstart" tag="MERCHANTS" body="Onboard, customize, issue invoices, configure webhooks." />
        <AudiencePivot href="#d-api"        tag="DEVELOPERS" body="REST API, smart contract, embed snippet, self-hosting." />
        <AudiencePivot href="#p-pay"        tag="PAYERS"     body="How to pay, what non-custodial means, refunds." />
      </div>
    </header>
  );
}

function AudiencePivot({ href, tag, body }: { href: string; tag: string; body: string }) {
  return (
    <a href={href} className="card p-4 hover:border-brand/40 transition-colors group">
      <div className="text-[10px] uppercase tracking-widest text-brand-soft">{tag}</div>
      <div className="mt-1.5 text-ink-dim group-hover:text-ink transition-colors text-[13px] leading-snug">{body}</div>
    </a>
  );
}

function TocGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="text-[10px] uppercase tracking-widest text-ink-faint mb-2">{label}</div>
      <ul className="space-y-1.5 text-sm">{children}</ul>
    </div>
  );
}

function TocItem({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <li>
      <a href={`#${id}`} className="text-ink-dim hover:text-ink transition-colors">
        {children}
      </a>
    </li>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="my-12 flex items-center gap-3">
      <span className="text-[10px] uppercase tracking-widest text-brand-soft font-semibold">{label}</span>
      <span className="flex-1 h-px bg-line" />
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-12 scroll-mt-24">
      <h2 className="text-xl font-semibold tracking-tight mb-3">
        <a href={`#${id}`} className="text-ink hover:text-brand-soft no-underline">{title}</a>
      </h2>
      <div className="text-ink leading-relaxed [&_p]:text-ink-dim [&_p]:my-2 [&_code]:text-[12px] [&_code]:bg-bg-soft [&_code]:border [&_code]:border-line [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5">
        {children}
      </div>
    </section>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <div className="font-semibold mb-1.5">{title}</div>
      {children}
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="not-prose mt-3 text-xs overflow-x-auto bg-bg-soft border border-line rounded-xl p-4 font-mono text-ink leading-relaxed whitespace-pre-wrap break-all sm:break-normal sm:whitespace-pre">
      {children}
    </pre>
  );
}

function ApiRow({
  method,
  path,
  body,
  returns,
  auth = false,
}: {
  method: string;
  path: string;
  body?: string;
  returns: string;
  auth?: boolean;
}) {
  const palette: Record<string, string> = {
    GET:    "text-brand-soft border-brand/40 bg-brand/10",
    POST:   "text-good       border-good/40  bg-good/10",
    PUT:    "text-warn       border-warn/40  bg-warn/10",
    PATCH:  "text-warn       border-warn/40  bg-warn/10",
    DELETE: "text-bad        border-bad/40   bg-bad/10",
  };
  const color = palette[method] ?? "text-ink-dim border-line bg-bg-soft";
  return (
    <div className="not-prose mt-2 rounded-xl border border-line bg-bg-soft/50 px-4 py-3 text-sm font-mono">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${color}`}>{method}</span>
        <span className="text-ink">{path}</span>
        {auth && <span className="text-[10px] uppercase tracking-widest text-warn">SIWE</span>}
        <span className="ml-auto text-[11px] text-ink-faint">→ {returns}</span>
      </div>
      {body && <div className="mt-1.5 text-[11px] text-ink-dim">body: <span className="text-ink-dim">{body}</span></div>}
    </div>
  );
}
