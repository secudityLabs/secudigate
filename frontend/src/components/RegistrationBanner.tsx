import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAccount, useReadContract } from "wagmi";
import { PAYMENT_GATEWAY_ADDRESS, secudigateAbi } from "../lib/contracts";
import { SEPOLIA_ID } from "../lib/chains";
import { useSettings } from "../hooks/useSettings";
import RegistrationModal from "./RegistrationModal";

type OnChainTuple = readonly [`0x${string}`, `0x${string}`, number, bigint, boolean, boolean];

// Sticky on-boarding prompt: shows on every merchant page (except Customize,
// which has its own inline status card) when the gateway is deployed but the
// connected wallet hasn't yet called `registerMerchant`. Without it,
// `pay()` / `deposit()` calls revert with `MerchantNotRegistered`.
export default function RegistrationBanner() {
  const { pathname } = useLocation();
  const { address, isConnected } = useAccount();
  const settings = useSettings(address);
  const [modalOpen, setModalOpen] = useState(false);

  const { data, refetch, isLoading } = useReadContract({
    address: PAYMENT_GATEWAY_ADDRESS,
    abi: secudigateAbi,
    functionName: "merchants",
    args: address ? [address] : undefined,
    chainId: SEPOLIA_ID,
    query: { enabled: Boolean(PAYMENT_GATEWAY_ADDRESS && address) },
  });

  // The Customize page already surfaces this status inline.
  if (pathname.startsWith("/merchant/customize")) return null;
  if (!PAYMENT_GATEWAY_ADDRESS) return null;
  if (!isConnected || !address || !settings) return null;
  if (isLoading) return null;

  const tuple = data as OnChainTuple | undefined;
  const registered = tuple?.[4] === true;
  if (registered) return null;

  return (
    <>
      <div className="card border-warn/40 bg-warn/5 p-4 mb-5 flex items-start gap-4 flex-wrap">
        <div className="flex-1 min-w-[260px]">
          <div className="text-sm font-semibold text-warn flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-warn animate-pulse" />
            Register your gateway before accepting payments
          </div>
          <p className="mt-1.5 text-xs text-ink-dim leading-relaxed max-w-xl">
            Until your wallet is registered with Secudigate on Sepolia, customers' <span className="font-mono">pay()</span> calls
            revert. One-time tx, registers your treasury and fee config on-chain. You can refine these later in{" "}
            <Link to="/merchant/customize" className="text-brand-soft underline underline-offset-2">Customize</Link>.
          </p>
        </div>
        <button
          type="button"
          className="btn-primary text-sm whitespace-nowrap"
          onClick={() => setModalOpen(true)}
        >
          Register now
        </button>
      </div>

      <RegistrationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onRegistered={() => refetch()}
        merchant={address}
        initialSettings={settings}
        alreadyRegistered={false}
      />
    </>
  );
}
