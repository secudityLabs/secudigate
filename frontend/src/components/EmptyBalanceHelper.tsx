import { useState } from "react";
import { useReadContract, useWriteContract, usePublicClient } from "wagmi";
import { formatUnits } from "viem";
import { useToast } from "./Toast";
import { erc20Abi } from "../lib/contracts";
import { describeWriteError } from "../lib/txErrors";

// ABI for the MockStablecoin.faucet() method. Open-access function that
// mints the stablecoin's standard drip (~1000 units) to the caller.
const faucetAbi = [
  {
    type: "function",
    name: "faucet",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
] as const;

interface EmptyBalanceHelperProps {
  // The connected wallet (payer).
  payer: `0x${string}`;
  // Address of the (mock) stablecoin the customer needs to pay with.
  token: `0x${string}`;
  // Decimals + symbol — used only for the display message; not for math.
  tokenDecimals: number;
  tokenSymbol: string;
  // How much they're being asked to send (raw wei). The helper only renders
  // if the wallet's current balance is strictly less than this.
  requiredAmount: bigint;
  // Chain id, so wagmi knows which transport to use.
  chainId: number;
}

// Helper card shown above the Pay / Deposit action when the connected
// wallet doesn't have enough of the required mock stablecoin.
//
// It does two things:
//   1. One-click claim from the MockStablecoin's open faucet() method.
//   2. Link out to a Sepolia ETH faucet for gas, since gas is the other
//      thing every first-time visitor is missing.
//
// On mainnet this component would never render (real users have to top up
// from an exchange). The faucet calls are gated on the testnet contract's
// open faucet() function existing, which mainnet USDC obviously doesn't.
export default function EmptyBalanceHelper(props: EmptyBalanceHelperProps) {
  const { payer, token, tokenDecimals, tokenSymbol, requiredAmount, chainId } = props;
  const toast = useToast();
  const publicClient = usePublicClient({ chainId });
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState(false);

  const { data: balance, refetch } = useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [payer],
    chainId,
  });

  const bal = (balance as bigint | undefined) ?? 0n;
  if (bal >= requiredAmount) return null;

  async function claim() {
    setBusy(true);
    try {
      const hash = await writeContractAsync({
        address: token,
        abi: faucetAbi,
        functionName: "faucet",
        chainId,
      });
      // Wait for confirmation so refetch sees the new balance.
      try { await publicClient?.waitForTransactionReceipt({ hash }); }
      catch { /* receipt poll failed — refetch anyway, balance is on-chain */ }
      await refetch();
      toast.success(`${tokenSymbol} claimed`, "1000 test tokens minted to your wallet.");
    } catch (err) {
      const { title, body } = describeWriteError(err);
      toast.error(title, body);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-warn/30 bg-warn/5 px-4 py-3 mb-4 text-xs">
      <div className="text-[10px] uppercase tracking-widest text-warn mb-1.5">Need test tokens</div>
      <p className="text-ink-dim leading-relaxed">
        You have <span className="font-mono text-ink">{formatUnits(bal, tokenDecimals)} {tokenSymbol}</span>.
        Need at least <span className="font-mono text-ink">{formatUnits(requiredAmount, tokenDecimals)} {tokenSymbol}</span>.
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-ghost text-xs py-1.5 px-2.5"
          onClick={claim}
          disabled={busy}
        >
          {busy ? "Claiming…" : `Claim 1000 ${tokenSymbol}`}
        </button>
        <a
          href="https://sepoliafaucet.com/"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-ink-dim hover:text-ink underline underline-offset-4"
        >
          Need Sepolia ETH for gas? ↗
        </a>
      </div>
    </div>
  );
}
