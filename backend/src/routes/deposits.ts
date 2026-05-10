import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db.js";
import { requireMerchantAuth } from "../lib/auth.js";

const SLUG = z.string().regex(/^[a-zA-Z0-9_-]{3,32}$/);

const ListQuery = z.object({
  linkSlug: SLUG.optional(),
  limit:    z.coerce.number().int().positive().max(500).default(50),
});

function serialize(d: {
  id: string;
  linkSlug: string;
  merchantAddress: string;
  chainId: number;
  payer: string;
  reference: string | null;
  token: string;
  amount: string;
  txHash: string;
  paidAt: Date;
}) {
  return {
    id: d.id,
    linkSlug: d.linkSlug,
    merchant: d.merchantAddress,
    chainId: d.chainId,
    payer: d.payer,
    reference: d.reference,
    token: d.token,
    amount: d.amount,
    txHash: d.txHash,
    paidAt: d.paidAt.toISOString(),
  };
}

export default async function depositRoutes(app: FastifyInstance) {
  // Authenticated: list deposits for the caller's merchant slot.
  app.get("/v1/deposits", async (req, reply) => {
    if (!requireMerchantAuth(req, reply)) return;
    const me = req.merchantAddress!;
    const q = ListQuery.parse(req.query ?? {});
    const where: Record<string, unknown> = { merchantAddress: me };
    if (q.linkSlug) where.linkSlug = q.linkSlug;
    const list = await db.deposit.findMany({
      where,
      orderBy: { paidAt: "desc" },
      take: q.limit,
    });
    return list.map(serialize);
  });
}
