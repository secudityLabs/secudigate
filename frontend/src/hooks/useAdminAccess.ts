import { useReadContract } from "wagmi";
import { PAYMENT_GATEWAY_ADDRESS, secudigateAbi } from "../lib/contracts";
import { SEPOLIA_ID } from "../lib/chains";

interface AdminAccess {
  isOwner: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  owner: `0x${string}` | undefined;
}

// Reads the live owner + ADMIN_ROLE membership for the connected wallet.
// Both are pure contract reads — there is no off-chain state. The values
// drive the AdminGate wrapper, which collapses the /admin route to a
// 404-equivalent for non-admin wallets.
//
// Client-side gating is UX, not security: the contract's `onlyOwner` and
// `onlyRole(ADMIN_ROLE)` modifiers are the real authorization. A hostile
// user who edited the bundle to render the panel would still get
// `AccessControlUnauthorizedAccount` reverts from the contract.
export function useAdminAccess(account: `0x${string}` | undefined): AdminAccess {
  const enabled = Boolean(PAYMENT_GATEWAY_ADDRESS && account);

  const { data: owner, isLoading: ownerLoading } = useReadContract({
    address: PAYMENT_GATEWAY_ADDRESS,
    abi: secudigateAbi,
    functionName: "owner",
    chainId: SEPOLIA_ID,
    query: { enabled: Boolean(PAYMENT_GATEWAY_ADDRESS) },
  });

  const { data: isAdminFlag, isLoading: adminLoading } = useReadContract({
    address: PAYMENT_GATEWAY_ADDRESS,
    abi: secudigateAbi,
    functionName: "isAdmin",
    args: account ? [account] : undefined,
    chainId: SEPOLIA_ID,
    query: { enabled },
  });

  const isOwner = Boolean(owner && account && owner.toLowerCase() === account.toLowerCase());
  const isAdmin = Boolean(isAdminFlag);
  const isLoading = ownerLoading || adminLoading;

  return { isOwner, isAdmin, isLoading, owner: owner as `0x${string}` | undefined };
}
