import { apiFetch } from "../api";
import type { Deposit } from "../deposits";
import type { ApiDeposit } from "./types";

function fromApi(d: ApiDeposit): Deposit {
  return {
    id: d.id,
    linkSlug: d.linkSlug,
    merchant: d.merchant as `0x${string}`,
    chainId: d.chainId,
    payer: d.payer as `0x${string}`,
    reference: d.reference ?? undefined,
    token: d.token,
    amount: d.amount,
    txHash: d.txHash as `0x${string}`,
    paidAt: new Date(d.paidAt).getTime(),
  };
}

export async function listDeposits(opts: { linkSlug?: string; limit?: number } = {}): Promise<Deposit[]> {
  const params = new URLSearchParams();
  if (opts.linkSlug) params.set("linkSlug", opts.linkSlug);
  if (opts.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  const list = await apiFetch<ApiDeposit[]>(`/v1/deposits${qs ? `?${qs}` : ""}`, { auth: true });
  return list.map(fromApi);
}
