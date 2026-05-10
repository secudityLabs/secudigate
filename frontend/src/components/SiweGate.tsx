import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useSiwe } from "../hooks/useSiwe";
import { isApiEnabled } from "../lib/api";

interface SiweGateProps {
  children: React.ReactNode;
}

// Gate a route behind a SIWE session.
//
// Render flow:
//   - API not configured → pass-through (localStorage demo mode).
//   - No wallet connected → connect prompt.
//   - Wallet connected, no session → sign-in prompt.
//   - Session bound to a different address → re-sign prompt.
//   - Authenticated → render children.
export default function SiweGate({ children }: SiweGateProps) {
  const { isConnected, address } = useAccount();
  const { isAuthenticated, isSigningIn, error, sessionAddress, signIn } = useSiwe();

  // Without a backend, the dashboard talks to localStorage — nothing to gate.
  if (!isApiEnabled()) return <>{children}</>;

  if (!isConnected || !address) {
    return (
      <div className="py-20 text-center max-w-md mx-auto">
        <h2 className="text-xl font-semibold">Connect a wallet to continue</h2>
        <p className="mt-2 text-sm text-ink-dim">
          The merchant dashboard is gated by a Sign-In-With-Ethereum signature.
        </p>
        <div className="mt-6 inline-flex"><ConnectButton /></div>
      </div>
    );
  }

  if (isAuthenticated) return <>{children}</>;

  // Connected but no valid session (either never signed in, expired, or
  // bound to a stale address after a wallet switch).
  const addressMismatch =
    sessionAddress && sessionAddress.toLowerCase() !== address.toLowerCase();

  return (
    <div className="py-20 text-center max-w-md mx-auto">
      <h2 className="text-xl font-semibold">Sign in with Ethereum</h2>
      <p className="mt-2 text-sm text-ink-dim leading-relaxed">
        Sign a short message with{" "}
        <span className="font-mono text-ink">{shortAddr(address)}</span> to
        prove you control this wallet. This is a free signature — no gas,
        no on-chain transaction.
      </p>
      {addressMismatch && (
        <p className="mt-3 text-[11px] text-warn">
          Your stored session is for a different wallet. Sign in again to
          continue with the current one.
        </p>
      )}
      <button
        type="button"
        className="btn-primary mt-6"
        onClick={() => void signIn()}
        disabled={isSigningIn}
      >
        {isSigningIn ? "Waiting for wallet…" : "Sign in"}
      </button>
      {error && <p className="mt-3 text-xs text-bad">{error}</p>}
    </div>
  );
}

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
