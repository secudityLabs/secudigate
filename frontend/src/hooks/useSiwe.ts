import { useCallback, useEffect, useState } from "react";
import { useAccount, useChainId, useSignMessage } from "wagmi";
import { ApiError, getSiweSession, setSiweSession } from "../lib/api";
import { buildClientSiweMessage, fetchNonce, fetchMe, verifySignature } from "../lib/api/siwe";

interface SiweState {
  // True when a valid SIWE session exists for the currently-connected wallet.
  isAuthenticated: boolean;
  // True while a `signIn()` is in flight (nonce + wallet sign + verify).
  isSigningIn: boolean;
  // Last sign-in error, if any. Cleared on the next attempt.
  error: string | null;
  // The address the session is bound to (if any). May differ from the
  // currently connected wagmi account; the gate forces re-sign-in in that case.
  sessionAddress: `0x${string}` | null;
  signIn: () => Promise<boolean>;
  signOut: () => void;
}

// SIWE flow: request nonce → sign EIP-4361 message via wagmi → verify with
// backend → store the returned JWT.
//
// The hook syncs with `localStorage` across tabs via a custom event so
// signing out in one tab clears the others.
export function useSiwe(): SiweState {
  const { address: connected } = useAccount();
  const chainId = useChainId();
  const { signMessageAsync } = useSignMessage();
  const [tick, setTick] = useState(0);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-render on session changes (logout in another tab, expiry sweep).
  useEffect(() => {
    const handler = () => setTick((t) => t + 1);
    window.addEventListener("secudigate:siwe-session-changed", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("secudigate:siwe-session-changed", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  // Validate a stored session against the backend on first mount. If the
  // token was revoked / SESSION_SECRET rotated, drop it before any caller
  // hits a 401 from a real API route.
  useEffect(() => {
    const session = getSiweSession();
    if (!session) return;
    fetchMe()
      .then((me) => {
        if (me.address.toLowerCase() !== session.address.toLowerCase()) {
          // Backend disagrees about who this token is for — drop it.
          setSiweSession(null);
        }
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) setSiweSession(null);
        // Any other error (network, 500) is treated as "trust local cache for now".
      });
  }, []);

  const session = getSiweSession();
  const sessionAddress = session?.address ?? null;
  // If the wallet changed since sign-in, the existing session is for a
  // different identity — gate as unauthenticated so the caller re-signs.
  const isAuthenticated = Boolean(
    session && connected && sessionAddress?.toLowerCase() === connected.toLowerCase(),
  );

  const signIn = useCallback(async (): Promise<boolean> => {
    if (!connected) {
      setError("Connect a wallet first.");
      return false;
    }
    setError(null);
    setIsSigningIn(true);
    try {
      const { nonce } = await fetchNonce();
      const issuedAt = new Date().toISOString();
      const domain = window.location.host;
      const uri = window.location.origin;
      const message = buildClientSiweMessage({
        domain, address: connected, uri, chainId, nonce, issuedAt,
      });

      const signature = await signMessageAsync({ message });

      const verified = await verifySignature({
        address: connected, signature, nonce, issuedAt, chainId, uri, domain,
      });
      setSiweSession({
        token: verified.token,
        address: verified.address,
        expiresAt: Math.floor(Date.now() / 1000) + verified.expiresIn,
      });
      return true;
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else if (err instanceof Error) {
        // wagmi rejects with "User rejected the request." on cancel.
        setError(/user rejected|user denied/i.test(err.message)
          ? "Sign-in cancelled."
          : err.message);
      } else setError("Sign-in failed.");
      return false;
    } finally {
      setIsSigningIn(false);
    }
  }, [connected, chainId, signMessageAsync]);

  const signOut = useCallback(() => {
    setSiweSession(null);
    setError(null);
  }, []);

  // Suppress unused-var lint on `tick`; it exists solely to trigger
  // re-renders on cross-tab session updates.
  void tick;

  return { isAuthenticated, isSigningIn, error, sessionAddress, signIn, signOut };
}
