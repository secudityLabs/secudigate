import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db.js";
import { requireMerchantAuth } from "../lib/auth.js";

const ADDRESS = z.string().regex(/^0x[a-fA-F0-9]{40}$/i);

const SettingsSchema = z.object({
  businessName:        z.string().max(80).default(""),
  brandColor:          z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#7c5cff"),
  logoUrl:             z.string().url().nullable().optional(),
  defaultTreasury:     ADDRESS,
  acceptedTokens:      z.array(z.enum(["USDC", "USDT", "DAI"])).min(1),
  acceptedChains:      z.array(z.number().int().positive()).min(1),
  defaultChainId:      z.number().int().positive(),
  merchantFeeBps:      z.number().int().min(0).max(1000).default(0),
  merchantFeeReceiver: ADDRESS,
  merchantDailyLimit:  z.string().regex(/^\d+$/).default("0"),
});

function lc(s: string): string { return s.toLowerCase(); }

function serialize(m: {
  address: string;
  businessName: string;
  brandColor: string;
  logoUrl: string | null;
  defaultTreasury: string;
  acceptedTokens: string;
  acceptedChains: string;
  defaultChainId: number;
  merchantFeeBps: number;
  merchantFeeReceiver: string;
  merchantDailyLimit: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    address: m.address,
    businessName: m.businessName,
    brandColor: m.brandColor,
    logoUrl: m.logoUrl ?? null,
    defaultTreasury: m.defaultTreasury,
    acceptedTokens: JSON.parse(m.acceptedTokens) as string[],
    acceptedChains: JSON.parse(m.acceptedChains) as number[],
    defaultChainId: m.defaultChainId,
    merchantFeeBps: m.merchantFeeBps,
    merchantFeeReceiver: m.merchantFeeReceiver,
    merchantDailyLimit: m.merchantDailyLimit,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

export default async function merchantRoutes(app: FastifyInstance) {
  // Public: read a merchant's off-chain settings (used by Pay/Deposit pages
  // to render the merchant's branding without the customer being authed).
  app.get<{ Params: { address: string } }>("/v1/merchants/:address", async (req, reply) => {
    const params = z.object({ address: ADDRESS }).parse(req.params);
    const m = await db.merchant.findUnique({ where: { address: lc(params.address) } });
    if (!m) return reply.code(404).send({ error: "not_found" });
    return serialize(m);
  });

  // Authenticated: upsert settings for the caller's merchant slot.
  app.put("/v1/merchants/me/settings", async (req, reply) => {
    if (!requireMerchantAuth(req, reply)) return;
    const me = req.merchantAddress!;
    const body = SettingsSchema.parse(req.body);

    const m = await db.merchant.upsert({
      where: { address: me },
      update: {
        businessName:        body.businessName,
        brandColor:          body.brandColor,
        logoUrl:             body.logoUrl ?? null,
        defaultTreasury:     lc(body.defaultTreasury),
        acceptedTokens:      JSON.stringify(body.acceptedTokens),
        acceptedChains:      JSON.stringify(body.acceptedChains),
        defaultChainId:      body.defaultChainId,
        merchantFeeBps:      body.merchantFeeBps,
        merchantFeeReceiver: lc(body.merchantFeeReceiver),
        merchantDailyLimit:  body.merchantDailyLimit,
      },
      create: {
        address:             me,
        businessName:        body.businessName,
        brandColor:          body.brandColor,
        logoUrl:             body.logoUrl ?? null,
        defaultTreasury:     lc(body.defaultTreasury),
        acceptedTokens:      JSON.stringify(body.acceptedTokens),
        acceptedChains:      JSON.stringify(body.acceptedChains),
        defaultChainId:      body.defaultChainId,
        merchantFeeBps:      body.merchantFeeBps,
        merchantFeeReceiver: lc(body.merchantFeeReceiver),
        merchantDailyLimit:  body.merchantDailyLimit,
      },
    });
    return serialize(m);
  });
}
