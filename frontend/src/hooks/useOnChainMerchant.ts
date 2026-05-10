import { useReadContract } from "wagmi";
import { PAYMENT_GATEWAY_ADDRESS, secudigateAbi } from "../lib/contracts";
import { SEPOLIA_ID } from "../lib/chains";

type Tuple = readonly [`0x${string}`, `0x${string}`, number, bigint, boolean, boolean];

export interface OnChainMerchant {
  treasury: `0x${string}`;
  feeReceiver: `0x${string}`;
  feeBps: number;
  /// Per-payer daily cap in USD with 6 decimals. 0 = disabled.
  dailyLimitUsd6: bigint;
  registered: boolean;
  paused: boolean;
}

// Reads the live merchant slot from the gateway contract. The contract is
// the source of truth for where customer funds settle — local settings can
// drift if the merchant registers via cast/scripts instead of the modal.
export function useOnChainMerchant(merchant: `0x${string}` | undefined) {
  const { data, isLoading, refetch } = useReadContract({
    address: PAYMENT_GATEWAY_ADDRESS,
    abi: secudigateAbi,
    functionName: "merchants",
    args: merchant ? [merchant] : undefined,
    chainId: SEPOLIA_ID,
    query: { enabled: Boolean(PAYMENT_GATEWAY_ADDRESS && merchant) },
  });

  const tuple = data as Tuple | undefined;
  const onChain: OnChainMerchant | undefined = tuple
    ? {
        treasury:       tuple[0],
        feeReceiver:    tuple[1],
        feeBps:         Number(tuple[2]),
        dailyLimitUsd6: tuple[3],
        registered:     tuple[4],
        paused:         tuple[5],
      }
    : undefined;

  return { onChain, isLoading, refetch };
}
