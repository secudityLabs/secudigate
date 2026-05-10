import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { formatUnits } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { defaultSettings, isValidHexColor, settingsStore, type MerchantSettings } from "../lib/settings";
import { useSettings } from "../hooks/useSettings";
import { useOnChainMerchant } from "../hooks/useOnChainMerchant";
import { SUPPORTED_SYMBOLS, getToken, getTokensForChain, symbolColor, type StablecoinSymbol } from "../lib/tokens";
import { CHAIN_LIST, getChain, getChainOrDefault } from "../lib/chains";
import { isValidAddress, shortAddress } from "../lib/format";
import MerchantNav from "../components/MerchantNav";
import RegistrationModal from "../components/RegistrationModal";
import SecudigateMark from "../components/SecudigateMark";
import { useToast } from "../components/Toast";
import { useDialog } from "../components/Dialog";
import { clearMerchantData, seedSampleData } from "../lib/seed";
import { isApiEnabled } from "../lib/api";
import { PAYMENT_GATEWAY_ADDRESS } from "../lib/contracts";

export default function Customize() {
  const { address, isConnected } = useAccount();

  if (!isConnected || !address) {
    return (
      <div className="py-24 text-center">
        <h1 className="text-2xl font-semibold">Connect a wallet to customize your gateway</h1>
        <p className="mt-2 text-ink-dim">Settings are saved per merchant address.</p>
        <div className="mt-8 inline-flex"><ConnectButton /></div>
      </div>
    );
  }

  return <CustomizeForm merchant={address} />;
}

function CustomizeForm({ merchant }: { merchant: `0x${string}` }) {
  const saved = useSettings(merchant);
  const toast = useToast();
  const dialog = useDialog();
  const [draft, setDraft] = useState<MerchantSettings>(() => saved ?? defaultSettings(merchant));
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Re-hydrate the draft when the saved settings load (initial mount or wallet swap).
  useEffect(() => {
    if (saved) setDraft(saved);
  }, [saved?.merchant, saved?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const errors = useMemo(() => validate(draft), [draft]);
  const dirty = useMemo(() => JSON.stringify(saved) !== JSON.stringify(draft), [saved, draft]);
  const canSave = dirty && Object.keys(errors).length === 0;

  function patch<K extends keyof MerchantSettings>(key: K, value: MerchantSettings[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setSavedAt(null);
  }

  function toggleToken(symbol: StablecoinSymbol) {
    const has = draft.acceptedTokens.includes(symbol);
    const next = has
      ? draft.acceptedTokens.filter((t) => t !== symbol)
      : [...draft.acceptedTokens, symbol];
    patch("acceptedTokens", next);
  }

  async function handleSave() {
    if (!canSave) return;
    try {
      await settingsStore.save(draft);
      setSavedAt(Date.now());
      toast.success("Settings saved");
    } catch (e) {
      toast.error("Save failed", e instanceof Error ? e.message : String(e));
    }
  }

  async function handleReset() {
    const ok = await dialog.confirm({
      title: "Reset customizations?",
      message: "Brand color, business name, logo, accepted tokens, and chain preferences will all return to defaults. Your on-chain merchant config is untouched.",
      confirmLabel: "Reset to defaults",
      destructive: true,
    });
    if (!ok) return;
    settingsStore.reset(merchant);
    setDraft(defaultSettings(merchant));
    setSavedAt(Date.now());
    toast.info("Customizations reset");
  }

  function handleSeed() {
    const r = seedSampleData(merchant);
    toast.success("Sample data loaded", `${r.invoices} invoices · ${r.links} new link${r.links === 1 ? "" : "s"} · ${r.deposits} deposits`);
  }

  async function handleClear() {
    const ok = await dialog.confirm({
      title: "Clear all demo data?",
      message: (
        <>
          Every invoice, deposit link, and recorded deposit tied to this wallet
          gets removed from local storage and the backend. <strong>On-chain
          payments aren't affected</strong> — this only clears the dashboard view.
          Cannot be undone.
        </>
      ),
      confirmLabel: "Clear data",
      destructive: true,
    });
    if (!ok) return;
    const r = clearMerchantData(merchant);
    toast.info("Demo data cleared", `${r.invoices} invoices · ${r.links} links · ${r.deposits} deposits removed`);
  }

  return (
    <div>
      <MerchantNav />
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-8 py-2">
      {/* Form */}
      <section>
        <header className="flex items-end justify-between mb-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Customize gateway</h1>
            <p className="text-sm text-ink-dim mt-1">
              Settings for <span className="font-mono text-ink">{shortAddress(merchant)}</span>
            </p>
          </div>
          <Link to="/merchant" className="text-xs text-ink-dim hover:text-ink">← Back to dashboard</Link>
        </header>

        <OnChainStatus merchant={merchant} saved={saved ?? defaultSettings(merchant)} />

        <div className="card p-5 space-y-5">
          <h2 className="font-semibold">Branding</h2>

          <Field label="Business name" hint="Shown to customers on the pay page. Leave blank to default to “Secudigate”.">
            <input
              className="input"
              maxLength={40}
              placeholder="Secudity Corp"
              value={draft.businessName}
              onChange={(e) => patch("businessName", e.target.value)}
            />
          </Field>

          <Field label="Brand color" hint="Used for the Pay button and accents on your /pay link.">
            <div className="flex items-center gap-3">
              <input
                type="color"
                className="h-10 w-12 rounded-lg bg-bg-soft border border-line cursor-pointer"
                value={draft.brandColor}
                onChange={(e) => patch("brandColor", e.target.value)}
              />
              <input
                className={`input font-mono text-sm ${errors.brandColor ? "border-bad/60" : ""}`}
                value={draft.brandColor}
                onChange={(e) => patch("brandColor", e.target.value)}
              />
            </div>
            {errors.brandColor && <FieldError>{errors.brandColor}</FieldError>}
          </Field>

          <Field label="Logo URL" hint="Optional. PNG or SVG, square crops best.">
            <input
              className={`input ${errors.logoUrl ? "border-bad/60" : ""}`}
              placeholder="https://example.com/logo.svg"
              value={draft.logoUrl ?? ""}
              onChange={(e) => patch("logoUrl", e.target.value.trim() || undefined)}
            />
            {errors.logoUrl && <FieldError>{errors.logoUrl}</FieldError>}
          </Field>
        </div>

        <div className="card p-5 space-y-5 mt-5">
          <h2 className="font-semibold">Payments</h2>

          <Field label="Default treasury" hint="Auto-fills when you create new invoices. Funds auto-forward here.">
            <input
              spellCheck={false}
              className={`input font-mono text-xs ${errors.defaultTreasury ? "border-bad/60" : ""}`}
              value={draft.defaultTreasury}
              onChange={(e) => patch("defaultTreasury", e.target.value as `0x${string}`)}
            />
            {errors.defaultTreasury && <FieldError>{errors.defaultTreasury}</FieldError>}
          </Field>

          <Field label="Accepted stablecoins" hint="Customers can only pay with the tokens you allow.">
            <div className="grid grid-cols-3 gap-2">
              {SUPPORTED_SYMBOLS.map((sym) => {
                const on = draft.acceptedTokens.includes(sym);
                return (
                  <button
                    key={sym}
                    type="button"
                    onClick={() => toggleToken(sym)}
                    className={`px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors flex items-center justify-center gap-2 ${
                      on
                        ? "bg-brand/15 border-brand/50 text-brand-soft"
                        : "bg-bg-soft border-line text-ink-faint hover:text-ink"
                    }`}
                  >
                    <span
                      className="h-4 w-4 rounded-full text-[9px] font-bold text-white inline-flex items-center justify-center"
                      style={{ background: symbolColor(sym) }}
                    >
                      {sym[0]}
                    </span>
                    {sym}
                    <span className={`ml-1 text-[10px] ${on ? "text-brand-soft/80" : "text-ink-faint/60"}`}>
                      {on ? "on" : "off"}
                    </span>
                  </button>
                );
              })}
            </div>
            {errors.acceptedTokens && <FieldError>{errors.acceptedTokens}</FieldError>}
          </Field>
        </div>

        <div className="card p-5 space-y-5 mt-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="font-semibold">Networks</h2>
              <p className="text-xs text-ink-dim mt-0.5">Choose which EVM chains your gateway accepts.</p>
            </div>
            {draft.acceptedChains.length > 0 && (
              <select
                className="input w-auto text-xs"
                value={draft.defaultChainId}
                onChange={(e) => patch("defaultChainId", Number(e.target.value))}
              >
                {draft.acceptedChains.map((id) => {
                  const c = getChain(id);
                  return <option key={id} value={id}>Default: {c?.shortName ?? `Chain ${id}`}</option>;
                })}
              </select>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {CHAIN_LIST.map((c) => {
              const on = draft.acceptedChains.includes(c.id);
              const disabled = !c.enabled;
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    if (disabled) return;
                    const next = on
                      ? draft.acceptedChains.filter((id) => id !== c.id)
                      : [...draft.acceptedChains, c.id];
                    patch("acceptedChains", next);
                    // Ensure defaultChainId stays valid.
                    if (!next.includes(draft.defaultChainId) && next.length > 0) {
                      patch("defaultChainId", next[0]);
                    }
                  }}
                  className={`px-3 py-3 rounded-xl text-sm font-medium border transition-colors flex items-center gap-3 text-left ${
                    disabled
                      ? "bg-bg-soft/50 border-line/60 cursor-not-allowed"
                      : on
                      ? "bg-brand/15 border-brand/50"
                      : "bg-bg-soft border-line hover:border-line/80"
                  }`}
                >
                  <span
                    className="h-7 w-7 rounded-full inline-flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                    style={{ background: c.iconColor, opacity: disabled ? 0.4 : 1 }}
                  >
                    {c.iconLetter}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className={`block ${disabled ? "text-ink-faint" : on ? "text-ink" : "text-ink-dim"}`}>
                      {c.name}
                    </span>
                    <span className="block text-[10px] text-ink-faint">
                      {disabled
                        ? "Enable in production"
                        : c.id === draft.defaultChainId
                        ? "Default · enabled"
                        : on
                        ? "Enabled"
                        : "Disabled"}
                    </span>
                  </span>
                  {!disabled && (
                    <span className={`text-[10px] ${on ? "text-brand-soft" : "text-ink-faint"}`}>
                      {on ? "on" : "off"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {errors.acceptedChains && <FieldError>{errors.acceptedChains}</FieldError>}
        </div>

        {!isApiEnabled() && (
          <div className="card p-5 mt-5">
            <h2 className="font-semibold">Demo tools</h2>
            <p className="text-xs text-ink-dim mt-0.5">
              Populate or wipe demo data for this wallet. Local-only — disabled when the backend is configured.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="btn-ghost text-xs" onClick={handleSeed}>
                Load sample data
              </button>
              <button type="button" className="btn-ghost text-xs text-bad/80 hover:text-bad" onClick={handleClear}>
                Clear my data
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            className="btn-primary"
            disabled={!canSave}
            onClick={handleSave}
          >
            Save changes
          </button>
          <button type="button" className="btn-ghost" onClick={handleReset}>
            Reset to defaults
          </button>
          <span className="ml-auto text-xs text-ink-faint">
            {savedAt
              ? "Saved."
              : dirty
              ? "Unsaved changes"
              : saved && saved.updatedAt > 0
              ? `Last saved ${new Date(saved.updatedAt).toLocaleString()}`
              : "Defaults shown."}
          </span>
        </div>
      </section>

      {/* Live preview */}
      <aside>
        <div className="lg:sticky lg:top-20">
          <div className="text-xs text-ink-faint uppercase tracking-widest mb-2">Live preview</div>
          <PayPreview settings={draft} />
        </div>
      </aside>
      </div>
    </div>
  );
}

function OnChainStatus({ merchant, saved }: { merchant: `0x${string}`; saved: MerchantSettings }) {
  const [modalOpen, setModalOpen] = useState(false);
  const { onChain, isLoading, refetch } = useOnChainMerchant(merchant);

  if (!PAYMENT_GATEWAY_ADDRESS) {
    return (
      <div className="card p-4 mb-5 border-line text-xs text-ink-dim">
        Set <span className="font-mono">VITE_PAYMENT_GATEWAY_ADDRESS</span> in <span className="font-mono">frontend/.env</span> to
        enable on-chain registration. Until then your settings are local-only.
      </div>
    );
  }

  // Compare on-chain to *saved* settings — the source of truth that the modal
  // and the rest of the app write to. Editing the form alone doesn't drift.
  const savedDailyLimitWei = (() => { try { return BigInt(saved.merchantDailyLimit || "0"); } catch { return 0n; } })();
  const inSync = onChain &&
    onChain.registered &&
    onChain.treasury.toLowerCase()    === saved.defaultTreasury.toLowerCase() &&
    onChain.feeReceiver.toLowerCase() === saved.merchantFeeReceiver.toLowerCase() &&
    onChain.feeBps                    === saved.merchantFeeBps &&
    onChain.dailyLimitUsd6               === savedDailyLimitWei;

  if (isLoading) {
    return (
      <div className="card p-4 mb-5 text-xs text-ink-faint">Checking on-chain registration…</div>
    );
  }

  const isRegistered = onChain?.registered === true;

  return (
    <>
      {!isRegistered ? (
        <div className="card p-5 mb-5 border-warn/40 bg-warn/5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-warn">Not registered on Sepolia</div>
              <p className="mt-1 text-xs text-ink-dim leading-relaxed max-w-md">
                Until you call <span className="font-mono">registerMerchant</span>, the contract has no idea where to route your
                funds. Without it, every <span className="font-mono">pay()</span> call to your treasury reverts. One-time tx.
              </p>
            </div>
            <button type="button" className="btn-primary" onClick={() => setModalOpen(true)}>
              Register on Sepolia
            </button>
          </div>
        </div>
      ) : (
        <div className={`card p-5 mb-5 ${inSync ? "border-good/40 bg-good/5" : "border-warn/40 bg-warn/5"}`}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className={`text-sm font-semibold ${inSync ? "text-good" : "text-warn"}`}>
                {inSync ? "✓ Synced to Sepolia" : "Saved settings drifted from on-chain"}
              </div>
              <ul className="mt-2 text-[11px] text-ink-faint space-y-0.5 font-mono">
                <li>Treasury    : {shortAddress(onChain!.treasury)}</li>
                <li>Fee receiver: {shortAddress(onChain!.feeReceiver)}</li>
                <li>Fee bps     : {onChain!.feeBps} ({(onChain!.feeBps / 100).toFixed(2)}%)</li>
                <li>Daily limit : {onChain!.dailyLimitUsd6 === 0n
                  ? "0 (disabled)"
                  : `$${formatUnits(onChain!.dailyLimitUsd6, 6)} per payer / day (USD via Chainlink)`}</li>
                {onChain!.paused && <li className="text-warn">Merchant-paused</li>}
              </ul>
            </div>
            <button type="button" className="btn-ghost" onClick={() => setModalOpen(true)}>
              {inSync ? "Edit on-chain config" : "Sync to on-chain"}
            </button>
          </div>
        </div>
      )}

      <RegistrationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onRegistered={() => refetch()}
        merchant={merchant}
        initialSettings={saved}
        alreadyRegistered={isRegistered}
      />
    </>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1.5 text-[11px] text-ink-faint">{hint}</p>}
    </div>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-[11px] text-bad">{children}</p>;
}

function PayPreview({ settings }: { settings: MerchantSettings }) {
  const previewChainId = settings.acceptedChains.includes(settings.defaultChainId)
    ? settings.defaultChainId
    : (settings.acceptedChains[0] ?? settings.defaultChainId);
  const chainTokens = getTokensForChain(previewChainId).filter((t) => settings.acceptedTokens.includes(t.symbol));
  const previewToken: StablecoinSymbol = chainTokens[0]?.symbol ?? settings.acceptedTokens[0] ?? "USDC";
  const tokenInfo = getToken(previewChainId, previewToken);
  const tokenColor = tokenInfo?.color ?? symbolColor(previewToken);
  const chainInfo = getChainOrDefault(previewChainId);
  const businessName = settings.businessName.trim() || "Secudigate";

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {settings.logoUrl ? (
            <img
              src={settings.logoUrl}
              alt=""
              className="h-7 w-7 rounded-md object-cover bg-bg-soft border border-line"
              onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }}
            />
          ) : businessName ? (
            <span
              className="h-7 w-7 rounded-md inline-flex items-center justify-center text-xs font-bold text-white"
              style={{ background: settings.brandColor }}
            >
              {businessName[0].toUpperCase()}
            </span>
          ) : (
            <SecudigateMark />
          )}
          <span className="font-semibold text-sm truncate max-w-[180px]">{businessName}</span>
        </div>
        <span className="badge-pending"><span className="h-1.5 w-1.5 rounded-full bg-warn animate-pulse" />Pending</span>
      </div>

      <div className="mt-5 flex items-baseline gap-3">
        <span
          className="h-9 w-9 rounded-full inline-flex items-center justify-center text-sm font-bold text-white"
          style={{ background: tokenColor }}
        >
          {previewToken[0]}
        </span>
        <div className="text-3xl font-semibold tracking-tight font-mono">
          25.00 <span className="text-ink-dim text-base">{previewToken}</span>
        </div>
      </div>
      <p className="mt-3 text-ink-dim text-sm">Sample order #1234</p>
      <p className="mt-1 text-[11px] text-ink-faint">on {chainInfo.name}</p>

      <button
        type="button"
        className="mt-6 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-90"
        style={{ background: settings.brandColor }}
        onClick={(e) => e.preventDefault()}
      >
        Pay 25.00 {previewToken}
      </button>

      <div className="mt-4 text-center text-[11px] text-ink-faint">
        Powered by <span className="text-ink-dim">Secudigate</span>
      </div>
    </div>
  );
}

function validate(s: MerchantSettings): Partial<Record<keyof MerchantSettings, string>> {
  const errors: Partial<Record<keyof MerchantSettings, string>> = {};
  if (!isValidHexColor(s.brandColor)) errors.brandColor = "Use a 6-digit hex like #7c5cff.";
  if (s.logoUrl && !/^https?:\/\//i.test(s.logoUrl)) errors.logoUrl = "Must start with http(s)://";
  if (!isValidAddress(s.defaultTreasury)) errors.defaultTreasury = "Must be a valid 0x address.";
  if (s.acceptedTokens.length === 0) errors.acceptedTokens = "Enable at least one stablecoin.";
  if (s.acceptedChains.length === 0) errors.acceptedChains = "Enable at least one network.";
  if (s.acceptedChains.length > 0 && !s.acceptedChains.includes(s.defaultChainId)) {
    errors.defaultChainId = "Default network must be one of your enabled networks.";
  }
  return errors;
}
