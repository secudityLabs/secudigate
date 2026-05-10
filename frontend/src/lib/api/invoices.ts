import { apiFetch, ApiError } from "../api";
import type { CreateInvoiceInput, Invoice, InvoiceLineItem } from "../types";
import type { ApiCreateInvoice, ApiInvoice, ApiInvoiceLineItem } from "./types";

function fromApi(i: ApiInvoice): Invoice {
  return {
    id: i.id,
    merchant: i.merchant as `0x${string}`,
    creator: i.creator as `0x${string}`,
    chainId: i.chainId,
    token: i.token,
    amount: i.amount,
    description: i.description ?? undefined,
    items: i.items ? i.items.map((it) => ({
      description: it.description,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
    })) : undefined,
    taxRate: i.taxRateBps !== null ? i.taxRateBps / 10_000 : undefined,
    kind: i.kind,
    clientName:    i.clientName    ?? undefined,
    clientEmail:   i.clientEmail   ?? undefined,
    invoiceNumber: i.invoiceNumber ?? undefined,
    createdAt: new Date(i.createdAt).getTime(),
    expiresAt: new Date(i.expiresAt).getTime(),
    status: i.status,
    txHash: (i.txHash ?? undefined) as `0x${string}` | undefined,
    payer: (i.payer ?? undefined) as `0x${string}` | undefined,
    paidAt: i.paidAt ? new Date(i.paidAt).getTime() : undefined,
  };
}

function lineItemsToApi(items?: InvoiceLineItem[]): ApiInvoiceLineItem[] | undefined {
  return items?.map((it) => ({
    description: it.description,
    quantity: it.quantity,
    unitPrice: it.unitPrice,
  }));
}

function toApi(input: CreateInvoiceInput): ApiCreateInvoice {
  return {
    merchant: input.merchant,
    chainId: input.chainId,
    token: input.token,
    amount: input.amount,
    description: input.description,
    items: lineItemsToApi(input.items),
    taxRateBps: input.taxRate !== undefined ? Math.round(input.taxRate * 10_000) : undefined,
    expiresInMinutes: input.expiresInMinutes,
    kind: input.kind,
    clientName:    input.clientName,
    clientEmail:   input.clientEmail,
    invoiceNumber: input.invoiceNumber,
  };
}

export async function getInvoice(id: string): Promise<Invoice | undefined> {
  try {
    const i = await apiFetch<ApiInvoice>(`/v1/invoices/${id}`);
    return fromApi(i);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return undefined;
    throw e;
  }
}

export async function listInvoices(opts: {
  status?: Invoice["status"];
  scope?:  "created" | "merchant";
  kind?:   "invoice" | "freelance";
} = {}): Promise<Invoice[]> {
  const params = new URLSearchParams();
  if (opts.status) params.set("status", opts.status);
  if (opts.scope)  params.set("scope",  opts.scope);
  if (opts.kind)   params.set("kind",   opts.kind);
  const qs = params.toString();
  const list = await apiFetch<ApiInvoice[]>(`/v1/invoices${qs ? `?${qs}` : ""}`, { auth: true });
  return list.map(fromApi);
}

export async function createInvoice(input: CreateInvoiceInput): Promise<Invoice> {
  const created = await apiFetch<ApiInvoice>("/v1/invoices", {
    method: "POST",
    auth: true,
    body: toApi(input),
  });
  return fromApi(created);
}

export async function cancelInvoice(id: string): Promise<Invoice> {
  const updated = await apiFetch<ApiInvoice>(`/v1/invoices/${id}/cancel`, {
    method: "POST",
    auth: true,
  });
  return fromApi(updated);
}
