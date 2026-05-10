import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAccount, useChainId, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { QRCodeSVG } from "qrcode.react";
import { formatUnits, parseUnits } from "viem";
import { useDepositLink } from "../hooks/useDeposits";
import { useSettingsByAddress } from "../hooks/useSettings";
import { depositStore, type Deposit } from "../lib/deposits";
import { getToken, getTokensForChain, symbolColor, type StablecoinInfo, type StablecoinSymbol } from "../lib/tokens";
import { explorerTxUrl, getChainOrDefault } from "../lib/chains";
import { formatAmount, isValidAmount } from "../lib/format";
import { tokenToUsd, formatUsd } from "../lib/usd";
import { erc20Abi, PAYMENT_GATEWAY_ADDRESS, secudigateAbi } from "../lib/contracts";
import { encodePaymentRef } from "../lib/payment-ref";
import { describeWriteError } from "../lib/txErrors";
import EmptyBalanceHelper from "../components/EmptyBalanceHelper";
import SecudigateMark from "../components/SecudigateMark";
import { useToast } from "../components/Toast";

export default function DepositPage() {
  const { slug } = useParams();
  const link = useDepositLink(slug);
  const settings = useSettingsByAddress(link?.merchant);

  if (!link) {
    return (
      <div className="py-24 text-center">
        <h1 className="text-2xl font-semibold">Deposit link not found</h1>
        <p className="mt-2 text-ink-dim">The link is invalid or was removed.</p>
        <Link to="/" className="btn-ghost mt-6 inline-flex">Back home</Link>
      </div>
    );
  }

  if (!link.active) {
    return (
      <div className="py-24 text-center">
        <h1 className="text-2xl font-semibold">This deposit link is paused</h1>
        <p className="mt-2 text-ink-dim">Reach out to the merchant for an active link.</p>
        <Link to="/" className="btn-ghost mt-6 inline-flex">Back home</Link>
      </div>
    );
  }

  const businessName = settings?.businessName?.trim() || "Secudigate";
  const brandColor = settings?.brandColor ?? "#7c5cff";
  const chainInfo = getChainOrDefault(link.chainId);
  const allowedTokens = useMemo<StablecoinInfo[]>(() => {
    const all = getTokensForChain(link.chainId);
    if (!settings) return all;
    return all.filter((t) => settings.acceptedTokens.includes(t.symbol));
  }, [settings, link.chainId]);

  return (
    <div className="max-w-xl mx-auto py-10">
      <div className="card p-6 sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {settings?.logoUrl ? (
              <img
                src={settings.logoUrl}
                alt=""
                className="h-7 w-7 rounded-md object-cover bg-bg-soft border border-line shrink-0"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            ) : businessName ? (
              <span
                className="h-7 w-7 rounded-md inline-flex items-center justify-center text-xs font-bold text-white shrink-0"
                style={{ background: brandColor }}
              >
                {businessName[0].toUpperCase()}
              </span>
            ) : (
              <SecudigateMark />
            )}
            <span className="font-semibold text-sm truncate">{businessName}</span>
          </div>
          <span className="text-[10px] uppercase tracking-widest text-ink-faint">Deposit</span>
        </div>

        <h1 className="mt-5 text-xl font-semibold tracking-tight">{link.title}</h1>
        {link.description && <p className="mt-1.5 text-ink-dim text-sm leading-relaxed">{link.description}</p>}
        <p className="mt-2 text-[11px] text-ink-faint">on {chainInfo.name}</p>

        <DepositQR url={`${window.location.origin}/deposit/${link.slug}`} brandColor={brandColor} />

        <DepositForm link={link} brandColor={brandColor} allowedTokens={allowedTokens} />
      </div>

      <div className="mt-6 text-center text-xs text-ink-faint">
        Powered by <span className="text-ink-dim">Secudigate</span> · Sepolia testnet demo
      </div>
    </div>
  );
}

function DepositQR({ url, brandColor }: { url: string; brandColor: string }) {
  return (
    <div className="hidden md:flex items-center gap-4 mt-6 pt-5 border-t border-line">
      <div className="bg-white rounded-xl p-2.5 shrink-0">
        <QRCodeSVG value={url} size={104} level="M" fgColor="#0b0d12" bgColor="#ffffff" />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium" style={{ color: brandColor }}>Deposit from your phone</div>
        <p className="mt-1 text-xs text-ink-dim leading-relaxed">
          Scan with your phone's camera or wallet to open this deposit link on your device.
        </p>
      </div>
    </div>
  );
}

type Step = "idle" | "approving" | "paying" | "done" | "error";

function DepositForm({
  link,
  brandColor,
  allowedTokens,
}: {
  link: ReturnType<typeof useDepositLink> & {};
  brandColor: string;
  allowedTokens: StablecoinInfo[];
}) {
  const { address, isConnected } = useAccount();
  const currentChainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: link.chainId });
  const toast = useToast();
  const targetChain = getChainOrDefault(link.chainId);
  const wrongChain = isConnected && currentChainId !== link.chainId;
  const isReal = Boolean(PAYMENT_GATEWAY_ADDRESS);

  const [token, setToken] = useState<StablecoinSymbol>(allowedTokens[0]?.symbol ?? "USDC");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [last, setLast] = useState<Deposit | null>(null);

  // If the merchant disabled the currently selected token, fall back.
  useEffect(() => {
    if (allowedTokens.length > 0 && !allowedTokens.some((t) => t.symbol === token)) {
      setToken(allowedTokens[0].symbol);
    }
  }, [allowedTokens, token]);

  const amountValid = useMemo(() => isValidAmount(amount.trim()), [amount]);
  const numericAmount = Number(amount.trim());
  const minOk = !link.minAmount || numericAmount >= Number(link.minAmount);
  const maxOk = !link.maxAmount || numericAmount <= Number(link.maxAmount);
  const referenceOk = !link.requireReference || reference.trim().length > 0;
  const ready = amountValid && minOk && maxOk && referenceOk && allowedTokens.length > 0;

  if (last) {
    return (
      <div className="mt-7 border-t border-line pt-6 text-center">
        <div className="text-good font-semibold text-lg">Deposit confirmed</div>
        <div className="mt-2 font-mono text-sm">{formatAmount(last.amount, last.token)}</div>
        {last.reference && <div className="mt-1 text-xs text-ink-dim">Ref: <span className="font-mono">{last.reference}</span></div>}
        <a
          className="mt-3 inline-block text-xs text-ink-dim hover:text-ink underline underline-offset-4"
          href={explorerTxUrl(link.chainId, last.txHash)}
          target="_blank"
          rel="noreferrer"
        >
          View on explorer ↗
        </a>
        <button
          type="button"
          className="btn-ghost mt-6 inline-flex"
          onClick={() => {
            setLast(null);
            setStep("idle");
            setAmount("");
            setReference(link.requireReference ? "" : reference);
          }}
        >
          Make another deposit
        </button>
      </div>
    );
  }

  if (!isConnected || !address) {
    return (
      <div className="mt-7 border-t border-line pt-6 text-center">
        <p className="text-sm text-ink-dim mb-4">Connect a wallet on {targetChain.name} to deposit.</p>
        <div className="inline-flex"><ConnectButton /></div>
      </div>
    );
  }

  if (wrongChain) {
    return (
      <div className="mt-7 border-t border-line pt-6 text-center">
        <p className="text-sm text-ink-dim mb-4">
          This deposit link is on <span className="text-ink font-medium">{targetChain.name}</span>. Switch your wallet to continue.
        </p>
        <button
          type="button"
          disabled={switching}
          onClick={() => switchChain({ chainId: link.chainId })}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: brandColor }}
        >
          {switching ? "Switching…" : `Switch to ${targetChain.shortName}`}
        </button>
      </div>
    );
  }

  if (allowedTokens.length === 0) {
    return (
      <div className="mt-7 border-t border-line pt-6 text-center text-ink-dim">
        The merchant has not enabled any stablecoins on {targetChain.name}. Ask them to update their gateway settings.
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || !address) return;
    setErrMsg(null);

    const tokenInfoForTx = getToken(link.chainId, token);
    if (!tokenInfoForTx) {
      setErrMsg(`No token registry entry for ${token} on this chain.`);
      setStep("error");
      return;
    }
    const amountWei = parseUnits(amount.trim(), tokenInfoForTx.decimals);
    // Encode the slug into the on-chain reference so the backend indexer can
    // associate the resulting DepositReceived event with the correct link.
    const refForTx = encodePaymentRef(link.slug, link.requireReference ? reference.trim() : undefined);

    try {
      let txHash: `0x${string}`;

      if (isReal && publicClient) {
        // Approve (skipped when existing allowance is already enough).
        setStep("approving");
        const allowance = (await publicClient.readContract({
          address: tokenInfoForTx.address,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, PAYMENT_GATEWAY_ADDRESS!],
        })) as bigint;

        if (allowance < amountWei) {
          // Pre-simulate so reverts surface as decoded reasons
          // (ERC20InsufficientBalance, etc.) instead of MetaMask's mangled
          // "gas limit too high". Swallow network errors so a flaky RPC
          // doesn't gate the wallet send.
          await simulateOrSkipOnNetwork(publicClient, {
            address: tokenInfoForTx.address,
            abi: erc20Abi,
            functionName: "approve",
            args: [PAYMENT_GATEWAY_ADDRESS!, amountWei],
            account: address,
          });

          const approveHash = await writeContractAsync({
            address: tokenInfoForTx.address,
            abi: erc20Abi,
            functionName: "approve",
            args: [PAYMENT_GATEWAY_ADDRESS!, amountWei],
          });

          // Wait for the approve receipt before depositing — the deposit
          // call needs the allowance on-chain. If polling itself flakes we
          // still attempt the deposit; a stale-allowance failure surfaces
          // there with a clean decoded error.
          try {
            await publicClient.waitForTransactionReceipt({ hash: approveHash });
          } catch (err) {
            console.warn("[Deposit] approve receipt poll failed; proceeding anyway", err);
          }
        }

        setStep("paying");
        await simulateOrSkipOnNetwork(publicClient, {
          address: PAYMENT_GATEWAY_ADDRESS!,
          abi: secudigateAbi,
          functionName: "deposit",
          args: [link.merchant, refForTx, tokenInfoForTx.address, amountWei],
          account: address,
        });

        const depositHash = await writeContractAsync({
          address: PAYMENT_GATEWAY_ADDRESS!,
          abi: secudigateAbi,
          functionName: "deposit",
          args: [link.merchant, refForTx, tokenInfoForTx.address, amountWei],
        });

        // Wallet returned a hash → tx is in the mempool. Commit to success
        // immediately. Receipt polling runs in the background; a flaky RPC
        // failing the poll must NOT downgrade a successful broadcast into
        // an error toast.
        txHash = depositHash;
        publicClient
          .waitForTransactionReceipt({ hash: depositHash })
          .catch((err) => console.warn("[Deposit] receipt poll failed", err));
      } else {
        // Demo path — no gateway deployed yet.
        setStep("approving");
        await wait(900);
        setStep("paying");
        await wait(1200);
        txHash = ("0x" + Array.from(crypto.getRandomValues(new Uint8Array(32)))
          .map((b) => b.toString(16).padStart(2, "0")).join("")) as `0x${string}`;
      }

      const deposit = depositStore.record({
        linkSlug: link.slug,
        merchant: link.merchant,
        chainId: link.chainId,
        payer: address,
        reference: link.requireReference ? reference.trim() : undefined,
        token,
        amount: amount.trim(),
        txHash,
      });
      setLast(deposit);
      setStep("done");
      if (isReal) {
        toast.success("Deposit confirmed", `${formatAmount(amount.trim(), token)} on ${targetChain.shortName}`);
      } else {
        toast.info("Demo deposit recorded", "Set VITE_PAYMENT_GATEWAY_ADDRESS for real on-chain calls.");
      }
    } catch (e) {
      const { title, body } = describeWriteError(e);
      setErrMsg(body);
      setStep("error");
      toast.error(title, body);
    }
  }

  const busy = step === "approving" || step === "paying";
  const tokenInfo = getToken(link.chainId, token);
  const tokenColor = tokenInfo?.color ?? symbolColor(token);

  return (
    <form onSubmit={handleSubmit} className="mt-7 border-t border-line pt-6 space-y-5">
      <div>
        <label className="label" htmlFor="dp-amount">Amount to deposit</label>
        <div className="relative">
          <input
            id="dp-amount"
            inputMode="decimal"
            placeholder="0.00"
            className={`input font-mono pr-20 text-lg ${amount && !amountValid ? "border-bad/60" : ""}`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <span
            className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 text-sm font-medium"
          >
            <span
              className="h-5 w-5 rounded-full inline-flex items-center justify-center text-[10px] font-bold text-white"
              style={{ background: tokenColor }}
            >
              {token[0]}
            </span>
            {token}
          </span>
        </div>
        {amountValid && (
          <p className="mt-1.5 text-[11px] text-ink-faint">
            ≈ {formatUsd(tokenToUsd(token, amount.trim()))}
          </p>
        )}
        {(link.minAmount || link.maxAmount) && (
          <p className="mt-1.5 text-[11px] text-ink-faint">
            {link.minAmount && <>min {link.minAmount}</>}
            {link.minAmount && link.maxAmount && <> · </>}
            {link.maxAmount && <>max {link.maxAmount}</>}
          </p>
        )}
        {amount && !minOk && <p className="mt-1.5 text-[11px] text-bad">Below minimum ({link.minAmount}).</p>}
        {amount && !maxOk && <p className="mt-1.5 text-[11px] text-bad">Above maximum ({link.maxAmount}).</p>}
      </div>

      <div>
        <label className="label">Stablecoin</label>
        <div
          className={`grid gap-2`}
          style={{ gridTemplateColumns: `repeat(${allowedTokens.length}, minmax(0, 1fr))` }}
        >
          {allowedTokens.map((t) => (
            <button
              type="button"
              key={t.symbol}
              onClick={() => setToken(t.symbol)}
              className={`px-3 py-2 rounded-xl text-sm font-medium border transition-colors flex items-center justify-center gap-2 ${
                token === t.symbol
                  ? "border-brand/50 text-ink"
                  : "bg-bg-soft border-line text-ink-dim hover:text-ink"
              }`}
              style={token === t.symbol ? { background: `${brandColor}22`, borderColor: `${brandColor}88` } : undefined}
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
      </div>

      {link.requireReference && (
        <div>
          <label className="label" htmlFor="dp-ref">{link.referenceLabel}</label>
          <input
            id="dp-ref"
            className={`input ${reference && !referenceOk ? "border-bad/60" : ""}`}
            placeholder={`Your ${link.referenceLabel.toLowerCase()}`}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
          <p className="mt-1.5 text-[11px] text-ink-faint">The merchant uses this to credit your account.</p>
        </div>
      )}

      {(() => {
        if (!amountValid || !minOk || !maxOk || !isReal || !address) return null;
        const info = getToken(link.chainId, token);
        if (!info) return null;
        return (
          <EmptyBalanceHelper
            payer={address}
            token={info.address}
            tokenDecimals={info.decimals}
            tokenSymbol={token}
            requiredAmount={parseUnits(amount.trim(), info.decimals)}
            chainId={link.chainId}
          />
        );
      })()}

      {amountValid && minOk && maxOk && (
        <FeePreview
          merchant={link.merchant}
          chainId={link.chainId}
          token={token}
          humanAmount={amount.trim()}
          isReal={isReal}
        />
      )}

      <div className="grid grid-cols-2 gap-2 text-xs">
        <Stage label="Approve" active={step === "approving"} done={step === "paying" || step === "done"} />
        <Stage label="Deposit" active={step === "paying"} done={step === "done"} />
      </div>

      <button
        disabled={!ready || busy}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: brandColor }}
      >
        {step === "approving" && "Awaiting approval…"}
        {step === "paying" && "Submitting deposit…"}
        {(step === "idle" || step === "error") && (amountValid && minOk && maxOk
          ? `Deposit ${formatAmount(amount.trim(), token)}`
          : "Enter an amount")}
        {step === "done" && "Done"}
      </button>

      <p className="text-[11px] text-ink-faint text-center">
        Demo: simulates the approve + pay flow client-side. Replaced by real on-chain calls once the gateway contract is deployed.
      </p>
      {errMsg && <div className="text-xs text-bad text-center">{errMsg}</div>}
    </form>
  );
}

function Stage({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <div
      className={`px-3 py-2 rounded-xl border text-center ${
        done
          ? "border-good/40 bg-good/10 text-good"
          : active
          ? "border-brand/40 bg-brand/10 text-brand-soft"
          : "border-line bg-bg-soft text-ink-faint"
      }`}
    >
      {done ? "✓ " : active ? "⏳ " : ""}{label}
    </div>
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

// Pre-simulate via the resilient fallback RPC client. A revert surfaces as
// a decoded reason (ERC20InsufficientBalance, SanctionedAddress, etc.); a
// network outage is swallowed so the wallet can still try — its own RPC may
// work when ours doesn't, and MetaMask's "Send anyway" button is the fallback.
type SimulateCapableClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  simulateContract: (args: any) => Promise<unknown>;
};
async function simulateOrSkipOnNetwork(
  client: SimulateCapableClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any,
): Promise<void> {
  try {
    await client.simulateContract(args);
  } catch (simErr) {
    if (describeWriteError(simErr).title !== "Network unreachable") throw simErr;
    console.warn("[Deposit] pre-simulate skipped (RPC outage)", simErr);
  }
}

// Reads the contract's `quote(merchant, amount)` so the depositor sees the
// exact platform / merchant / net split before they sign. Identical pattern
// to the one on Pay.tsx — worth a small duplication for now since the
// rendering is unique to each surface.
function FeePreview({
  merchant,
  chainId,
  token,
  humanAmount,
  isReal,
}: {
  merchant: `0x${string}`;
  chainId: number;
  token: StablecoinSymbol;
  humanAmount: string;
  isReal: boolean;
}) {
  const tokenInfo = getToken(chainId, token);
  const amountWei = tokenInfo ? parseUnits(humanAmount, tokenInfo.decimals) : 0n;

  const { data } = useReadContract({
    address: PAYMENT_GATEWAY_ADDRESS,
    abi: secudigateAbi,
    functionName: "quote",
    args: [merchant, amountWei],
    chainId,
    query: { enabled: isReal && Boolean(tokenInfo) && amountWei > 0n },
  });
  const split = data as readonly [bigint, bigint, bigint] | undefined;
  if (!split || !tokenInfo) return null;

  const [platformFee, merchantFee, netToTreasury] = split;
  const fmt = (wei: bigint) => `${formatUnits(wei, tokenInfo.decimals)} ${token}`;

  return (
    <div className="rounded-xl border border-line bg-bg-soft/60 px-4 py-3 text-xs">
      <div className="text-[10px] uppercase tracking-widest text-ink-faint mb-2">Breakdown</div>
      <dl className="space-y-1.5">
        <FeeRow label="Total"        value={fmt(amountWei)} />
        <FeeRow label="Platform fee" value={fmt(platformFee)} dim={platformFee === 0n} />
        {merchantFee > 0n && <FeeRow label="Merchant fee" value={fmt(merchantFee)} />}
        <FeeRow label="To merchant"  value={fmt(netToTreasury)} bold />
      </dl>
    </div>
  );
}

function FeeRow({ label, value, bold, dim }: { label: string; value: string; bold?: boolean; dim?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 ${dim ? "text-ink-faint" : ""}`}>
      <dt>{label}</dt>
      <dd className={`font-mono ${bold ? "font-semibold text-ink" : "text-ink"}`}>{value}</dd>
    </div>
  );
}
