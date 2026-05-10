import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db.js";
import { suggestSlug } from "../lib/ids.js";
import { requireMerchantAuth } from "../lib/auth.js";

const ADDRESS = z.string().regex(/^0x[a-fA-F0-9]{40}$/i);
const SLUG = z.string().regex(/^[a-zA-Z0-9_-]{3,32}$/);
const AMOUNT_OPT = z.string().regex(/^\d+(\.\d+)?$/).optional();

const Create = z.object({
  slug:             SLUG.optional(),
  chainId:          z.number().int().positive(),
  treasury:         ADDRESS,
  title:            z.string().min(1).max(120),
  description:      z.string().max(500).optional(),
  requireReference: z.boolean().default(false),
  referenceLabel:   z.string().max(40).default("Reference"),
  minAmount:        AMOUNT_OPT,
  maxAmount:        AMOUNT_OPT,
});

const Patch = z.object({
  title:            z.string().min(1).max(120).optional(),
  description:      z.string().max(500).nullable().optional(),
  treasury:         ADDRESS.optional(),
  requireReference: z.boolean().optional(),
  referenceLabel:   z.string().max(40).optional(),
  minAmount:        AMOUNT_OPT.nullable(),
  maxAmount:        AMOUNT_OPT.nullable(),
  active:           z.boolean().optional(),
});

function lc(s: string): string { return s.toLowerCase(); }

function serialize(l: {
  slug: string;
  merchantAddress: string;
  chainId: number;
  treasury: string;
  title: string;
  description: string | null;
  requireReference: boolean;
  referenceLabel: string;
  minAmount: string | null;
  maxAmount: string | null;
  active: boolean;
  createdAt: Date;
}) {
  return {
    slug: l.slug,
    merchant: l.merchantAddress,
    chainId: l.chainId,
    treasury: l.treasury,
    title: l.title,
    description: l.description,
    requireReference: l.requireReference,
    referenceLabel: l.referenceLabel,
    minAmount: l.minAmount,
    maxAmount: l.maxAmount,
    active: l.active,
    createdAt: l.createdAt.toISOString(),
  };
}

export default async function depositLinkRoutes(app: FastifyInstance) {
  // Public: anyone with the slug can fetch the link.
  app.get<{ Params: { slug: string } }>("/v1/deposit-links/:slug", async (req, reply) => {
    const { slug } = z.object({ slug: SLUG }).parse(req.params);
    const link = await db.depositLink.findUnique({ where: { slug } });
    if (!link) return reply.code(404).send({ error: "not_found" });
    return serialize(link);
  });

  // Authenticated: list this merchant's links.
  app.get("/v1/deposit-links", async (req, reply) => {
    if (!requireMerchantAuth(req, reply)) return;
    const me = req.merchantAddress!;
    const list = await db.depositLink.findMany({
      where: { merchantAddress: me },
      orderBy: { createdAt: "desc" },
    });
    return list.map(serialize);
  });

  // Authenticated: create a new link.
  app.post("/v1/deposit-links", async (req, reply) => {
    if (!requireMerchantAuth(req, reply)) return;
    const me = req.merchantAddress!;
    const body = Create.parse(req.body);

    // Make sure the merchant row exists.
    await db.merchant.upsert({
      where: { address: me },
      update: {},
      create: {
        address: me,
        defaultTreasury: me,
        acceptedTokens: JSON.stringify(["USDC", "USDT", "DAI"]),
        acceptedChains: JSON.stringify([body.chainId]),
        defaultChainId: body.chainId,
        merchantFeeReceiver: me,
      },
    });

    const slug = body.slug ?? suggestSlug();
    const existing = await db.depositLink.findUnique({ where: { slug } });
    if (existing) return reply.code(409).send({ error: "slug_taken" });

    const created = await db.depositLink.create({
      data: {
        slug,
        merchantAddress: me,
        chainId: body.chainId,
        treasury: lc(body.treasury),
        title: body.title,
        description: body.description ?? null,
        requireReference: body.requireReference,
        referenceLabel: body.referenceLabel,
        minAmount: body.minAmount ?? null,
        maxAmount: body.maxAmount ?? null,
      },
    });
    return reply.code(201).send(serialize(created));
  });

  // Authenticated: edit fields on a link.
  app.patch<{ Params: { slug: string } }>("/v1/deposit-links/:slug", async (req, reply) => {
    if (!requireMerchantAuth(req, reply)) return;
    const me = req.merchantAddress!;
    const { slug } = z.object({ slug: SLUG }).parse(req.params);
    const body = Patch.parse(req.body);

    const link = await db.depositLink.findUnique({ where: { slug } });
    if (!link) return reply.code(404).send({ error: "not_found" });
    if (link.merchantAddress !== me) return reply.code(403).send({ error: "forbidden" });

    const updated = await db.depositLink.update({
      where: { slug },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.treasury !== undefined ? { treasury: lc(body.treasury) } : {}),
        ...(body.requireReference !== undefined ? { requireReference: body.requireReference } : {}),
        ...(body.referenceLabel !== undefined ? { referenceLabel: body.referenceLabel } : {}),
        ...(body.minAmount !== undefined ? { minAmount: body.minAmount } : {}),
        ...(body.maxAmount !== undefined ? { maxAmount: body.maxAmount } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
      },
    });
    return serialize(updated);
  });

  // Authenticated: delete a link (deposits referencing it remain — that's how SQLite handles
  // ON DELETE CASCADE only if explicitly defined; here we keep deposits and rely on the FK).
  app.delete<{ Params: { slug: string } }>("/v1/deposit-links/:slug", async (req, reply) => {
    if (!requireMerchantAuth(req, reply)) return;
    const me = req.merchantAddress!;
    const { slug } = z.object({ slug: SLUG }).parse(req.params);

    const link = await db.depositLink.findUnique({ where: { slug } });
    if (!link) return reply.code(404).send({ error: "not_found" });
    if (link.merchantAddress !== me) return reply.code(403).send({ error: "forbidden" });

    await db.depositLink.delete({ where: { slug } });
    return reply.code(204).send();
  });
}
