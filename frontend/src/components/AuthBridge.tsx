import { useEffect } from "react";
import { useAccount } from "wagmi";
import { setApiAddress } from "../lib/api";

// Keeps the API client's auth singleton in sync with wagmi's connected
// account. Mount once near the root (App.tsx).
export default function AuthBridge() {
  const { address } = useAccount();
  useEffect(() => {
    setApiAddress(address);
  }, [address]);
  return null;
}
