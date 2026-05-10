import { useMemo } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import MerchantNav from "../components/MerchantNav";
import { useInvoices } from "../hooks/useInvoices";
import { useDeposits, useDepositLinks } from "../hooks/useDeposits";
import { symbolColor, type StablecoinSymbol } from "../lib/tokens";
import { getChainOrDefault } from "../lib/chains";
import { formatAmount, shortAddress } from "../lib/format";
import { tokenToUsd, formatUsd } from "../lib/usd";
import { downloadCsv } from "../lib/csv";
import { seedSampleData } from "../lib/seed";
import { isApiEnabled } from "../lib/api";
import { useToast } from "../components/Toast";

const SYMBOLS: StablecoinSymbol[] = ["USDC", "USDT", "DAI"];

export default function Analytics() {
  const { address, isConnected } = useAccount();
  const allInvoices = useInvoices();
  const deposits = useDeposits({ merchant: address });
  const depositLinks = useDepositLinks(address);
  const toast = useToast();

  if (!isConnected || !address) {
    return (
      <div className="py-24 text-center">
        <h1 className="text-2xl font-semibold">Connect a wallet to see analytics</h1>
        <p className="mt-2 text-ink-dim">Stats are scoped to a merchant address.</p>
        <div className="mt-8 inline-flex"><ConnectButton /></div>
      </div>
    );
  }

  const myInvoices = allInvoices.filter((i) => i.merchant.toLowerCase() === address.toLowerCase());
  const paidInvoices = myInvoices.filter((i) => i.status === "paid");

  const stats = useMemo(() => {
    const tokenTotals: Record<StablecoinSymbol, number> = { USDC: 0, USDT: 0, DAI: 0 };
    const chainTotals: Record<number, number> = {};
    let invoicePaidVolume = 0;
    let depositVolume = 0;
    let totalUsd = 0;

    for (const i of paidInvoices) {
      const amt = Number(i.amount) || 0;
      tokenTotals[i.token] += amt;
      chainTotals[i.chainId] = (chainTotals[i.chainId] ?? 0) + amt;
      invoicePaidVolume += amt;
      totalUsd += tokenToUsd(i.token, amt);
    }
    for (const d of deposits) {
      const amt = Number(d.amount) || 0;
      tokenTotals[d.token] += amt;
      chainTotals[d.chainId] = (chainTotals[d.chainId] ?? 0) + amt;
      depositVolume += amt;
      totalUsd += tokenToUsd(d.token, amt);
    }

    return {
      totalVolume: invoicePaidVolume + depositVolume,
      invoicePaidVolume,
      depositVolume,
      tokenTotals,
      chainTotals,
      totalUsd,
    };
  }, [paidInvoices, deposits]);

  const series = useMemo(() => buildDailySeries(paidInvoices, deposits, 14), [paidInvoices, deposits]);

  const linkLeaderboard = useMemo(() => {
    const m = new Map<string, { slug: string; title: string; volume: number; count: number }>();
    for (const d of deposits) {
      const link = depositLinks.find((l) => l.slug === d.linkSlug);
      const title = link?.title ?? d.linkSlug;
      const key = d.linkSlug;
      const cur = m.get(key) ?? { slug: d.linkSlug, title, volume: 0, count: 0 };
      cur.volume += Number(d.amount) || 0;
      cur.count += 1;
      m.set(key, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.volume - a.volume).slice(0, 5);
  }, [deposits, depositLinks]);

  const recentActivity = useMemo(() => {
    type Row = {
      kind: "invoice" | "deposit";
      ts: number;
      amount: string;
      token: StablecoinSymbol;
      chainId: number;
      label: string;
      sublabel?: string;
    };
    const rows: Row[] = [];
    for (const i of paidInvoices) {
      rows.push({
        kind: "invoice",
        ts: i.paidAt ?? i.createdAt,
        amount: i.amount,
        token: i.token,
        chainId: i.chainId,
        label: i.description ?? "Invoice",
        sublabel: shortAddress(i.id, 8, 6),
      });
    }
    for (const d of deposits) {
      const link = depositLinks.find((l) => l.slug === d.linkSlug);
      rows.push({
        kind: "deposit",
        ts: d.paidAt,
        amount: d.amount,
        token: d.token,
        chainId: d.chainId,
        label: link?.title ?? d.linkSlug,
        sublabel: d.reference ? `ref: ${d.reference}` : undefined,
      });
    }
    return rows.sort((a, b) => b.ts - a.ts).slice(0, 8);
  }, [paidInvoices, deposits, depositLinks]);

  const tokenSplit = useMemo(() => {
    const total = Object.values(stats.tokenTotals).reduce((a, b) => a + b, 0);
    return SYMBOLS.map((s) => ({
      symbol: s,
      total: stats.tokenTotals[s],
      pct: total > 0 ? (stats.tokenTotals[s] / total) * 100 : 0,
    }));
  }, [stats]);

  const noActivity = paidInvoices.length === 0 && deposits.length === 0;

  function handleExport() {
    const rows = [
      ...paidInvoices.map((i) => ({
        type: "invoice",
        id: i.id,
        status: i.status,
        token: i.token,
        amount: i.amount,
        usd: tokenToUsd(i.token, i.amount).toFixed(2),
        chain: getChainOrDefault(i.chainId).shortName,
        description: i.description ?? "",
        payer: i.payer ?? "",
        txHash: i.txHash ?? "",
        createdAt: new Date(i.createdAt).toISOString(),
        paidAt: i.paidAt ? new Date(i.paidAt).toISOString() : "",
      })),
      ...deposits.map((d) => ({
        type: "deposit",
        id: d.id,
        status: "paid",
        token: d.token,
        amount: d.amount,
        usd: tokenToUsd(d.token, d.amount).toFixed(2),
        chain: getChainOrDefault(d.chainId).shortName,
        description: depositLinks.find((l) => l.slug === d.linkSlug)?.title ?? d.linkSlug,
        payer: d.payer,
        txHash: d.txHash,
        createdAt: new Date(d.paidAt).toISOString(),
        paidAt: new Date(d.paidAt).toISOString(),
        reference: d.reference ?? "",
        linkSlug: d.linkSlug,
      })),
    ];
    const count = downloadCsv(`secudigate-activity-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    toast.success("Export ready", `${count} row${count === 1 ? "" : "s"} downloaded.`);
  }

  function handleSeed() {
    if (!address) return;
    const r = seedSampleData(address);
    toast.success("Sample data loaded", `${r.invoices} invoices · ${r.links} new link${r.links === 1 ? "" : "s"} · ${r.deposits} deposits`);
  }

  return (
    <div>
      <MerchantNav />

      <header className="mb-6 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-ink-dim mt-1">
            A snapshot of paid invoices and deposits for{" "}
            <span className="font-mono text-ink">{shortAddress(address)}</span>.
          </p>
        </div>
        {!noActivity && (
          <button type="button" className="btn-ghost text-xs" onClick={handleExport}>
            <DownloadIcon /> Export CSV
          </button>
        )}
      </header>

      {noActivity ? (
        <div className="card p-12 text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-bg-soft border border-line flex items-center justify-center text-ink-faint">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18" />
              <path d="M7 14l4-4 4 4 6-6" />
            </svg>
          </div>
          <div className="mt-4 font-medium">No activity yet</div>
          <p className="mt-1 text-sm text-ink-dim max-w-sm mx-auto">
            {isApiEnabled()
              ? "Once a customer pays an invoice or deposit link, your stats will land here."
              : "Pay an invoice, simulate a deposit, or load sample data to see your numbers come to life."}
          </p>
          {!isApiEnabled() && (
            <button type="button" className="btn-primary mt-6" onClick={handleSeed}>
              Load sample data
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Kpi label="Total volume" value={formatUsd(stats.totalUsd)} sub={`${stats.totalVolume.toLocaleString(undefined, { maximumFractionDigits: 2 })} across stablecoins`} />
          <Kpi label="Paid invoices" value={`${paidInvoices.length}`} sub={`of ${myInvoices.length} created`} />
          <Kpi label="Deposits" value={`${deposits.length}`} sub={`across ${depositLinks.length} link${depositLinks.length === 1 ? "" : "s"}`} />

          {/* 14-day activity */}
          <section className="card p-5 lg:col-span-2">
            <header className="flex items-end justify-between mb-4">
              <div>
                <h2 className="font-semibold">Volume — last 14 days</h2>
                <p className="text-xs text-ink-dim">Stacked: invoices + deposits, by day.</p>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-ink-faint">
                <LegendDot color="#7c5cff" /> Invoices
                <LegendDot color="#22c55e" /> Deposits
              </div>
            </header>
            <BarChart series={series} />
          </section>

          {/* Token split */}
          <section className="card p-5">
            <h2 className="font-semibold">Token split</h2>
            <p className="text-xs text-ink-dim">Share of total volume.</p>
            <div className="mt-4 flex h-3 rounded-full overflow-hidden bg-bg-soft">
              {tokenSplit.map((t) => t.pct > 0 && (
                <span
                  key={t.symbol}
                  style={{ background: symbolColor(t.symbol), width: `${t.pct}%` }}
                  title={`${t.symbol}: ${t.pct.toFixed(1)}%`}
                />
              ))}
            </div>
            <ul className="mt-4 space-y-2 text-sm">
              {tokenSplit.map((t) => (
                <li key={t.symbol} className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ background: symbolColor(t.symbol) }}
                    />
                    <span className="font-medium">{t.symbol}</span>
                  </span>
                  <span className="font-mono text-ink-dim">
                    {t.total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    <span className="ml-2 text-ink-faint">{t.pct.toFixed(0)}%</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* Top links */}
          <section className="card p-5 lg:col-span-2">
            <h2 className="font-semibold">Top deposit links</h2>
            <p className="text-xs text-ink-dim">By volume.</p>
            {linkLeaderboard.length === 0 ? (
              <div className="text-sm text-ink-dim mt-4">No deposits yet.</div>
            ) : (
              <ul className="mt-4 space-y-3">
                {linkLeaderboard.map((row) => (
                  <li key={row.slug} className="flex items-center gap-3 text-sm">
                    <span className="flex-1 min-w-0">
                      <span className="block truncate">{row.title}</span>
                      <span className="block text-[11px] text-ink-faint font-mono">/deposit/{row.slug}</span>
                    </span>
                    <span className="text-right font-mono whitespace-nowrap">
                      {row.volume.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      <span className="block text-[11px] text-ink-faint">{row.count} deposit{row.count === 1 ? "" : "s"}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Networks */}
          <section className="card p-5">
            <h2 className="font-semibold">Networks</h2>
            <p className="text-xs text-ink-dim">Volume by chain.</p>
            <ul className="mt-4 space-y-2 text-sm">
              {Object.entries(stats.chainTotals).map(([id, v]) => {
                const chain = getChainOrDefault(Number(id));
                return (
                  <li key={id} className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span
                        className="h-5 w-5 rounded-full inline-flex items-center justify-center text-[10px] font-bold text-white"
                        style={{ background: chain.iconColor }}
                      >
                        {chain.iconLetter}
                      </span>
                      {chain.shortName}
                    </span>
                    <span className="font-mono text-ink-dim">
                      {v.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </span>
                  </li>
                );
              })}
              {Object.keys(stats.chainTotals).length === 0 && (
                <li className="text-ink-dim">No volume on any chain yet.</li>
              )}
            </ul>
          </section>

          {/* Recent activity */}
          <section className="card p-5 lg:col-span-3">
            <h2 className="font-semibold">Recent activity</h2>
            {recentActivity.length === 0 ? (
              <div className="text-sm text-ink-dim mt-3">No activity yet.</div>
            ) : (
              <ul className="mt-3 divide-y divide-line/60">
                {recentActivity.map((r, idx) => (
                  <li key={idx} className="py-3 flex items-center gap-3 text-sm">
                    <span
                      className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full ${
                        r.kind === "invoice"
                          ? "bg-brand/15 text-brand-soft"
                          : "bg-good/15 text-good"
                      }`}
                    >
                      {r.kind}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block truncate">{r.label}</span>
                      {r.sublabel && (
                        <span className="block text-[11px] text-ink-faint font-mono truncate">{r.sublabel}</span>
                      )}
                    </span>
                    <span className="text-right whitespace-nowrap">
                      <span className="font-mono font-semibold">{formatAmount(r.amount, r.token)}</span>
                      <span className="block text-[10px] text-ink-faint">{getChainOrDefault(r.chainId).shortName}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, unit, sub }: { label: string; value: string; unit?: string; sub?: string }) {
  return (
    <div className="card p-5">
      <div className="text-xs uppercase tracking-widest text-ink-faint">{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className="text-3xl font-semibold tracking-tight font-mono">{value}</div>
        {unit && <div className="text-xs text-ink-dim">{unit}</div>}
      </div>
      {sub && <div className="mt-1 text-[11px] text-ink-faint">{sub}</div>}
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function LegendDot({ color }: { color: string }) {
  return <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />;
}

type DayBucket = { date: string; invoiceVolume: number; depositVolume: number };

function buildDailySeries(invoices: ReturnType<typeof useInvoices>, deposits: ReturnType<typeof useDeposits>, days: number): DayBucket[] {
  const buckets: DayBucket[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    buckets.push({
      date: d.toISOString().slice(0, 10),
      invoiceVolume: 0,
      depositVolume: 0,
    });
  }

  const indexFor = (ts: number): number => {
    const d = new Date(ts);
    const key = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10);
    return buckets.findIndex((b) => b.date === key);
  };

  for (const i of invoices) {
    if (i.status !== "paid") continue;
    const idx = indexFor(i.paidAt ?? i.createdAt);
    if (idx === -1) continue;
    buckets[idx].invoiceVolume += Number(i.amount) || 0;
  }
  for (const d of deposits) {
    const idx = indexFor(d.paidAt);
    if (idx === -1) continue;
    buckets[idx].depositVolume += Number(d.amount) || 0;
  }

  return buckets;
}

function BarChart({ series }: { series: DayBucket[] }) {
  const max = Math.max(1, ...series.map((d) => d.invoiceVolume + d.depositVolume));
  return (
    <div className="flex items-end gap-1 h-40">
      {series.map((d) => {
        const total = d.invoiceVolume + d.depositVolume;
        const heightPct = (total / max) * 100;
        const invoicePct = total > 0 ? (d.invoiceVolume / total) * 100 : 0;
        return (
          <div key={d.date} className="flex-1 group flex flex-col items-stretch justify-end" title={`${d.date}: ${total.toFixed(2)}`}>
            <div
              className="rounded-t bg-bg-soft border border-line overflow-hidden flex flex-col-reverse"
              style={{ height: `${Math.max(2, heightPct)}%` }}
            >
              <div style={{ height: `${invoicePct}%`, background: "#7c5cff" }} />
              <div style={{ height: `${100 - invoicePct}%`, background: "#22c55e" }} />
            </div>
            <div className="mt-1.5 text-[9px] text-ink-faint text-center font-mono">
              {d.date.slice(5)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
