import { apiFetch, ApiError } from "../api";
import type { CreateDepositLinkInput, DepositLink } from "../deposits";
import type { ApiCreateDepositLink, ApiDepositLink, ApiPatchDepositLink } from "./types";

function fromApi(l: ApiDepositLink): DepositLink {
  return {
    slug: l.slug,
    merchant: l.merchant as `0x${string}`,
    chainId: l.chainId,
    treasury: l.treasury as `0x${string}`,
    title: l.title,
    description: l.description ?? undefined,
    requireReference: l.requireReference,
    referenceLabel: l.referenceLabel,
    minAmount: l.minAmount ?? undefined,
    maxAmount: l.maxAmount ?? undefined,
    active: l.active,
    createdAt: new Date(l.createdAt).getTime(),
  };
}

function toApi(input: CreateDepositLinkInput): ApiCreateDepositLink {
  return {
    slug: input.slug,
    chainId: input.chainId,
    treasury: input.treasury,
    title: input.title,
    description: input.description,
    requireReference: input.requireReference,
    referenceLabel: input.referenceLabel,
    minAmount: input.minAmount,
    maxAmount: input.maxAmount,
  };
}

export async function getDepositLink(slug: string): Promise<DepositLink | undefined> {
  try {
    const l = await apiFetch<ApiDepositLink>(`/v1/deposit-links/${encodeURIComponent(slug)}`);
    return fromApi(l);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return undefined;
    throw e;
  }
}

export async function listDepositLinks(): Promise<DepositLink[]> {
  const list = await apiFetch<ApiDepositLink[]>("/v1/deposit-links", { auth: true });
  return list.map(fromApi);
}

export async function createDepositLink(input: CreateDepositLinkInput): Promise<DepositLink> {
  const created = await apiFetch<ApiDepositLink>("/v1/deposit-links", {
    method: "POST",
    auth: true,
    body: toApi(input),
  });
  return fromApi(created);
}

export async function patchDepositLink(slug: string, patch: ApiPatchDepositLink): Promise<DepositLink> {
  const updated = await apiFetch<ApiDepositLink>(`/v1/deposit-links/${encodeURIComponent(slug)}`, {
    method: "PATCH",
    auth: true,
    body: patch,
  });
  return fromApi(updated);
}

export async function deleteDepositLink(slug: string): Promise<void> {
  await apiFetch<void>(`/v1/deposit-links/${encodeURIComponent(slug)}`, {
    method: "DELETE",
    auth: true,
  });
}
