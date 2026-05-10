import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { invoiceStore } from "../lib/storage";
import { useInvoices } from "../hooks/useInvoices";
import { useSettings } from "../hooks/useSettings";
import { useOnChainMerchant } from "../hooks/useOnChainMerchant";
import { getTokensForChain, type StablecoinSymbol } from "../lib/tokens";
import { getChain, getChainOrDefault } from "../lib/chains";
import { formatAmount, formatRelativeTime, isValidAmount, shortAddress } from "../lib/format";
import StatusBadge from "../components/StatusBadge";
import TokenChip from "../components/TokenChip";
import CopyButton from "../components/CopyButton";
import EmbedButton from "../components/EmbedButton";
import MerchantNav from "../components/MerchantNav";
import { useToast } from "../components/Toast";
import { tokenToUsd } from "../lib/usd";
import { downloadCsv } from "../lib/csv";
import { seedSampleData } from "../lib/seed";
import { isApiEnabled } from "../lib/api";
import { computeItemsTotal, type Invoice, type InvoiceLineItem, type InvoiceStatus } from "../lib/types";
import type { MerchantSettings } from "../lib/settings";

type StatusFilter = "all" | InvoiceStatus;

export default function Merchant() {
  const { address, isConnected } = useAccount();
  const settings = useSettings(address);
  // Excludes freelance-kind invoices — those live on /merchant/freelancers
  // and share none of the e-commerce flow's chrome (merchant fee, etc.).
  const allInvoices = useInvoices({ kind: "invoice" });
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const myInvoices = useMemo(() => {
    if (!address) return [];
    const lower = address.toLowerCase();
    // Show invoices where the connected wallet is either the creator (issued
    // it) OR the merchant/treasury (will receive funds for it). Freelance
    // invoices live in their own /merchant/freelancers section — exclude
    // them here so the two views don't duplicate each other.
    return allInvoices.filter((i) => {
      if (i.kind === "freelance") return false;
      return (
        i.merchant.toLowerCase() === lower ||
        (i.creator?.toLowerCase() ?? i.merchant.toLowerCase()) === lower
      );
    });
  }, [allInvoices, address]);

  const filteredInvoices = useMemo(() => {
    const term = search.trim().toLowerCase();
    return myInvoices.filter((i) => {
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      if (term) {
        const hay = `${i.description ?? ""} ${i.id} ${i.token}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [myInvoices, search, statusFilter]);

  if (!isConnected || !address || !settings) {
    return (
      <div className="py-24 text-center">
        <h1 className="text-2xl font-semibold">Connect a wallet to manage invoices</h1>
        <p className="mt-2 text-ink-dim">Each merchant dashboard is scoped to a wallet address.</p>
        <div className="mt-8 inline-flex">
          <ConnectButton />
        </div>
      </div>
    );
  }

  function handleExport() {
    const rows = filteredInvoices.map((i) => ({
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
      expiresAt: new Date(i.expiresAt).toISOString(),
    }));
    const n = downloadCsv(`secudigate-invoices-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    toast.success("Invoices exported", `${n} row${n === 1 ? "" : "s"} downloaded.`);
  }

  function handleSeed() {
    const r = seedSampleData(address!);
    toast.success("Sample data loaded", `${r.invoices} invoices · ${r.links} new link${r.links === 1 ? "" : "s"} · ${r.deposits} deposits`);
  }

  return (
    <div>
      <MerchantNav />
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-8">
        <section>
          <header className="flex items-end justify-between mb-5 gap-3 flex-wrap">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
              <p className="text-sm text-ink-dim mt-1">
                Connected as <span className="font-mono text-ink">{shortAddress(address)}</span>
                {settings.businessName && (
                  <> · <span className="text-ink">{settings.businessName}</span></>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-faint">{filteredInvoices.length} of {myInvoices.length}</span>
              {myInvoices.length > 0 && (
                <button type="button" onClick={handleExport} className="btn-ghost text-xs py-1.5 px-2.5">
                  Export CSV
                </button>
              )}
            </div>
          </header>

          {myInvoices.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-2 mb-4">
              <div className="relative flex-1">
                <input
                  className="input pl-9"
                  placeholder="Search by description, id, or token…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
              </div>
              <select className="input sm:w-44" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="expired">Expired</option>
              </select>
            </div>
          )}

        {myInvoices.length === 0 ? (
          <EmptyState onSeed={handleSeed} />
        ) : filteredInvoices.length === 0 ? (
          <NoMatches onClear={() => { setSearch(""); setStatusFilter("all"); }} />
        ) : (
          <ul className="space-y-3">
            {filteredInvoices.map((inv) => (
              <InvoiceRow key={inv.id} invoice={inv} />
            ))}
          </ul>
        )}
      </section>

      <aside>
        <div className="card p-5 lg:sticky lg:top-20">
          <h2 className="font-semibold">New invoice</h2>
          <p className="text-xs text-ink-dim mt-0.5">Stored locally for this demo.</p>
          <div className="mt-4">
            <CreateInvoiceForm merchant={address} settings={settings} />
          </div>
        </div>
      </aside>
      </div>
    </div>
  );
}

function EmptyState({ onSeed }: { onSeed: () => void }) {
  return (
    <div className="card p-10 text-center">
      <div className="mx-auto w-14 h-14 rounded-2xl bg-brand/10 border border-brand/30 flex items-center justify-center text-brand-soft">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="9" y1="13" x2="15" y2="13" />
          <line x1="9" y1="17" x2="13" y2="17" />
        </svg>
      </div>
      <div className="mt-4 font-medium">No invoices yet</div>
      <div className="mt-1 text-sm text-ink-dim">
        Create your first invoice with the form on the right
        {!isApiEnabled() && ", or load sample data to explore the dashboard"}
        .
      </div>
      {!isApiEnabled() && (
        <button type="button" onClick={onSeed} className="btn-ghost mt-5 text-xs">Load sample data</button>
      )}
    </div>
  );
}

function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <div className="card p-10 text-center">
      <div className="text-ink-dim">No invoices match your filter.</div>
      <button type="button" onClick={onClear} className="btn-ghost mt-4 text-xs">Clear filters</button>
    </div>
  );
}

function Row2({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-dim">{label}</span>
      <span className={`font-mono ${bold ? "font-semibold text-ink" : ""}`}>{value}</span>
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function InvoiceRow({ invoice }: { invoice: Invoice }) {
  const payUrl = `${window.location.origin}/pay/${invoice.id}`;
  const { address } = useAccount();
  const lower = address?.toLowerCase() ?? "";
  const isCreator  = invoice.creator?.toLowerCase() === lower;
  const isReceiver = invoice.merchant.toLowerCase() === lower;
  const showsThirdParty =
    invoice.creator !== undefined &&
    invoice.creator.toLowerCase() !== invoice.merchant.toLowerCase();

  return (
    <li className="card p-4 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link to={`/pay/${invoice.id}`} className="font-mono text-xs text-ink hover:text-brand-soft truncate">
            {shortAddress(invoice.id, 10, 6)}
          </Link>
          <StatusBadge status={invoice.status} />
          {showsThirdParty && (
            <span className="text-[10px] uppercase tracking-widest text-ink-faint border border-line rounded-full px-2 py-0.5">
              {isCreator && !isReceiver && "you issued"}
              {!isCreator && isReceiver && "to your treasury"}
              {isCreator && isReceiver && "self"}
            </span>
          )}
        </div>
        <div className="text-sm text-ink-dim mt-1 truncate">
          {invoice.description || <span className="text-ink-faint italic">No description</span>}
        </div>
        {showsThirdParty && (
          <div className="text-[11px] text-ink-faint mt-1 font-mono flex items-center gap-2 flex-wrap">
            <span>creator {shortAddress(invoice.creator!)}</span>
            <span>·</span>
            <span>treasury {shortAddress(invoice.merchant)}</span>
          </div>
        )}
        <div className="text-[11px] text-ink-faint mt-1.5 flex items-center gap-3">
          {invoice.status === "pending"
            ? <span>expires {formatRelativeTime(invoice.expiresAt)}</span>
            : <span>created {formatRelativeTime(invoice.createdAt)}</span>}
          <CopyButton value={payUrl} label="Copy link" />
          <EmbedButton kind="invoice" value={invoice.id} />
        </div>
      </div>
      <div className="text-right whitespace-nowrap">
        <div className="font-mono font-semibold text-ink">
          {formatAmount(invoice.amount, invoice.token)}
        </div>
        <Link to={`/pay/${invoice.id}`} className="text-xs text-brand-soft hover:underline">
          Open pay link →
        </Link>
      </div>
    </li>
  );
}

function CreateInvoiceForm({ merchant, settings }: { merchant: `0x${string}`; settings: MerchantSettings }) {
  const toast = useToast();
  const [chainId, setChainId] = useState<number>(() =>
    settings.acceptedChains.includes(settings.defaultChainId)
      ? settings.defaultChainId
      : (settings.acceptedChains[0] ?? settings.defaultChainId),
  );
  const allowedTokens = useMemo(
    () => getTokensForChain(chainId).filter((t) => settings.acceptedTokens.includes(t.symbol)),
    [settings.acceptedTokens, chainId],
  );
  const [token, setToken] = useState<StablecoinSymbol>(() => allowedTokens[0]?.symbol ?? "USDC");
  const [mode, setMode] = useState<"simple" | "itemized">("simple");
  const [amount, setAmount] = useState("");
  const [items, setItems] = useState<InvoiceLineItem[]>([{ description: "", quantity: 1, unitPrice: "" }]);
  const [taxPct, setTaxPct] = useState("0");
  const [description, setDescription] = useState("");
  const [expiryMinutes, setExpiryMinutes] = useState(1440); // 24h
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Invoice | null>(null);

  // Where customer funds will land. Read live from the gateway contract —
  // that's the source of truth the contract uses at pay time. Falls back
  // to the local saved setting only while the chain read is loading or
  // when no contract is configured.
  const { onChain: onChainMerchant } = useOnChainMerchant(merchant);
  const treasuryDisplay = onChainMerchant?.registered
    ? onChainMerchant.treasury
    : settings.defaultTreasury;
  const treasuryRegistered = onChainMerchant?.registered === true;

  const itemTotals = useMemo(() => computeItemsTotal(items, (Number(taxPct) || 0) / 100), [items, taxPct]);
  const itemsValid =
    items.length > 0 &&
    items.every((it) => it.description.trim().length > 0 && Number(it.quantity) > 0 && Number(it.unitPrice) > 0);

  // Keep the chain selector in sync if settings change.
  useEffect(() => {
    if (!settings.acceptedChains.includes(chainId) && settings.acceptedChains.length > 0) {
      setChainId(settings.acceptedChains[0]);
    }
  }, [settings.acceptedChains, chainId]);

  // If the selected token gets disabled in settings or isn't on this chain, switch.
  useEffect(() => {
    if (allowedTokens.length > 0 && !allowedTokens.some((t) => t.symbol === token)) {
      setToken(allowedTokens[0].symbol);
    }
  }, [allowedTokens, token]);

  const amountValid = useMemo(() => isValidAmount(amount.trim()), [amount]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === "simple" && !amountValid) { setError("Enter a positive amount."); return; }
    if (mode === "itemized" && !itemsValid) { setError("Each line item needs a description, quantity > 0, and unit price > 0."); return; }

    const taxRate = mode === "itemized" ? (Number(taxPct) || 0) / 100 : undefined;
    const finalAmount =
      mode === "itemized" ? itemTotals.total.toFixed(2) : amount.trim();

    try {
      const invoice = await invoiceStore.create({
        // Merchant slot = connected wallet (the on-chain merchant key set
        // during registerMerchant). The actual treasury address that
        // receives funds is read from the contract's merchants[merchant]
        // mapping at pay time, not from this object.
        merchant,
        creator: merchant,
        chainId,
        token,
        amount: finalAmount,
        description: description.trim() || undefined,
        items: mode === "itemized" ? items.map((it) => ({
          description: it.description.trim(),
          quantity: Number(it.quantity),
          unitPrice: String(Number(it.unitPrice)),
        })) : undefined,
        taxRate,
        expiresInMinutes: expiryMinutes,
      });
      setCreated(invoice);
      setAmount("");
      setDescription("");
      setItems([{ description: "", quantity: 1, unitPrice: "" }]);
      setTaxPct("0");
      toast.success("Invoice created", `${formatAmount(invoice.amount, invoice.token)} on ${getChainOrDefault(invoice.chainId).shortName}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create invoice";
      setError(msg);
      toast.error("Couldn't create invoice", msg);
    }
  }

  function patchItem(idx: number, patch: Partial<InvoiceLineItem>) {
    setItems((current) => current.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setItems((current) => [...current, { description: "", quantity: 1, unitPrice: "" }]);
  }
  function removeItem(idx: number) {
    setItems((current) => (current.length === 1 ? current : current.filter((_, i) => i !== idx)));
  }

  if (created) {
    const url = `${window.location.origin}/pay/${created.id}`;
    return (
      <div>
        <div className="text-sm text-good">Invoice created.</div>
        <div className="mt-3 label">Pay link</div>
        <div className="flex gap-2">
          <input className="input font-mono text-[11px]" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className="btn-ghost" onClick={() => navigator.clipboard.writeText(url)}>
            Copy
          </button>
        </div>
        <div className="mt-4 flex gap-2">
          <Link to={`/pay/${created.id}`} className="btn-primary flex-1">Open</Link>
          <button type="button" className="btn-ghost" onClick={() => setCreated(null)}>New</button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {settings.acceptedChains.length > 1 ? (
        <div>
          <label className="label" htmlFor="chain">Network</label>
          <select id="chain" className="input" value={chainId} onChange={(e) => setChainId(Number(e.target.value))}>
            {settings.acceptedChains.map((id) => {
              const c = getChain(id);
              return <option key={id} value={id}>{c?.name ?? `Chain ${id}`}</option>;
            })}
          </select>
        </div>
      ) : (
        <div className="text-[11px] text-ink-faint">
          Network: <span className="text-ink">{getChainOrDefault(chainId).name}</span>
        </div>
      )}

      <div>
        <label className="label">Stablecoin</label>
        {allowedTokens.length === 0 ? (
          <div className="text-xs text-bad">
            No stablecoins enabled on {getChainOrDefault(chainId).name}.{" "}
            <Link to="/merchant/customize" className="underline">Open Customize</Link> to enable at least one.
          </div>
        ) : (
          <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${allowedTokens.length}, minmax(0, 1fr))` }}>
            {allowedTokens.map((t) => (
              <button
                type="button"
                key={t.symbol}
                onClick={() => setToken(t.symbol)}
                className={`px-3 py-2 rounded-xl text-sm font-medium border transition-colors flex items-center justify-center gap-2 ${
                  token === t.symbol
                    ? "bg-brand/15 border-brand/50 text-brand-soft"
                    : "bg-bg-soft border-line text-ink-dim hover:text-ink"
                }`}
              >
                <span
                  className="h-4 w-4 rounded-full text-[9px] font-bold text-white inline-flex items-center justify-center"
                  style={{ background: t.color }}
                >
                  {t.symbol[0]}
                </span>
                {t.symbol}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-ink-dim uppercase tracking-wider">Pricing</span>
          <div className="inline-flex rounded-lg bg-bg-soft border border-line p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setMode("simple")}
              className={`px-2.5 py-1 rounded-md transition-colors ${mode === "simple" ? "bg-bg-card text-ink" : "text-ink-dim hover:text-ink"}`}
            >
              Single amount
            </button>
            <button
              type="button"
              onClick={() => setMode("itemized")}
              className={`px-2.5 py-1 rounded-md transition-colors ${mode === "itemized" ? "bg-bg-card text-ink" : "text-ink-dim hover:text-ink"}`}
            >
              Itemized
            </button>
          </div>
        </div>

        {mode === "simple" ? (
          <div className="relative">
            <input
              id="amount"
              inputMode="decimal"
              placeholder="0.00"
              className="input font-mono pr-16"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-faint font-mono">
              {token}
            </span>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_60px_80px_auto] gap-1.5 items-center">
                <input
                  className="input text-xs"
                  placeholder="Item"
                  value={it.description}
                  onChange={(e) => patchItem(idx, { description: e.target.value })}
                />
                <input
                  className="input text-xs font-mono text-right"
                  inputMode="numeric"
                  placeholder="Qty"
                  value={it.quantity}
                  onChange={(e) => patchItem(idx, { quantity: Number(e.target.value) || 0 })}
                />
                <input
                  className="input text-xs font-mono text-right"
                  inputMode="decimal"
                  placeholder="Price"
                  value={it.unitPrice}
                  onChange={(e) => patchItem(idx, { unitPrice: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  disabled={items.length === 1}
                  className="text-ink-faint hover:text-bad disabled:opacity-30 disabled:hover:text-ink-faint text-sm w-6"
                  aria-label="Remove line"
                >
                  ×
                </button>
              </div>
            ))}
            <button type="button" onClick={addItem} className="text-xs text-brand-soft hover:underline">
              + Add line
            </button>

            <div className="mt-3 pt-3 border-t border-line space-y-1.5 text-xs">
              <Row2 label="Subtotal" value={`${itemTotals.subtotal.toFixed(2)} ${token}`} />
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="tax" className="text-ink-dim">Tax %</label>
                <input
                  id="tax"
                  className="input w-20 text-xs font-mono text-right py-1.5"
                  inputMode="decimal"
                  value={taxPct}
                  onChange={(e) => setTaxPct(e.target.value)}
                />
              </div>
              <Row2 label="Tax" value={`${itemTotals.tax.toFixed(2)} ${token}`} />
              <Row2 label="Total" value={`${itemTotals.total.toFixed(2)} ${token}`} bold />
            </div>
          </div>
        )}
      </div>

      <div className="rounded-lg bg-bg-soft border border-line px-3 py-2.5">
        <div className="label mb-1">Funds route to</div>
        {treasuryRegistered ? (
          <>
            <div className="font-mono text-xs text-ink truncate">{treasuryDisplay}</div>
            <div className="text-[11px] text-ink-faint mt-1">
              From the gateway contract — change in{" "}
              <Link to="/merchant/customize" className="underline hover:text-ink">Customize</Link>.
            </div>
          </>
        ) : (
          <div className="text-[11px] text-bad">
            Not registered on-chain yet.{" "}
            <Link to="/merchant/customize" className="underline">Register in Customize</Link>{" "}
            before customers can pay.
          </div>
        )}
      </div>

      <div>
        <label className="label" htmlFor="description">Description</label>
        <input
          id="description"
          placeholder="Order #1234"
          className="input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div>
        <label className="label" htmlFor="expiry">Expires in</label>
        <select
          id="expiry"
          className="input"
          value={expiryMinutes}
          onChange={(e) => setExpiryMinutes(Number(e.target.value))}
        >
          <option value={60}>1 hour</option>
          <option value={360}>6 hours</option>
          <option value={1440}>24 hours</option>
          <option value={4320}>3 days</option>
          <option value={10080}>7 days</option>
        </select>
      </div>

      {error && <div className="text-xs text-bad">{error}</div>}

      <button
        className="btn-primary w-full"
        disabled={
          !treasuryRegistered ||
          allowedTokens.length === 0 ||
          (mode === "simple" ? !amountValid : !itemsValid)
        }
      >
        Create invoice
      </button>

      <div className="text-[11px] text-ink-faint text-center">
        Picked <TokenChip symbol={token} />
      </div>
    </form>
  );
}
