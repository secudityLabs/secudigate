import { Link } from "react-router-dom";
import { getTokensForChain } from "../lib/tokens";
import { DEFAULT_CHAIN_ID } from "../lib/chains";

const SEPOLIA_TOKENS = getTokensForChain(DEFAULT_CHAIN_ID);

export default function Home() {
  return (
    <div className="py-10 sm:py-16">
      {/* Hero */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(320px,400px)] gap-10 lg:gap-16 items-center">
        <div className="max-w-2xl">
          <h1 className="mt-6 text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.05]">
            Accept <span className="text-brand-soft">USDC</span>, <span className="text-brand-soft">USDT</span> and <span className="text-brand-soft">DAI</span>
            <br /> on a single page.
          </h1>
          <p className="mt-4 text-brand-soft/90 italic">Built with security in mind.</p>
          <p className="mt-3 text-ink-dim text-lg leading-relaxed">
            Secudigate turns any wallet into a checkout. Generate a payment link, share it,
            and funds settle directly to your treasury — no custodian, no escrow.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/merchant" className="btn-primary">
              Open merchant dashboard <span aria-hidden>→</span>
            </Link>
          </div>
        </div>

        <HeroLogo />
      </div>

      {/* Two product modes */}
      <section className="mt-16">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-ink-faint mb-4">
          Two ways to get paid
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FeatureCard
            eyebrow="For e-commerce"
            title="Issue invoices"
            body="Fixed-amount, single-use payment requests with an expiry. Ideal for online stores, freelancers, and any one-off charge."
            icon={<InvoiceIcon />}
            cta={{ to: "/merchant", label: "Create an invoice" }}
          />
          <FeatureCard
            eyebrow="For brokers & exchanges"
            title="Take deposits"
            body="Reusable links with open amounts and an optional account reference. Built for forex brokers, prop firms, and account-funding flows."
            icon={<DepositIcon />}
            cta={{ to: "/merchant/deposit-links", label: "Create a deposit link" }}
            accent
          />
        </div>
      </section>

      {/* Customize callout */}
      <section className="mt-4">
        <CustomizeCallout />
      </section>

      {/* Tokens */}
      <section className="mt-16">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-ink-faint mb-4">
          Supported stablecoins
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {SEPOLIA_TOKENS.map((t) => (
            <div key={t.symbol} className="card p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold flex items-center gap-2">
                  <span
                    className="h-5 w-5 rounded-full inline-flex items-center justify-center text-[10px] font-bold text-white"
                    style={{ background: t.color }}
                  >
                    {t.symbol[0]}
                  </span>
                  {t.symbol}
                </span>
                {/* <span className="text-[10px] uppercase tracking-widest text-ink-faint">{t.decimals}d</span> */}
              </div>
              <div className="text-ink-dim text-sm mt-2">{t.name}</div>
              {/* <div className="mt-3 font-mono text-[11px] text-ink-faint break-all">{t.address}</div> */}
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mt-16">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-ink-faint mb-4">
          How it works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Step n={1} title="Create a link" body="Pick a stablecoin, set the amount (or leave it open for deposits), share the URL." />
          <Step n={2} title="Customer pays" body="They open the link, connect a wallet on Sepolia, approve once and confirm." />
          <Step n={3} title="Funds auto-forward" body="The gateway routes the payment to your treasury in the same transaction. Nothing held in escrow." />
        </div>
      </section>
    </div>
  );
}

function HeroLogo() {
  // Mask URL is duplicated for -webkit- and standard mask properties so it
  // works in Safari + everything else.
  const logo = "/logo-secudigate.png";
  const maskStyle: React.CSSProperties = {
    WebkitMaskImage: `url(${logo})`,
    WebkitMaskSize: "contain",
    WebkitMaskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    maskImage: `url(${logo})`,
    maskSize: "contain",
    maskRepeat: "no-repeat",
    maskPosition: "center",
  };

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[400px] hidden lg:block" aria-hidden>
      {/* Soft brand-purple halo, breathing */}
      <div
        className="absolute inset-0 rounded-full blur-3xl animate-hero-glow"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(124,92,255,0.55), rgba(36,121,240,0.25) 45%, transparent 70%)",
        }}
      />

      {/* Faint orbital ring */}
      <div className="absolute inset-6 rounded-full border border-brand/20 animate-hero-spark" />
      <div className="absolute inset-14 rounded-full border border-brand/10" />

      {/* Floating logo */}
      <div className="absolute inset-0 flex items-center justify-center animate-hero-float">
        <img
          src={logo}
          alt="Secudigate"
          className="w-[88%] h-[88%] object-contain translate-y-[7%] drop-shadow-[0_12px_30px_rgba(36,121,240,0.35)]"
          draggable={false}
        />
      </div>

      {/* Scanner beam, masked to the logo silhouette */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative w-[88%] h-[88%] translate-y-[4%] overflow-hidden" style={maskStyle}>
          <div
            className="absolute inset-x-0 h-24 animate-hero-scan"
            style={{
              top: "-25%", // matches the 0% keyframe; avoids a one-frame flash before animation starts
              background:
                "linear-gradient(180deg, transparent 0%, rgba(167,213,255,0.0) 20%, rgba(167,213,255,0.85) 50%, rgba(167,213,255,0.0) 80%, transparent 100%)",
              filter: "blur(1px)",
            }}
          />
        </div>
      </div>
    </div>
  );
}

function FeatureCard({
  eyebrow,
  title,
  body,
  icon,
  cta,
  accent,
}: {
  eyebrow: string;
  title: string;
  body: string;
  icon: React.ReactNode;
  cta: { to: string; label: string };
  accent?: boolean;
}) {
  return (
    <Link
      to={cta.to}
      className={`card p-6 group flex flex-col gap-3 transition-colors hover:border-brand/40 ${
        accent ? "border-brand/30 bg-gradient-to-br from-brand/[0.06] to-transparent" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`h-10 w-10 rounded-xl border flex items-center justify-center ${
            accent ? "bg-brand/15 border-brand/40 text-brand-soft" : "bg-bg-soft border-line text-ink-dim"
          }`}
        >
          {icon}
        </span>
        <span className={`text-[11px] uppercase tracking-widest ${accent ? "text-brand-soft" : "text-ink-faint"}`}>
          {eyebrow}
        </span>
      </div>
      <div className="mt-1">
        <div className="text-lg font-semibold tracking-tight">{title}</div>
        <p className="mt-1.5 text-sm text-ink-dim leading-relaxed">{body}</p>
      </div>
      <div className="mt-auto pt-3 text-sm font-medium text-brand-soft inline-flex items-center gap-1.5 group-hover:gap-2.5 transition-all">
        {cta.label} <span aria-hidden>→</span>
      </div>
    </Link>
  );
}

function CustomizeCallout() {
  const swatches = ["#7c5cff", "#22c55e", "#f59e0b", "#06b6d4", "#ef4444"];
  return (
    <Link
      to="/merchant/customize"
      className="card p-6 group flex flex-col md:flex-row md:items-center gap-5 transition-colors hover:border-brand/40"
    >
      <div className="flex-1 min-w-0">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-brand-soft">Make it yours</span>
        <h3 className="mt-1.5 text-xl font-semibold tracking-tight">Customize your gateway</h3>
        <p className="mt-1.5 text-sm text-ink-dim leading-relaxed max-w-xl">
          Set your business name, brand color, and logo. Choose which stablecoins you accept and where funds settle.
          Your branding shows up on every invoice and deposit page automatically.
        </p>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <div className="flex -space-x-1.5">
          {swatches.map((c) => (
            <span
              key={c}
              className="h-7 w-7 rounded-full border-2 border-bg-card"
              style={{ background: c }}
            />
          ))}
        </div>
        <span className="text-sm font-medium text-brand-soft inline-flex items-center gap-1.5 group-hover:gap-2.5 transition-all whitespace-nowrap">
          Open Customize <span aria-hidden>→</span>
        </span>
      </div>
    </Link>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="card p-5">
      <div className="text-brand-soft font-mono text-xs">0{n}</div>
      <div className="mt-1 font-medium">{title}</div>
      <div className="mt-1.5 text-sm text-ink-dim leading-relaxed">{body}</div>
    </div>
  );
}

function InvoiceIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="13" y2="17" />
    </svg>
  );
}

function DepositIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
      <path d="M5 21h14" />
    </svg>
  );
}
