// Wire types — exactly the shapes the backend serializes / accepts.
// Domain conversions to the frontend's existing types live in the per-resource
// modules so the rest of the app keeps using its existing types.

import type { StablecoinSymbol } from "../tokens";

export interface ApiInvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: string;
}

export interface ApiInvoice {
  id: string;                // 0x-prefixed bytes32
  merchant: string;          // lowercase 0x address
  creator: string;
  chainId: number;
  token: StablecoinSymbol;
  amount: string;
  description: string | null;
  items: ApiInvoiceLineItem[] | null;
  taxRateBps: number | null;
  kind: "invoice" | "freelance";
  clientName: string | null;
  clientEmail: string | null;
  invoiceNumber: string | null;
  expiresAt: string;         // ISO
  status: "pending" | "paid" | "expired";
  txHash: string | null;
  payer: string | null;
  paidAt: string | null;     // ISO
  createdAt: string;         // ISO
}

export interface ApiCreateInvoice {
  merchant: string;
  chainId: number;
  token: StablecoinSymbol;
  amount: string;
  description?: string;
  items?: ApiInvoiceLineItem[];
  taxRateBps?: number;
  expiresInMinutes: number;
  kind?: "invoice" | "freelance";
  clientName?: string;
  clientEmail?: string;
  invoiceNumber?: string;
}

export interface ApiDepositLink {
  slug: string;
  merchant: string;
  chainId: number;
  treasury: string;
  title: string;
  description: string | null;
  requireReference: boolean;
  referenceLabel: string;
  minAmount: string | null;
  maxAmount: string | null;
  active: boolean;
  createdAt: string;
}

export interface ApiCreateDepositLink {
  slug?: string;
  chainId: number;
  treasury: string;
  title: string;
  description?: string;
  requireReference: boolean;
  referenceLabel: string;
  minAmount?: string;
  maxAmount?: string;
}

export interface ApiPatchDepositLink {
  title?: string;
  description?: string | null;
  treasury?: string;
  requireReference?: boolean;
  referenceLabel?: string;
  minAmount?: string | null;
  maxAmount?: string | null;
  active?: boolean;
}

export interface ApiDeposit {
  id: string;
  linkSlug: string;
  merchant: string;
  chainId: number;
  payer: string;
  reference: string | null;
  token: StablecoinSymbol;
  amount: string;
  txHash: string;
  paidAt: string;
}

export interface ApiMerchantSettings {
  address: string;
  businessName: string;
  brandColor: string;
  logoUrl: string | null;
  defaultTreasury: string;
  acceptedTokens: StablecoinSymbol[];
  acceptedChains: number[];
  defaultChainId: number;
  merchantFeeBps: number;
  merchantFeeReceiver: string;
  merchantDailyLimit: string;
  createdAt: string;
  updatedAt: string;
}
