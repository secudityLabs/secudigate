import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db.js";
import { newInvoiceId } from "../lib/ids.js";
import { requireMerchantAuth } from "../lib/auth.js";

const ADDRESS = z.string().regex(/^0x[a-fA-F0-9]{40}$/i);
const INVOICE_ID = z.string().regex(/^0x[a-fA-F0-9]{64}$/i);

const InvoiceItem = z.object({
  description: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.string().regex(/^\d+(\.\d+)?$/),
});

const CreateInvoice = z.object({
  merchant:         ADDRESS,                              // treasury / on-chain merchant slot
  chainId:          z.number().int().positive(),
  token:            z.enum(["USDC", "USDT", "DAI"]),
  amount:           z.string().regex(/^\d+(\.\d+)?$/),
  description:      z.string().max(500).optional(),
  items:            z.array(InvoiceItem).optional(),
  taxRateBps:       z.number().int().min(0).max(10000).optional(),
  expiresInMinutes: z.number().int().positive().max(60 * 24 * 365),
  // Optional freelance metadata. The contract treats freelance invoices
  // identically to e-commerce ones; these fields are dashboard/display only.
  kind:             z.enum(["invoice", "freelance"]).default("invoice"),
  clientName:       z.string().max(120).optional(),
  clientEmail:      z.string().email().max(200).optional(),
  invoiceNumber:    z.string().max(40).optional(),
});

const ListQuery = z.object({
  status: z.enum(["pending", "paid", "expired"]).optional(),
  scope: z.enum(["created", "merchant"]).default("created"),
  // Lets the dashboard list freelance and regular invoices separately
  // without re-fetching everything and filtering client-side.
  kind:  z.enum(["invoice", "freelance"]).optional(),
});

function lc(s: string): string { return s.toLowerCase(); }

function serialize(i: {
  id: string;
  merchantAddress: string;
  creator: string;
  chainId: number;
  token: string;
  amount: string;
  description: string | null;
  items: string | null;
  taxRateBps: number | null;
  kind: string;
  clientName: string | null;
  clientEmail: string | null;
  invoiceNumber: string | null;
  expiresAt: Date;
  status: string;
  txHash: string | null;
  payer: string | null;
  paidAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: i.id,
    merchant: i.merchantAddress,
    creator: i.creator,
    chainId: i.chainId,
    token: i.token,
    amount: i.amount,
    description: i.description,
    items: i.items ? (JSON.parse(i.items) as unknown[]) : null,
    taxRateBps: i.taxRateBps,
    kind: i.kind,
    clientName: i.clientName,
    clientEmail: i.clientEmail,
    invoiceNumber: i.invoiceNumber,
    expiresAt: i.expiresAt.toISOString(),
    status: i.status,
    txHash: i.txHash,
    payer: i.payer,
    paidAt: i.paidAt?.toISOString() ?? null,
    createdAt: i.createdAt.toISOString(),
  };
}

export default async function invoiceRoutes(app: FastifyInstance) {
  // Public: anyone with the invoice id can fetch it. The pay page reads this.
  app.get<{ Params: { id: string } }>("/v1/invoices/:id", async (req, reply) => {
    const { id } = z.object({ id: INVOICE_ID }).parse(req.params);
    const inv = await db.invoice.findUnique({ where: { id } });
    if (!inv) return reply.code(404).send({ error: "not_found" });
    return serialize(inv);
  });

  // Authenticated: list invoices the caller created, or that route to their treasury.
  app.get("/v1/invoices", async (req, reply) => {
    if (!requireMerchantAuth(req, reply)) return;
    const me = req.merchantAddress!;
    const q = ListQuery.parse(req.query ?? {});
    const where: Record<string, unknown> = q.scope === "merchant" ? { merchantAddress: me } : { creator: me };
    if (q.status) where.status = q.status;
    if (q.kind)   where.kind   = q.kind;
    const list = await db.invoice.findMany({ where, orderBy: { createdAt: "desc" } });
    return list.map(serialize);
  });

  // Authenticated: create an invoice. Auth caller is recorded as the `creator`.
  app.post("/v1/invoices", async (req, reply) => {
    if (!requireMerchantAuth(req, reply)) return;
    const me = req.merchantAddress!;
    const body = CreateInvoice.parse(req.body);

    // Make sure the merchant slot exists in our cache so the FK resolves.
    await db.merchant.upsert({
      where: { address: lc(body.merchant) },
      update: {},
      create: {
        address:             lc(body.merchant),
        defaultTreasury:     lc(body.merchant),
        acceptedTokens:      JSON.stringify(["USDC", "USDT", "DAI"]),
        acceptedChains:      JSON.stringify([body.chainId]),
        defaultChainId:      body.chainId,
        merchantFeeReceiver: lc(body.merchant),
      },
    });

    const id = newInvoiceId();
    const expiresAt = new Date(Date.now() + body.expiresInMinutes * 60_000);
    const created = await db.invoice.create({
      data: {
        id,
        merchantAddress: lc(body.merchant),
        creator: me,
        chainId: body.chainId,
        token: body.token,
        amount: body.amount,
        description: body.description ?? null,
        items: body.items ? JSON.stringify(body.items) : null,
        taxRateBps: body.taxRateBps ?? null,
        kind: body.kind,
        clientName: body.clientName ?? null,
        clientEmail: body.clientEmail ?? null,
        invoiceNumber: body.invoiceNumber ?? null,
        expiresAt,
        status: "pending",
      },
    });
    return reply.code(201).send(serialize(created));
  });

  // Authenticated: cancel a pending invoice the caller created.
  app.post<{ Params: { id: string } }>("/v1/invoices/:id/cancel", async (req, reply) => {
    if (!requireMerchantAuth(req, reply)) return;
    const me = req.merchantAddress!;
    const { id } = z.object({ id: INVOICE_ID }).parse(req.params);
    const inv = await db.invoice.findUnique({ where: { id } });
    if (!inv) return reply.code(404).send({ error: "not_found" });
    if (inv.creator !== me) return reply.code(403).send({ error: "forbidden" });
    if (inv.status !== "pending") return reply.code(409).send({ error: "not_pending" });
    const updated = await db.invoice.update({
      where: { id },
      data: { status: "expired" },
    });
    return serialize(updated);
  });
}
