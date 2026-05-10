import type { StablecoinSymbol } from "./tokens";

export type InvoiceStatus = "pending" | "paid" | "expired";

// Discriminator between the two flows the dashboard exposes:
// - "invoice"   — generic e-commerce / marketplace invoice (default)
// - "freelance" — freelancer billing a client, with client name/email and
//                 a human-friendly invoice number. No merchant fee surface.
//
// The on-chain contract treats both identically; this is a UI / record
// distinction only.
export type InvoiceKind = "invoice" | "freelance";

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: string;       // decimal string, in the invoice's token
}

export interface Invoice {
  id: string;                // 0x-prefixed hex (bytes32-shaped for the future contract call)
  merchant: `0x${string}`;   // registered merchant — treasury that funds route to + identity used in the contract call
  creator?: `0x${string}`;   // wallet that issued the invoice (may differ from merchant if treasury is someone else)
  chainId: number;
  token: StablecoinSymbol;
  amount: string;            // human-readable decimal string — for itemized invoices this is the computed grand total
  description?: string;
  items?: InvoiceLineItem[];
  taxRate?: number;          // 0-1, applied to the line-item subtotal
  kind?: InvoiceKind;        // defaults to "invoice" when omitted (backward-compat for older rows)
  clientName?: string;       // freelance only
  clientEmail?: string;      // freelance only
  invoiceNumber?: string;    // freelance only — human-friendly sequence like "INV-2026-001"
  createdAt: number;         // unix ms
  expiresAt: number;         // unix ms
  status: InvoiceStatus;
  txHash?: `0x${string}`;
  payer?: `0x${string}`;
  paidAt?: number;
}

export interface CreateInvoiceInput {
  merchant: `0x${string}`;
  creator: `0x${string}`;
  chainId: number;
  token: StablecoinSymbol;
  amount: string;
  description?: string;
  items?: InvoiceLineItem[];
  taxRate?: number;
  expiresInMinutes: number;
  kind?: InvoiceKind;
  clientName?: string;
  clientEmail?: string;
  invoiceNumber?: string;
}

export function computeItemsTotal(items: InvoiceLineItem[], taxRate = 0): { subtotal: number; tax: number; total: number } {
  const subtotal = items.reduce((sum, it) => {
    const q = Number(it.quantity) || 0;
    const p = Number(it.unitPrice) || 0;
    return sum + q * p;
  }, 0);
  const tax = subtotal * (taxRate || 0);
  return { subtotal, tax, total: subtotal + tax };
}
