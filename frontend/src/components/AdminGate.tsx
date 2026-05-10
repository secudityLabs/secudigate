import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAdminAccess } from "../hooks/useAdminAccess";
import NotFound from "../pages/NotFound";

interface AdminGateProps {
  children: (ctx: { isOwner: boolean; isAdmin: boolean; address: `0x${string}` }) => React.ReactNode;
}

// Collapses the /admin route to a NotFound page for non-admin wallets, so
// the route's existence isn't visible to anyone who can't use it. This is
// UX-only — the contract is the real authorization, and changing this
// component in DevTools doesn't grant the modified bundle any on-chain power.
export default function AdminGate({ children }: AdminGateProps) {
  const { address, isConnected } = useAccount();
  const { isOwner, isAdmin, isLoading } = useAdminAccess(address);

  // Hide existence: not connected → NotFound rather than "connect to view".
  // A connected non-admin also gets NotFound. The route is for admins only.
  if (!isConnected || !address) {
    return (
      <div className="py-24 text-center">
        <h1 className="text-2xl font-semibold">Connect a wallet</h1>
        <p className="mt-2 text-ink-dim text-sm">This page is gated by on-chain roles.</p>
        <div className="mt-8 inline-flex"><ConnectButton /></div>
      </div>
    );
  }

  if (isLoading) {
    return <div className="py-24 text-center text-xs text-ink-faint">Checking access…</div>;
  }

  if (!isOwner && !isAdmin) return <NotFound />;

  return <>{children({ isOwner, isAdmin, address })}</>;
}
