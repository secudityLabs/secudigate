import { useEffect, useMemo, useState } from "react";
import { usePublicClient, useWriteContract } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import { PAYMENT_GATEWAY_ADDRESS, secudigateAbi } from "../lib/contracts";
import { SEPOLIA_ID } from "../lib/chains";
import { isValidAddress, shortAddress } from "../lib/format";
import { settingsStore, type MerchantSettings } from "../lib/settings";
import { describeWriteError } from "../lib/txErrors";
import { useToast } from "./Toast";

// Same caps the contract enforces. Keeping them here so the form short-circuits
// before even sending the tx.
const MAX_MERCHANT_FEE_BPS = 1000; // 10% — must mirror Secudigate.MAX_MERCHANT_FEE_BPS
const MAX_FEE_PCT = MAX_MERCHANT_FEE_BPS / 100; // 10

// Daily limit is stored on-chain as a single uint256 in USD with 6 decimals.
// On `pay`, the contract converts each token amount to USD via Chainlink
// price feeds (admin-configured per token) and accumulates per (payer,
// merchant) for the day. So one cap covers USDC, USDT, DAI, etc. uniformly
// — the user just types a dollar amount and the contract handles the math.
const LIMIT_USD_DECIMALS = 6;

function limitUsd6ToHuman(value: string): string {
  if (!value || value === "0") return "";
  try { return formatUnits(BigInt(value), LIMIT_USD_DECIMALS); }
  catch { return ""; }
}

function isValidLimitInput(s: string): boolean {
  if (s.trim() === "") return true;          // empty = disabled
  if (!/^\d+(\.\d{1,6})?$/.test(s.trim())) return false;
  try { parseUnits(s.trim(), LIMIT_USD_DECIMALS); return true; }
  catch { return false; }
}

export interface RegistrationModalProps {
  open: boolean;
  onClose: () => void;
  onRegistered?: () => void;
  merchant: `0x${string}`;
  initialSettings: MerchantSettings;
  alreadyRegistered: boolean;
}

export default function RegistrationModal({
  open,
  onClose,
  onRegistered,
  merchant,
  initialSettings,
  alreadyRegistered,
}: RegistrationModalProps) {
  const toast = useToast();
  const publicClient = usePublicClient({ chainId: SEPOLIA_ID });
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState(false);

  // Form state — strings while editing (so partial input is tolerated);
  // validated + cast at submit time. Treasury + fee-receiver start blank
  // so the merchant has to consciously type the address each time and
  // can't accidentally re-confirm a stale value.
  const [treasury, setTreasury]       = useState<string>("");
  const [feeReceiver, setFeeReceiver] = useState<string>("");
  const [feePct, setFeePct]           = useState<string>((initialSettings.merchantFeeBps / 100).toString());
  const [dailyLimit, setDailyLimit]   = useState<string>(limitUsd6ToHuman(initialSettings.merchantDailyLimit));

  // Re-seed when the modal opens (handles wallet swap / saved-settings refresh).
  // Address fields are intentionally cleared on every open.
  useEffect(() => {
    if (!open) return;
    setTreasury("");
    setFeeReceiver("");
    setFeePct((initialSettings.merchantFeeBps / 100).toString());
    setDailyLimit(limitUsd6ToHuman(initialSettings.merchantDailyLimit));
  }, [open, initialSettings]);

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const treasuryValid = useMemo(() => isValidAddress(treasury.trim()), [treasury]);
  const feePctNum = Number(feePct);
  const feeBps = Math.round(feePctNum * 100);
  const feePctValid = feePct === "" ? false : Number.isFinite(feePctNum) && feePctNum >= 0 && feePctNum <= MAX_FEE_PCT;
  const feeReceiverNeeded = feeBps > 0;
  const feeReceiverValid = !feeReceiverNeeded || isValidAddress(feeReceiver.trim());
  const dailyLimitValid = isValidLimitInput(dailyLimit);

  const canSubmit = treasuryValid && feePctValid && feeReceiverValid && dailyLimitValid && !busy;

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    if (!publicClient) {
      toast.error("RPC unavailable", "No public client for Sepolia. Check your network.");
      return;
    }

    const trimmedTreasury = treasury.trim() as `0x${string}`;
    const trimmedFeeReceiver = (feeBps > 0 ? feeReceiver.trim() : trimmedTreasury) as `0x${string}`;
    const trimmedLimit = dailyLimit.trim();
    const dailyLimitUsd6 = trimmedLimit === "" ? 0n : parseUnits(trimmedLimit, LIMIT_USD_DECIMALS);

    setBusy(true);
    try {
      // Pre-simulate via our fallback-RPC public client to catch contract
      // reverts (caps, paused, etc.) before they reach MetaMask. If the
      // pre-simulate fails *due to a network outage*, swallow it and let
      // MetaMask try anyway — its RPC may still work when ours doesn't,
      // and the user can click "Send anyway" if MetaMask warns. We only
      // re-throw genuine reverts.
      try {
        await publicClient.simulateContract({
          address: PAYMENT_GATEWAY_ADDRESS!,
          abi: secudigateAbi,
          functionName: "registerMerchant",
          args: [trimmedTreasury, trimmedFeeReceiver, feeBps, dailyLimitUsd6],
          account: merchant,
        });
      } catch (simErr) {
        if (describeWriteError(simErr).title !== "Network unreachable") throw simErr;
        console.warn("[RegistrationModal] pre-simulate skipped (RPC outage)", simErr);
      }

      const hash = await writeContractAsync({
        address: PAYMENT_GATEWAY_ADDRESS!,
        abi: secudigateAbi,
        functionName: "registerMerchant",
        args: [trimmedTreasury, trimmedFeeReceiver, feeBps, dailyLimitUsd6],
        chainId: SEPOLIA_ID,
      });

      // From here on the on-chain write is committed. Anything that fails
      // afterwards (settings sync to backend, receipt polling) is best-
      // effort — the contract is the source of truth, so we MUST NOT
      // surface a failure toast for those cases.
      toast.success(
        alreadyRegistered ? "On-chain config updated" : "Merchant registered on Sepolia",
        `Treasury → ${shortAddress(trimmedTreasury)}`,
      );
      onRegistered?.();
      onClose();

      settingsStore
        .save({
          ...initialSettings,
          merchant,
          defaultTreasury: trimmedTreasury,
          merchantFeeReceiver: trimmedFeeReceiver,
          merchantFeeBps: feeBps,
          merchantDailyLimit: dailyLimitUsd6.toString(),
        })
        .catch((err) => console.warn("[RegistrationModal] settings sync failed", err));

      publicClient
        .waitForTransactionReceipt({ hash })
        .then(() => onRegistered?.())
        .catch((err) => console.warn("[RegistrationModal] receipt poll failed", err));
    } catch (err) {
      const { title, body } = describeWriteError(err);
      toast.error(title, body);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <form
        onSubmit={handleSubmit}
        className="card border-line/80 w-full max-w-md p-6 max-h-full overflow-y-auto"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="mb-5">
          <div className="text-xs uppercase tracking-widest text-brand-soft">Sepolia · one-time tx</div>
          <h2 className="mt-1.5 text-xl font-semibold tracking-tight">
            {alreadyRegistered ? "Update on-chain config" : "Register your gateway"}
          </h2>
          <p className="mt-1.5 text-xs text-ink-dim leading-relaxed">
            Writes your treasury and fee config to the contract so customer payments to{" "}
            <span className="font-mono text-ink">{shortAddress(merchant)}</span> settle correctly.
          </p>
        </header>

        <div className="space-y-4">
          <Field
            label="Treasury"
            hint="Where the net amount of every payment is forwarded. Required."
            error={treasury && !treasuryValid ? "Must be a valid 0x address." : null}
          >
            <input
              spellCheck={false}
              className={`input font-mono text-xs ${treasury && !treasuryValid ? "border-bad/60" : ""}`}
              value={treasury}
              onChange={(e) => setTreasury(e.target.value)}
            />
          </Field>

          <Field
            label="Your fee on customers"
            hint="A merchant-side cut on each payment, on top of Secudigate's platform fee. Capped at 10%."
            error={feePct && !feePctValid ? `Must be 0–${MAX_FEE_PCT}%.` : null}
          >
            <div className="relative">
              <input
                inputMode="decimal"
                className={`input font-mono pr-8 ${feePct && !feePctValid ? "border-bad/60" : ""}`}
                value={feePct}
                onChange={(e) => setFeePct(e.target.value)}
                placeholder="0"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-faint">%</span>
            </div>
          </Field>

          {feeReceiverNeeded && (
            <Field
              label="Fee receiver"
              hint="Where your customer-fee cut goes. Defaults to your treasury — change it to a separate wallet if needed."
              error={feeReceiver && !feeReceiverValid ? "Must be a valid 0x address." : null}
            >
              <input
                spellCheck={false}
                className={`input font-mono text-xs ${feeReceiver && !feeReceiverValid ? "border-bad/60" : ""}`}
                value={feeReceiver}
                onChange={(e) => setFeeReceiver(e.target.value)}
              />
            </Field>
          )}

          <Field
            label="Per-payer daily limit (advanced)"
            hint={
              dailyLimitValid && dailyLimit.trim() !== ""
                ? `Cap is $${dailyLimit} per payer per day, summed across all accepted tokens. The contract uses Chainlink price feeds to convert each token amount to USD before checking.`
                : "Per-payer USD cap, applied across all tokens. Leave blank to disable. The contract converts each payment to USD via Chainlink price feeds."
            }
            error={dailyLimit && !dailyLimitValid ? "Enter a non-negative number with up to 6 decimal places, or leave blank." : null}
          >
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[11px] text-ink-faint font-mono">$</span>
              <input
                inputMode="decimal"
                placeholder="0  (disabled)"
                className={`input font-mono pl-7 ${dailyLimit && !dailyLimitValid ? "border-bad/60" : ""}`}
                value={dailyLimit}
                onChange={(e) => setDailyLimit(e.target.value)}
              />
            </div>
          </Field>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={!canSubmit}>
            {busy ? (alreadyRegistered ? "Updating…" : "Registering…")
                  : (alreadyRegistered ? "Update on-chain" : "Register on Sepolia")}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {error
        ? <p className="mt-1.5 text-[11px] text-bad">{error}</p>
        : hint ? <p className="mt-1.5 text-[11px] text-ink-faint">{hint}</p> : null}
    </div>
  );
}
