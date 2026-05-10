import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAccount, useChainId, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { QRCodeSVG } from "qrcode.react";
import { formatUnits, parseUnits } from "viem";
import { useInvoice } from "../hooks/useInvoices";
import { useSettingsByAddress } from "../hooks/useSettings";
import { invoiceStore } from "../lib/storage";
import { getToken, symbolColor } from "../lib/tokens";
import { explorerTxUrl, getChainOrDefault } from "../lib/chains";
import { formatAmount, formatRelativeTime, shortAddress } from "../lib/format";
import { tokenToUsd, formatUsd } from "../lib/usd";
import { erc20Abi, PAYMENT_GATEWAY_ADDRESS, secudigateAbi } from "../lib/contracts";
import { describeWriteError } from "../lib/txErrors";
import StatusBadge from "../components/StatusBadge";
import CopyButton from "../components/CopyButton";
import EmptyBalanceHelper from "../components/EmptyBalanceHelper";
import SecudigateMark from "../components/SecudigateMark";
import { useToast } from "../components/Toast";
import type { Invoice } from "../lib/types";
import type { MerchantSettings } from "../lib/settings";

export default function Pay() {
  const { id } = useParams();
  const invoice = useInvoice(id);
  const settings = useSettingsByAddress(invoice?.merchant);

  if (!invoice) {
    return (
      <div className="py-24 text-center">
        <h1 className="text-2xl font-semibold">Invoice not found</h1>
        <p className="mt-2 text-ink-dim">
          The link is invalid or the invoice was removed.
        </p>
        <Link to="/" className="btn-ghost mt-6 inline-flex">Back home</Link>
      </div>
    );
  }

  const tokenInfo = getToken(invoice.chainId, invoice.token);
  const tokenColor = tokenInfo?.color ?? symbolColor(invoice.token);
  const tokenName = tokenInfo?.name ?? invoice.token;
  const chainInfo = getChainOrDefault(invoice.chainId);
  const businessName = settings?.businessName?.trim() || "Secudigate";
  const brandColor = settings?.brandColor ?? "#7c5cff";

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
          <StatusBadge status={invoice.status} />
        </div>

        <div className="mt-5 flex items-baseline gap-3">
          <span
            className="h-9 w-9 rounded-full inline-flex items-center justify-center text-sm font-bold text-white"
            style={{ background: tokenColor }}
          >
            {invoice.token[0]}
          </span>
          <div>
            <div className="text-3xl font-semibold tracking-tight font-mono">
              {formatAmount(invoice.amount, invoice.token)}
            </div>
            <div className="text-xs text-ink-faint mt-0.5">≈ {formatUsd(tokenToUsd(invoice.token, invoice.amount))}</div>
          </div>
        </div>

        {invoice.description && (
          <p className="mt-3 text-ink-dim">{invoice.description}</p>
        )}

        {invoice.kind === "freelance" && (invoice.clientName || invoice.invoiceNumber) && (
          <div className="mt-5 rounded-xl border border-line bg-bg-soft/60 px-4 py-3 text-xs">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-ink-faint mb-1">Billed to</div>
                <div className="text-sm text-ink font-medium">
                  {invoice.clientName || <span className="italic text-ink-dim">No client name</span>}
                </div>
                {invoice.clientEmail && (
                  <div className="text-[11px] text-ink-faint mt-0.5">{invoice.clientEmail}</div>
                )}
              </div>
              {invoice.invoiceNumber && (
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-widest text-ink-faint mb-1">Invoice #</div>
                  <div className="font-mono text-sm text-ink">{invoice.invoiceNumber}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {invoice.items && invoice.items.length > 0 && (
          <ItemBreakdown items={invoice.items} taxRate={invoice.taxRate ?? 0} symbol={invoice.token} />
        )}

        <dl className="mt-7 space-y-3 text-sm">
          <Row label="To merchant" value={<span className="font-mono">{shortAddress(invoice.merchant)}</span>} />
          <Row label="Token" value={`${tokenName} (${invoice.token})`} />
          <Row label="Network" value={chainInfo.name} />
          <Row
            label={invoice.status === "paid" ? "Paid" : invoice.status === "expired" ? "Expired" : "Expires"}
            value={
              invoice.status === "paid"
                ? formatRelativeTime(invoice.paidAt ?? invoice.createdAt)
                : formatRelativeTime(invoice.expiresAt)
            }
          />
          <Row label="Invoice id" value={
            <span className="flex items-center gap-2">
              <span className="font-mono text-xs">{shortAddress(invoice.id, 10, 8)}</span>
              <CopyButton value={invoice.id} />
            </span>
          } />
        </dl>

        <PayQR url={`${window.location.origin}/pay/${invoice.id}`} brandColor={brandColor} />

        <div className="mt-7 border-t border-line pt-6">
          <PayAction invoice={invoice} settings={settings} />
        </div>
      </div>

      <div className="mt-6 text-center text-xs text-ink-faint">
        Powered by <span className="text-ink-dim">Secudigate</span> · this is a Sepolia testnet demo
      </div>
    </div>
  );
}

function ItemBreakdown({
  items,
  taxRate,
  symbol,
}: {
  items: NonNullable<Invoice["items"]>;
  taxRate: number;
  symbol: Invoice["token"];
}) {
  const subtotal = items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0);
  const tax = subtotal * (taxRate || 0);
  const total = subtotal + tax;
  return (
    <div className="mt-5 rounded-xl border border-line bg-bg-soft/50 divide-y divide-line/60">
      {items.map((it, i) => (
        <div key={i} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
          <div className="min-w-0">
            <div className="truncate">{it.description}</div>
            <div className="text-[11px] text-ink-faint font-mono">
              {it.quantity} × {Number(it.unitPrice).toFixed(2)} {symbol}
            </div>
          </div>
          <div className="font-mono whitespace-nowrap">
            {(Number(it.quantity) * Number(it.unitPrice)).toFixed(2)} {symbol}
          </div>
        </div>
      ))}
      <div className="px-4 py-2.5 text-xs space-y-1">
        <div className="flex items-center justify-between text-ink-dim">
          <span>Subtotal</span>
          <span className="font-mono">{subtotal.toFixed(2)} {symbol}</span>
        </div>
        {taxRate > 0 && (
          <div className="flex items-center justify-between text-ink-dim">
            <span>Tax ({(taxRate * 100).toFixed(taxRate * 100 % 1 === 0 ? 0 : 1)}%)</span>
            <span className="font-mono">{tax.toFixed(2)} {symbol}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-sm font-semibold pt-1 border-t border-line/60">
          <span>Total</span>
          <span className="font-mono">{total.toFixed(2)} {symbol}</span>
        </div>
      </div>
    </div>
  );
}

function PayQR({ url, brandColor }: { url: string; brandColor: string }) {
  return (
    <div className="hidden md:flex items-center gap-4 mt-7 pt-6 border-t border-line">
      <div className="bg-white rounded-xl p-2.5 shrink-0">
        <QRCodeSVG value={url} size={104} level="M" fgColor="#0b0d12" bgColor="#ffffff" />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium" style={{ color: brandColor }}>Pay from your phone</div>
        <p className="mt-1 text-xs text-ink-dim leading-relaxed">
          Open your phone's camera or wallet, point it at the code, and the pay page opens on your device.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="text-ink text-right">{value}</dd>
    </div>
  );
}

type PayStep = "idle" | "approving" | "paying" | "done" | "error";

function PayAction({ invoice, settings }: { invoice: Invoice; settings?: MerchantSettings }) {
  const { address, isConnected } = useAccount();
  const currentChainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: invoice.chainId });
  const toast = useToast();
  const [step, setStep] = useState<PayStep>("idle");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [paidTxHash, setPaidTxHash] = useState<`0x${string}` | null>(null);
  const brandColor = settings?.brandColor ?? "#7c5cff";
  const targetChain = getChainOrDefault(invoice.chainId);
  const wrongChain = isConnected && currentChainId !== invoice.chainId;

  if (invoice.status === "paid") {
    return (
      <div className="text-center">
        <div className="text-good font-medium">Payment received</div>
        {invoice.txHash && (
          <a
            className="mt-2 inline-block text-xs text-ink-dim hover:text-ink underline underline-offset-4"
            href={explorerTxUrl(invoice.chainId, invoice.txHash)}
            target="_blank"
            rel="noreferrer"
          >
            View on explorer ↗
          </a>
        )}
      </div>
    );
  }

  if (invoice.status === "expired") {
    return (
      <div className="text-center text-ink-dim">
        This invoice has expired. Ask the merchant to issue a new one.
      </div>
    );
  }

  if (!isConnected || !address) {
    return (
      <div className="text-center">
        <p className="text-sm text-ink-dim mb-4">Connect a wallet on {targetChain.name} to pay.</p>
        <div className="inline-flex"><ConnectButton /></div>
      </div>
    );
  }

  if (wrongChain) {
    return (
      <div className="text-center">
        <p className="text-sm text-ink-dim mb-4">
          This invoice is on <span className="text-ink font-medium">{targetChain.name}</span>. Switch your wallet to continue.
        </p>
        <button
          type="button"
          disabled={switching}
          onClick={() => switchChain({ chainId: invoice.chainId })}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: brandColor }}
        >
          {switching ? "Switching…" : `Switch to ${targetChain.shortName}`}
        </button>
      </div>
    );
  }

  // If the gateway address is configured (VITE_PAYMENT_GATEWAY_ADDRESS), this
  // calls the real contract: ERC20.approve → Secudigate.pay, sequentially.
  // Otherwise it falls back to a client-side simulation so the demo still
  // works without a deployment.
  async function executePayment() {
    setErrMsg(null);

    const tokenInfo = getToken(invoice.chainId, invoice.token);
    if (!tokenInfo) {
      setErrMsg(`No token registry entry for ${invoice.token} on this chain.`);
      setStep("error");
      return;
    }

    const amountWei = parseUnits(invoice.amount, tokenInfo.decimals);
    const realDeploy = Boolean(PAYMENT_GATEWAY_ADDRESS) && publicClient !== undefined;

    try {
      if (realDeploy) {
        // Approve (skipped when existing allowance is already enough).
        setStep("approving");
        const allowance = (await publicClient!.readContract({
          address: tokenInfo.address,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address!, PAYMENT_GATEWAY_ADDRESS!],
        })) as bigint;

        if (allowance < amountWei) {
          // Pre-simulate via our resilient fallback-RPC client so a revert
          // surfaces as a decoded reason (ERC20InsufficientBalance, etc.)
          // rather than MetaMask's mangled "gas limit too high". Network
          // failures are swallowed — let MetaMask try anyway.
          await simulateOrSkipOnNetwork(publicClient!, {
            address: tokenInfo.address,
            abi: erc20Abi,
            functionName: "approve",
            args: [PAYMENT_GATEWAY_ADDRESS!, amountWei],
            account: address!,
          });

          const approveHash = await writeContractAsync({
            address: tokenInfo.address,
            abi: erc20Abi,
            functionName: "approve",
            args: [PAYMENT_GATEWAY_ADDRESS!, amountWei],
          });

          // Wait for the approve receipt before paying — the pay tx needs
          // the allowance to be on-chain. If polling itself flakes we still
          // attempt the pay; a stale-allowance failure will surface there
          // with a clean error.
          try {
            await publicClient!.waitForTransactionReceipt({ hash: approveHash });
          } catch (err) {
            console.warn("[Pay] approve receipt poll failed; proceeding anyway", err);
          }
        }

        setStep("paying");
        await simulateOrSkipOnNetwork(publicClient!, {
          address: PAYMENT_GATEWAY_ADDRESS!,
          abi: secudigateAbi,
          functionName: "pay",
          args: [invoice.id as `0x${string}`, invoice.merchant, tokenInfo.address, amountWei],
          account: address!,
        });

        const payHash = await writeContractAsync({
          address: PAYMENT_GATEWAY_ADDRESS!,
          abi: secudigateAbi,
          functionName: "pay",
          args: [invoice.id as `0x${string}`, invoice.merchant, tokenInfo.address, amountWei],
        });

        // Wallet returned a hash → tx is in the mempool. Commit to success
        // immediately. Receipt polling runs in the background; a flaky RPC
        // failing the poll must NOT downgrade a successful broadcast to an
        // error toast.
        invoiceStore.markPaid(invoice.id, payHash, address!);
        setPaidTxHash(payHash);
        setStep("done");
        toast.success("Payment confirmed", `${formatAmount(invoice.amount, invoice.token)} on ${targetChain.shortName}`);

        publicClient!
          .waitForTransactionReceipt({ hash: payHash })
          .catch((err) => console.warn("[Pay] pay receipt poll failed", err));
        return;
      }

      // Demo path — no gateway deployed yet.
      setStep("approving");
      await wait(900);
      setStep("paying");
      await wait(1200);
      const fakeTx = ("0x" + Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0")).join("")) as `0x${string}`;
      invoiceStore.markPaid(invoice.id, fakeTx, address!);
      setPaidTxHash(fakeTx);
      setStep("done");
      toast.info("Demo payment recorded", "Deploy the gateway and set VITE_PAYMENT_GATEWAY_ADDRESS for real on-chain calls.");
    } catch (e) {
      const { title, body } = describeWriteError(e);
      setErrMsg(body);
      setStep("error");
      toast.error(title, body);
    }
  }

  const busy = step === "approving" || step === "paying";
  const isReal = Boolean(PAYMENT_GATEWAY_ADDRESS);

  if (step === "done" && paidTxHash) {
    return (
      <div className="text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-good/15 border border-good/40 flex items-center justify-center text-good mb-3">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div className="text-good font-medium">Payment confirmed</div>
        <div className="mt-1 text-xs text-ink-dim">
          {formatAmount(invoice.amount, invoice.token)} settled on {targetChain.shortName}.
        </div>
        <a
          className="mt-3 inline-block text-xs text-ink-dim hover:text-ink underline underline-offset-4"
          href={explorerTxUrl(invoice.chainId, paidTxHash)}
          target="_blank"
          rel="noreferrer"
        >
          View on explorer ↗
        </a>
      </div>
    );
  }

  const tokenInfoForHelper = getToken(invoice.chainId, invoice.token);
  const amountWeiForHelper = tokenInfoForHelper
    ? parseUnits(invoice.amount, tokenInfoForHelper.decimals)
    : 0n;

  return (
    <div>
      {isReal && address && tokenInfoForHelper && (
        <EmptyBalanceHelper
          payer={address}
          token={tokenInfoForHelper.address}
          tokenDecimals={tokenInfoForHelper.decimals}
          tokenSymbol={invoice.token}
          requiredAmount={amountWeiForHelper}
          chainId={invoice.chainId}
        />
      )}
      <FeePreview invoice={invoice} isReal={isReal} />
      <div className="grid grid-cols-2 gap-2 text-xs mb-4">
        <Stage label="Approve" active={step === "approving"} done={step === "paying" || step === "done"} />
        <Stage label="Pay" active={step === "paying"} done={step === "done"} />
      </div>
      <button
        onClick={executePayment}
        disabled={busy}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: brandColor }}
      >
        {step === "approving" && "Awaiting approval…"}
        {step === "paying" && "Submitting payment…"}
        {(step === "idle" || step === "error") && `Pay ${formatAmount(invoice.amount, invoice.token)}`}
      </button>
      <p className="mt-3 text-[11px] text-ink-faint text-center">
        {isReal
          ? `Two transactions: first approve, then pay. Settles on ${targetChain.shortName}.`
          : "Demo mode: client-side simulation. Deploy the gateway to enable real on-chain payments."}
      </p>
      {errMsg && <div className="mt-2 text-xs text-bad text-center">{errMsg}</div>}
    </div>
  );
}

// Reads the contract's `quote(merchant, amount)` so the customer sees the
// exact platform / merchant / net split before they sign. Falls back to
// the gross-only display if the contract isn't deployed (demo path) or
// the read fails.
function FeePreview({ invoice, isReal }: { invoice: Invoice; isReal: boolean }) {
  const tokenInfo = getToken(invoice.chainId, invoice.token);
  const amountWei = tokenInfo ? parseUnits(invoice.amount, tokenInfo.decimals) : 0n;

  const { data } = useReadContract({
    address: PAYMENT_GATEWAY_ADDRESS,
    abi: secudigateAbi,
    functionName: "quote",
    args: [invoice.merchant, amountWei],
    chainId: invoice.chainId,
    query: { enabled: isReal && Boolean(tokenInfo) && amountWei > 0n },
  });
  const split = data as readonly [bigint, bigint, bigint] | undefined;
  if (!split || !tokenInfo) return null;

  const [platformFee, merchantFee, netToTreasury] = split;
  const fmt = (wei: bigint) => `${formatUnits(wei, tokenInfo.decimals)} ${invoice.token}`;

  return (
    <div className="rounded-xl border border-line bg-bg-soft/60 px-4 py-3 mb-4 text-xs">
      <div className="text-[10px] uppercase tracking-widest text-ink-faint mb-2">Breakdown</div>
      <dl className="space-y-1.5">
        <Row3 label="Total"            value={fmt(amountWei)} />
        <Row3 label="Platform fee"     value={fmt(platformFee)} dim={platformFee === 0n} />
        {merchantFee > 0n && <Row3 label="Merchant fee" value={fmt(merchantFee)} />}
        <Row3 label="To merchant"      value={fmt(netToTreasury)} bold />
      </dl>
    </div>
  );
}

function Row3({ label, value, bold, dim }: { label: string; value: string; bold?: boolean; dim?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 ${dim ? "text-ink-faint" : ""}`}>
      <dt>{label}</dt>
      <dd className={`font-mono ${bold ? "font-semibold text-ink" : "text-ink"}`}>{value}</dd>
    </div>
  );
}

// viem-compatible PublicClient type (just the bit we need to call).
type SimulateCapableClient = {
  simulateContract: (args: SimulateArgs) => Promise<unknown>;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SimulateArgs = any;

// Pre-simulate via the resilient fallback RPC. If the call would revert
// we re-throw the (already decoded) error; if the RPC itself is down we
// swallow it so the wallet can still try — its own network may work when
// ours doesn't, and the user can hit "Send anyway" in MetaMask.
async function simulateOrSkipOnNetwork(client: SimulateCapableClient, args: SimulateArgs): Promise<void> {
  try {
    await client.simulateContract(args);
  } catch (simErr) {
    if (describeWriteError(simErr).title !== "Network unreachable") throw simErr;
    console.warn("[Pay] pre-simulate skipped (RPC outage)", simErr);
  }
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
