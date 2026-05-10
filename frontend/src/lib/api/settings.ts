import { apiFetch, ApiError } from "../api";
import type { MerchantSettings } from "../settings";
import type { ApiMerchantSettings } from "./types";

function fromApi(s: ApiMerchantSettings): MerchantSettings {
  return {
    merchant: s.address as `0x${string}`,
    businessName: s.businessName,
    brandColor: s.brandColor,
    logoUrl: s.logoUrl ?? undefined,
    defaultTreasury: s.defaultTreasury as `0x${string}`,
    acceptedTokens: s.acceptedTokens,
    acceptedChains: s.acceptedChains,
    defaultChainId: s.defaultChainId,
    merchantFeeBps: s.merchantFeeBps,
    merchantFeeReceiver: s.merchantFeeReceiver as `0x${string}`,
    merchantDailyLimit: s.merchantDailyLimit,
    updatedAt: new Date(s.updatedAt).getTime(),
  };
}

function toApi(s: MerchantSettings): unknown {
  return {
    businessName: s.businessName,
    brandColor: s.brandColor,
    logoUrl: s.logoUrl ?? null,
    defaultTreasury: s.defaultTreasury,
    acceptedTokens: s.acceptedTokens,
    acceptedChains: s.acceptedChains,
    defaultChainId: s.defaultChainId,
    merchantFeeBps: s.merchantFeeBps,
    merchantFeeReceiver: s.merchantFeeReceiver,
    merchantDailyLimit: s.merchantDailyLimit,
  };
}

export async function getMerchantSettings(address: string): Promise<MerchantSettings | undefined> {
  try {
    const s = await apiFetch<ApiMerchantSettings>(`/v1/merchants/${address.toLowerCase()}`);
    return fromApi(s);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return undefined;
    throw e;
  }
}

export async function putMerchantSettings(s: MerchantSettings): Promise<MerchantSettings> {
  const updated = await apiFetch<ApiMerchantSettings>("/v1/merchants/me/settings", {
    method: "PUT",
    auth: true,
    body: toApi(s),
  });
  return fromApi(updated);
}
