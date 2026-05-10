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
import CopyButton from "../components/CopyButton";
import MerchantNav from "../components/MerchantNav";
import { useToast } from "../components/Toast";
import { useDialog } from "../components/Dialog";
import { downloadCsv } from "../lib/csv";
import { isApiEnabled } from "../lib/api";
import { computeItemsTotal, type Invoice, type InvoiceLineItem } from "../lib/types";
import type { MerchantSettings } from "../lib/settings";

// Freelancer dashboard — same contract + invoice flow as /merchant, scoped
// to rows tagged `kind: "freelance"`. The form swaps merchant-fee for
// clientName/clientEmail/invoiceNumber and replaces "expires in" with a
// payment-terms picker (Net 7/14/30/60).

export default function Freelancers() {
  const { address, isConnected } = useAccount();
  const settings = useSettings(address);
  const allInvoices = useInvoices();
  const toast = useToast();
  const [search, setSearch] = useState("");

  // Freelance-only slice. Pre-2026-05 rows have no `kind` field and were
  // all e-commerce — we treat undefined as the default "invoice" kind so
  // they don't leak into this list.
  const freelanceInvoices = useMemo(() => {
    if (!address) return [];
    const lower = address.toLowerCase();
    return allInvoices.filter((i) =>
      i.kind === "freelance" &&
      ((i.creator?.toLowerCase() ?? i.merchant.toLowerCase()) === lower ||
        i.merchant.toLowerCase() === lower),
    );
  }, [allInvoices, address]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return freelanceInvoices;
    return freelanceInvoices.filter((i) => {
      const hay = `${i.clientName ?? ""} ${i.clientEmail ?? ""} ${i.invoiceNumber ?? ""} ${i.description ?? ""}`.toLowerCase();
      return hay.includes(term);
    });
  }, [freelanceInvoices, search]);

  if (!isConnected || !address || !settings) {
    return (
      <div className="py-24 text-center">
        <h1 className="text-2xl font-semibold">Connect a wallet to manage freelance invoices</h1>
        <p className="mt-2 text-ink-dim">Bill clients in stablecoins, get paid the same day.</p>
        <div className="mt-8 inline-flex"><ConnectButton /></div>
      </div>
    );
  }

  function handleExport() {
    const rows = filtered.map((i) => ({
      number:    i.invoiceNumber ?? "",
      client:    i.clientName ?? "",
      email:     i.clientEmail ?? "",
      status:    i.status,
      token:     i.token,
      amount:    i.amount,
      chain:     getChainOrDefault(i.chainId).shortName,
      payer:     i.payer ?? "",
      txHash:    i.txHash ?? "",
      createdAt: new Date(i.createdAt).toISOString(),
      paidAt:    i.paidAt ? new Date(i.paidAt).toISOString() : "",
      expiresAt: new Date(i.expiresAt).toISOString(),
    }));
    const n = downloadCsv(`secudigate-freelance-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    toast.success("Freelance invoices exported", `${n} row${n === 1 ? "" : "s"} downloaded.`);
  }

  return (
    <div>
      <MerchantNav />
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-8">
        <section>
          <header className="flex items-end justify-between mb-5 gap-3 flex-wrap">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Freelance invoices</h1>
              <p className="text-sm text-ink-dim mt-1">
                Bill a client. Send a payable link. Receive stablecoins straight to your wallet — no platform skim from your side.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-faint">{filtered.length} of {freelanceInvoices.length}</span>
              {freelanceInvoices.length > 0 && (
                <button type="button" onClick={handleExport} className="btn-ghost text-xs py-1.5 px-2.5">
                  Export CSV
                </button>
              )}
            </div>
          </header>

          {freelanceInvoices.length > 0 && (
            <input
              className="input mb-4"
              placeholder="Search by client, email, invoice #, or description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}

          {freelanceInvoices.length === 0 ? (
            <EmptyState />
          ) : filtered.length === 0 ? (
            <div className="card p-10 text-center">
              <div className="text-ink-dim">No invoices match your filter.</div>
              <button type="button" className="btn-ghost text-xs mt-4" onClick={() => setSearch("")}>Clear search</button>
            </div>
          ) : (
            <ul className="space-y-3">
              {filtered.map((inv) => (
                <FreelanceRow key={inv.id} invoice={inv} />
              ))}
            </ul>
          )}
        </section>

        <aside>
          <div className="card p-5 lg:sticky lg:top-20">
            <h2 className="font-semibold">New freelance invoice</h2>
            {/* <p className="text-xs text-ink-dim mt-0.5">Same flow, simpler form — no merchant-fee surface.</p> */}
            <div className="mt-4">
              <CreateFreelanceForm merchant={address} settings={settings} existing={freelanceInvoices} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card p-10 text-center">
      <div className="mx-auto w-14 h-14 rounded-2xl bg-brand/10 border border-brand/30 flex items-center justify-center text-brand-soft">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 11h-6M22 14h-6M22 17h-6" />
        </svg>
      </div>
      <div className="mt-4 font-medium">No freelance invoices yet</div>
      <div className="mt-1 text-sm text-ink-dim">Fill in the client + amount on the right to create your first one.</div>
    </div>
  );
}

function FreelanceRow({ invoice }: { invoice: Invoice }) {
  const payUrl = `${window.location.origin}/pay/${invoice.id}`;
  const label = invoice.invoiceNumber || shortAddress(invoice.id, 10, 6);

  return (
    <li className="card p-4 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link to={`/pay/${invoice.id}`} className="font-mono text-xs text-ink hover:text-brand-soft truncate">
            {label}
          </Link>
          <StatusBadge status={invoice.status} />
          <span className="text-[10px] uppercase tracking-widest text-ink-faint border border-line rounded-full px-2 py-0.5">
            freelance
          </span>
        </div>
        <div className="text-sm text-ink-dim mt-1 truncate">
          {invoice.clientName ? (
            <span className="text-ink">{invoice.clientName}</span>
          ) : (
            <span className="text-ink-faint italic">No client name</span>
          )}
          {invoice.clientEmail && <span className="text-ink-faint"> · {invoice.clientEmail}</span>}
        </div>
        {invoice.description && (
          <div className="text-[11px] text-ink-faint mt-1 truncate">{invoice.description}</div>
        )}
        <div className="text-[11px] text-ink-faint mt-1.5 flex items-center gap-3 flex-wrap">
          {invoice.status === "pending"
            ? <span>due {formatRelativeTime(invoice.expiresAt)}</span>
            : <span>created {formatRelativeTime(invoice.createdAt)}</span>}
          <CopyButton value={payUrl} label="Copy link" />
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

const PAYMENT_TERMS = [
  { label: "Net 7",  days:  7 },
  { label: "Net 14", days: 14 },
  { label: "Net 30", days: 30 },
  { label: "Net 60", days: 60 },
] as const;

function CreateFreelanceForm({
  merchant,
  settings,
  existing,
}: {
  merchant: `0x${string}`;
  settings: MerchantSettings;
  existing: Invoice[];
}) {
  const toast = useToast();
  const dialog = useDialog();
  const { onChain: onChainMerchant } = useOnChainMerchant(merchant);
  const treasuryRegistered = onChainMerchant?.registered === true;

  // Suggest the next invoice number based on the merchant's existing ones
  // (purely cosmetic; users can overwrite). Pattern: INV-YYYY-NNN.
  const suggestedNumber = useMemo(() => {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;
    const last = existing
      .map((i) => i.invoiceNumber ?? "")
      .filter((n) => n.startsWith(prefix))
      .map((n) => Number(n.slice(prefix.length)))
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => b - a)[0];
    const next = (last ?? 0) + 1;
    return `${prefix}${String(next).padStart(3, "0")}`;
  }, [existing]);

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
  const [invoiceNumber, setInvoiceNumber] = useState(suggestedNumber);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [description, setDescription] = useState("");
  const [paymentTermsDays, setPaymentTermsDays] = useState<number>(30);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Invoice | null>(null);

  useEffect(() => { setInvoiceNumber(suggestedNumber); }, [suggestedNumber]);

  useEffect(() => {
    if (!settings.acceptedChains.includes(chainId) && settings.acceptedChains.length > 0) {
      setChainId(settings.acceptedChains[0]);
    }
  }, [settings.acceptedChains, chainId]);

  useEffect(() => {
    if (allowedTokens.length > 0 && !allowedTokens.some((t) => t.symbol === token)) {
      setToken(allowedTokens[0].symbol);
    }
  }, [allowedTokens, token]);

  const amountValid = useMemo(() => isValidAmount(amount.trim()), [amount]);
  const itemTotals = useMemo(() => computeItemsTotal(items, 0), [items]);
  const itemsValid =
    items.length > 0 &&
    items.every((it) => it.description.trim().length > 0 && Number(it.quantity) > 0 && Number(it.unitPrice) > 0);
  const clientValid = clientName.trim().length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === "simple" && !amountValid) { setError("Enter a positive amount."); return; }
    if (mode === "itemized" && !itemsValid) { setError("Each line item needs a description, quantity > 0, and unit price > 0."); return; }
    if (!clientValid) { setError("Client name is required."); return; }

    const finalAmount = mode === "itemized" ? itemTotals.total.toFixed(2) : amount.trim();
    const expiresInMinutes = paymentTermsDays * 24 * 60;

    try {
      const invoice = await invoiceStore.create({
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
        expiresInMinutes,
        kind: "freelance",
        clientName:    clientName.trim(),
        clientEmail:   clientEmail.trim() || undefined,
        invoiceNumber: invoiceNumber.trim() || undefined,
      });
      setCreated(invoice);
      setAmount("");
      setDescription("");
      setClientName("");
      setClientEmail("");
      setItems([{ description: "", quantity: 1, unitPrice: "" }]);
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
        <div className="mt-3 label">Pay link to send the client</div>
        <div className="flex gap-2">
          <input className="input font-mono text-[11px]" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className="btn-ghost" onClick={() => navigator.clipboard.writeText(url)}>
            Copy
          </button>
        </div>
        <div className="mt-4 flex gap-2">
          <Link to={`/pay/${created.id}`} className="btn-primary flex-1">Preview</Link>
          <button type="button" className="btn-ghost" onClick={() => setCreated(null)}>New</button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label" htmlFor="invnum">Invoice number</label>
        <input
          id="invnum"
          spellCheck={false}
          className="input font-mono text-sm"
          value={invoiceNumber}
          onChange={(e) => setInvoiceNumber(e.target.value)}
        />
      </div>

      <div>
        <label className="label" htmlFor="client">Client</label>
        <input
          id="client"
          className={`input ${clientName && !clientValid ? "border-bad/60" : ""}`}
          placeholder="Secudity Corp"
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
        />
        <input
          className="input mt-2 text-xs"
          inputMode="email"
          placeholder="billing@secudity.com (optional)"
          value={clientEmail}
          onChange={(e) => setClientEmail(e.target.value)}
        />
      </div>

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
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${allowedTokens.length}, minmax(0, 1fr))` }}>
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
          <span className="text-xs font-medium text-ink-dim uppercase tracking-wider">Amount</span>
          <div className="inline-flex rounded-lg bg-bg-soft border border-line p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setMode("simple")}
              className={`px-2.5 py-1 rounded-md transition-colors ${mode === "simple" ? "bg-bg-card text-ink" : "text-ink-dim hover:text-ink"}`}
            >
              Flat fee
            </button>
            <button
              type="button"
              onClick={() => setMode("itemized")}
              className={`px-2.5 py-1 rounded-md transition-colors ${mode === "itemized" ? "bg-bg-card text-ink" : "text-ink-dim hover:text-ink"}`}
            >
              Hourly / itemized
            </button>
          </div>
        </div>

        {mode === "simple" ? (
          <div className="relative">
            <input
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
                  placeholder="Hours / item"
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
                  placeholder="Rate"
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

            <div className="mt-3 pt-3 border-t border-line text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="text-ink-dim">Total</span>
                <span className="font-mono font-semibold text-ink">{itemTotals.total.toFixed(2)} {token}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="label" htmlFor="desc">Description (optional)</label>
        <input
          id="desc"
          placeholder="e.g. Q2 retainer — design system"
          className="input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div>
        <label className="label" htmlFor="terms">Payment terms</label>
        <select
          id="terms"
          className="input"
          value={paymentTermsDays}
          onChange={(e) => setPaymentTermsDays(Number(e.target.value))}
        >
          {PAYMENT_TERMS.map((t) => (
            <option key={t.days} value={t.days}>{t.label} ({t.days} days)</option>
          ))}
        </select>
      </div>

      <div className="rounded-lg bg-bg-soft border border-line px-3 py-2.5 text-[11px] text-ink-dim leading-relaxed">
        Funds settle to your treasury — set during merchant registration in{" "}
        <Link to="/merchant/customize" className="underline hover:text-ink">Customize</Link>.
        {/* Freelance invoices never charge the client a merchant fee; only the protocol's */}
        {/* platform fee (≤ 2%) is deducted at settle time. */}
      </div>

      {error && <div className="text-xs text-bad">{error}</div>}

      <button
        className="btn-primary w-full"
        disabled={
          !treasuryRegistered ||
          !clientValid ||
          allowedTokens.length === 0 ||
          (mode === "simple" ? !amountValid : !itemsValid)
        }
      >
        Create invoice
      </button>

      {!treasuryRegistered && (
        <p className="text-[11px] text-bad mt-2">
          You haven't registered on-chain yet. Until you do,{" "}
          <Link to="/merchant/customize" className="underline">payments will revert</Link>.
        </p>
      )}

      {/* `useDialog` is mounted to keep the imperative API available — used
          by future destructive actions on freelance invoices (cancel, void). */}
      <span className="hidden" aria-hidden onClick={() => void dialog} />
    </form>
  );
}

// Re-export for the local export bundler. Unused at runtime, kept so the
// `isApiEnabled` import is non-orphaned for future API-mode toggles.
void isApiEnabled;
