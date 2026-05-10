import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import MerchantNav from "../components/MerchantNav";
import CopyButton from "../components/CopyButton";
import EmbedButton from "../components/EmbedButton";
import { useDialog } from "../components/Dialog";
import { useToast } from "../components/Toast";
import { tokenToUsd } from "../lib/usd";
import { downloadCsv } from "../lib/csv";
import { useSettings } from "../hooks/useSettings";
import { useOnChainMerchant } from "../hooks/useOnChainMerchant";
import { useDepositLinks, useDeposits } from "../hooks/useDeposits";
import { depositLinkStore, suggestSlug, type DepositLink } from "../lib/deposits";
import { formatAmount, formatRelativeTime, isValidAmount, shortAddress } from "../lib/format";
import { symbolColor } from "../lib/tokens";
import { getChain, getChainOrDefault } from "../lib/chains";

type LinkFilter = "all" | "active" | "paused";

export default function DepositLinksPage() {
  const { address, isConnected } = useAccount();
  const settings = useSettings(address);
  const links = useDepositLinks(address);
  const deposits = useDeposits({ merchant: address });
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [linkFilter, setLinkFilter] = useState<LinkFilter>("all");

  const filteredLinks = useMemo(() => {
    const term = search.trim().toLowerCase();
    return links.filter((l) => {
      if (linkFilter === "active" && !l.active) return false;
      if (linkFilter === "paused" && l.active) return false;
      if (term) {
        const hay = `${l.title} ${l.slug} ${l.description ?? ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [links, search, linkFilter]);

  function handleExportLinks() {
    const rows = filteredLinks.map((l) => ({
      slug: l.slug,
      title: l.title,
      description: l.description ?? "",
      chain: getChainOrDefault(l.chainId).shortName,
      treasury: l.treasury,
      active: l.active ? "yes" : "no",
      requireReference: l.requireReference ? "yes" : "no",
      referenceLabel: l.referenceLabel,
      minAmount: l.minAmount ?? "",
      maxAmount: l.maxAmount ?? "",
      createdAt: new Date(l.createdAt).toISOString(),
    }));
    const n = downloadCsv(`secudigate-deposit-links-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    toast.success("Links exported", `${n} row${n === 1 ? "" : "s"} downloaded.`);
  }

  function handleExportDeposits() {
    const rows = deposits.map((d) => ({
      id: d.id,
      linkSlug: d.linkSlug,
      reference: d.reference ?? "",
      token: d.token,
      amount: d.amount,
      usd: tokenToUsd(d.token, d.amount).toFixed(2),
      chain: getChainOrDefault(d.chainId).shortName,
      payer: d.payer,
      txHash: d.txHash,
      paidAt: new Date(d.paidAt).toISOString(),
    }));
    const n = downloadCsv(`secudigate-deposits-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    toast.success("Deposits exported", `${n} row${n === 1 ? "" : "s"} downloaded.`);
  }

  if (!isConnected || !address || !settings) {
    return (
      <div className="py-24 text-center">
        <h1 className="text-2xl font-semibold">Connect a wallet to manage deposit links</h1>
        <p className="mt-2 text-ink-dim">Useful for forex brokers, exchanges, and any flow where customers fund their account directly.</p>
        <div className="mt-8 inline-flex"><ConnectButton /></div>
      </div>
    );
  }

  return (
    <div>
      <MerchantNav />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-8">
        <section className="space-y-8">
          <header className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Deposit links</h1>
              <p className="text-sm text-ink-dim mt-1">
                Customers open a deposit link, choose how much they want to deposit, and pay. No invoice required.
              </p>
            </div>
            {links.length > 0 && (
              <button type="button" onClick={handleExportLinks} className="btn-ghost text-xs py-1.5 px-2.5">
                Export CSV
              </button>
            )}
          </header>

          {links.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                className="input flex-1"
                placeholder="Search by title, slug, or description…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select className="input sm:w-40" value={linkFilter} onChange={(e) => setLinkFilter(e.target.value as LinkFilter)}>
                <option value="all">All states</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
              </select>
            </div>
          )}

          {links.length === 0 ? (
            <EmptyLinks />
          ) : filteredLinks.length === 0 ? (
            <div className="card p-10 text-center">
              <div className="text-ink-dim">No links match your filter.</div>
              <button type="button" onClick={() => { setSearch(""); setLinkFilter("all"); }} className="btn-ghost text-xs mt-4">Clear filters</button>
            </div>
          ) : (
            <ul className="space-y-3">
              {filteredLinks.map((link) => (
                <LinkRow
                  key={link.slug}
                  link={link}
                  depositCount={deposits.filter((d) => d.linkSlug === link.slug).length}
                />
              ))}
            </ul>
          )}

          {deposits.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-sm uppercase tracking-widest text-ink-faint">Recent deposits</h2>
                <button type="button" onClick={handleExportDeposits} className="text-xs text-ink-dim hover:text-ink">Export CSV</button>
              </div>
              <ul className="space-y-2">
                {deposits.slice(0, 8).map((d) => {
                  const link = links.find((l) => l.slug === d.linkSlug);
                  const chain = getChainOrDefault(d.chainId);
                  return (
                    <li key={d.id} className="card px-4 py-3 flex items-center gap-4 text-sm">
                      <span
                        className="h-7 w-7 rounded-full inline-flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                        style={{ background: symbolColor(d.token) }}
                      >
                        {d.token[0]}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-mono font-semibold">{formatAmount(d.amount, d.token)}</div>
                        <div className="text-xs text-ink-dim truncate">
                          {link?.title ?? d.linkSlug}
                          {d.reference && <> · <span className="text-ink">{d.reference}</span></>}
                          <span className="ml-2 text-[10px] text-ink-faint">{chain.shortName}</span>
                        </div>
                      </div>
                      <div className="text-right text-xs text-ink-faint whitespace-nowrap">
                        <div>{formatRelativeTime(d.paidAt)}</div>
                        <a
                          href={`${chain.explorerUrl}/tx/${d.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-brand-soft hover:underline"
                        >
                          {shortAddress(d.txHash, 6, 4)}
                        </a>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </section>

        <aside>
          <div className="card p-5 lg:sticky lg:top-20">
            <h2 className="font-semibold">New deposit link</h2>
            <p className="text-xs text-ink-dim mt-0.5">A reusable link with no fixed amount.</p>
            <div className="mt-4">
              <CreateLinkForm
                merchant={address}
                fallbackTreasury={settings.defaultTreasury}
                acceptedChains={settings.acceptedChains}
                defaultChainId={settings.defaultChainId}
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function EmptyLinks() {
  return (
    <div className="card p-10 text-center">
      <div className="mx-auto w-12 h-12 rounded-xl bg-bg-soft border border-line flex items-center justify-center text-ink-faint">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      </div>
      <div className="mt-4 font-medium">No deposit links yet</div>
      <div className="mt-1 text-sm text-ink-dim">Create one on the right and share it with your customers.</div>
    </div>
  );
}

function LinkRow({ link, depositCount }: { link: DepositLink; depositCount: number }) {
  const url = `${window.location.origin}/deposit/${link.slug}`;
  const dialog = useDialog();
  return (
    <li className="card p-4">
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link to={`/deposit/${link.slug}`} className="font-medium text-ink hover:text-brand-soft truncate">
              {link.title}
            </Link>
            {link.active ? (
              <span className="badge-paid"><span className="h-1.5 w-1.5 rounded-full bg-good" />Active</span>
            ) : (
              <span className="badge-expired"><span className="h-1.5 w-1.5 rounded-full bg-ink-faint" />Paused</span>
            )}
          </div>
          {link.description && (
            <div className="text-xs text-ink-dim mt-1 truncate">{link.description}</div>
          )}
          <div className="text-[11px] text-ink-faint mt-2 flex items-center gap-3 flex-wrap">
            <span className="font-mono">/deposit/{link.slug}</span>
            <CopyButton value={url} label="Copy link" />
            <EmbedButton kind="deposit" value={link.slug} />
            <span>{getChainOrDefault(link.chainId).shortName}</span>
            <span>{depositCount} deposit{depositCount === 1 ? "" : "s"}</span>
            {link.minAmount && <span>min {link.minAmount}</span>}
            {link.maxAmount && <span>max {link.maxAmount}</span>}
            {link.requireReference && <span>“{link.referenceLabel}” required</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 whitespace-nowrap">
          <button
            type="button"
            className="text-xs text-ink-dim hover:text-ink"
            onClick={() => { void depositLinkStore.update(link.slug, { active: !link.active }); }}
          >
            {link.active ? "Pause" : "Activate"}
          </button>
          <button
            type="button"
            className="text-xs text-bad/80 hover:text-bad"
            onClick={async () => {
              const ok = await dialog.confirm({
                title: "Delete deposit link?",
                message: (
                  <>
                    Permanently remove <span className="font-mono text-ink">{link.title}</span>?
                    Existing deposits stay in your history, but the link itself
                    stops working. This cannot be undone.
                  </>
                ),
                confirmLabel: "Delete link",
                destructive: true,
              });
              if (ok) void depositLinkStore.remove(link.slug);
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}

function CreateLinkForm({
  merchant,
  fallbackTreasury,
  acceptedChains,
  defaultChainId,
}: {
  merchant: `0x${string}`;
  fallbackTreasury: `0x${string}`;
  acceptedChains: number[];
  defaultChainId: number;
}) {
  const [slug, setSlug] = useState<string>(() => suggestSlug());
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [chainId, setChainId] = useState<number>(() =>
    acceptedChains.includes(defaultChainId) ? defaultChainId : (acceptedChains[0] ?? defaultChainId),
  );
  const [requireReference, setRequireReference] = useState(true);
  const [referenceLabel, setReferenceLabel] = useState("Account number");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<DepositLink | null>(null);

  // Funds settle to whatever treasury the merchant registered on-chain via
  // registerMerchant. Read it live from the contract — local settings can
  // drift if registration happens via cast/scripts. The local value is used
  // only as a placeholder while the chain read is loading.
  const { onChain: onChainMerchant } = useOnChainMerchant(merchant);
  const treasury: `0x${string}` = onChainMerchant?.registered
    ? onChainMerchant.treasury
    : fallbackTreasury;
  const treasuryReady = onChainMerchant?.registered === true;

  useEffect(() => {
    if (!acceptedChains.includes(chainId) && acceptedChains.length > 0) {
      setChainId(acceptedChains[0]);
    }
  }, [acceptedChains, chainId]);

  const slugValid = useMemo(() => /^[a-zA-Z0-9_-]{3,32}$/.test(slug.trim()), [slug]);
  const titleValid = title.trim().length > 0;
  const minValid = !minAmount.trim() || isValidAmount(minAmount.trim());
  const maxValid = !maxAmount.trim() || isValidAmount(maxAmount.trim());
  const minMaxOk = !(minAmount && maxAmount) || Number(minAmount) <= Number(maxAmount);
  const chainValid = acceptedChains.includes(chainId);

  const canSubmit = slugValid && treasuryReady && titleValid && minValid && maxValid && minMaxOk && chainValid;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const link = await depositLinkStore.create({
        slug: slug.trim(),
        merchant,
        chainId,
        treasury,
        title: title.trim(),
        description: description.trim() || undefined,
        requireReference,
        referenceLabel: referenceLabel.trim() || "Reference",
        minAmount: minAmount.trim() || undefined,
        maxAmount: maxAmount.trim() || undefined,
      });
      setCreated(link);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create deposit link.");
    }
  }

  if (created) {
    const url = `${window.location.origin}/deposit/${created.slug}`;
    return (
      <div>
        <div className="text-sm text-good">Deposit link created.</div>
        <div className="mt-3 label">Share this URL</div>
        <div className="flex gap-2">
          <input className="input font-mono text-[11px]" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className="btn-ghost" onClick={() => navigator.clipboard.writeText(url)}>Copy</button>
        </div>
        <div className="mt-4 flex gap-2">
          <Link to={`/deposit/${created.slug}`} className="btn-primary flex-1">Open</Link>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setCreated(null);
              setSlug(suggestSlug());
              setTitle("");
              setDescription("");
              setMinAmount("");
              setMaxAmount("");
            }}
          >
            New
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label" htmlFor="title">Title</label>
        <input
          id="title"
          className="input"
          placeholder="Secudity Broker — Fund your account"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <div>
        <label className="label" htmlFor="slug">URL slug</label>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-faint font-mono shrink-0">/deposit/</span>
          <input
            id="slug"
            spellCheck={false}
            className={`input font-mono text-sm ${slug && !slugValid ? "border-bad/60" : ""}`}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
          <button
            type="button"
            className="text-xs text-ink-dim hover:text-ink shrink-0"
            onClick={() => setSlug(suggestSlug())}
          >
            ↻
          </button>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="description">Description (optional)</label>
        <input
          id="description"
          className="input"
          placeholder="Funds will be credited within 1 confirmation."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="rounded-lg bg-bg-soft border border-line px-3 py-2.5">
        <div className="label mb-1">Funds route to</div>
        {treasuryReady ? (
          <>
            <div className="font-mono text-xs text-ink truncate">{treasury}</div>
            <div className="text-[11px] text-ink-faint mt-1">
              From the gateway contract — change in{" "}
              <Link to="/merchant/customize" className="underline hover:text-ink">Customize</Link>.
            </div>
          </>
        ) : (
          <div className="text-[11px] text-bad">
            Not registered on-chain yet.{" "}
            <Link to="/merchant/customize" className="underline">Register in Customize</Link>{" "}
            before customers can deposit.
          </div>
        )}
      </div>

      {acceptedChains.length > 1 ? (
        <div>
          <label className="label" htmlFor="chain">Network</label>
          <select
            id="chain"
            className="input"
            value={chainId}
            onChange={(e) => setChainId(Number(e.target.value))}
          >
            {acceptedChains.map((id) => {
              const c = getChain(id);
              return <option key={id} value={id}>{c?.name ?? `Chain ${id}`}</option>;
            })}
          </select>
        </div>
      ) : (
        <div className="text-[11px] text-ink-faint">
          Network: {getChainOrDefault(chainId).name}
        </div>
      )}

      <div>
        <label className="label">Customer reference</label>
        <label className="flex items-start gap-2 cursor-pointer p-2 rounded-lg hover:bg-bg-soft">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={requireReference}
            onChange={(e) => setRequireReference(e.target.checked)}
          />
          <span className="text-xs text-ink-dim leading-relaxed">
            Require a reference (e.g. account number) so deposits can be matched to your internal customer records.
          </span>
        </label>
        {requireReference && (
          <input
            className="input mt-2"
            placeholder="Account number"
            value={referenceLabel}
            onChange={(e) => setReferenceLabel(e.target.value)}
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label" htmlFor="min">Min amount</label>
          <input
            id="min"
            inputMode="decimal"
            className={`input font-mono ${minAmount && !minValid ? "border-bad/60" : ""}`}
            placeholder="optional"
            value={minAmount}
            onChange={(e) => setMinAmount(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="max">Max amount</label>
          <input
            id="max"
            inputMode="decimal"
            className={`input font-mono ${maxAmount && !maxValid ? "border-bad/60" : ""}`}
            placeholder="optional"
            value={maxAmount}
            onChange={(e) => setMaxAmount(e.target.value)}
          />
        </div>
      </div>
      {!minMaxOk && <div className="text-xs text-bad">Max must be greater than min.</div>}
      {error && <div className="text-xs text-bad">{error}</div>}

      <button className="btn-primary w-full" disabled={!canSubmit}>
        Create deposit link
      </button>
    </form>
  );
}
