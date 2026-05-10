import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db.js";
import { newSecret } from "../lib/ids.js";
import { requireMerchantAuth } from "../lib/auth.js";
import { enqueueTestDelivery } from "../webhooks/dispatcher.js";

const EVENT_TYPES = ["invoice.paid", "deposit.received"] as const;

const CreateWebhook = z.object({
  url:    z.string().url(),
  events: z.array(z.enum(EVENT_TYPES)).min(1),
});

const PatchWebhook = z.object({
  url:    z.string().url().optional(),
  events: z.array(z.enum(EVENT_TYPES)).min(1).optional(),
  active: z.boolean().optional(),
});

function serialize(w: {
  id: string;
  merchantAddress: string;
  url: string;
  secret: string;
  previousSecret: string | null;
  previousSecretExpiresAt: Date | null;
  events: string;
  active: boolean;
  createdAt: Date;
}, opts: { includeSecret: boolean }) {
  // The "previous" secret survives rotation in the DB but only counts as
  // active while its expiry is in the future. The serializer hides expired
  // entries so the client doesn't have to know the rule.
  const previousActive = w.previousSecret && w.previousSecretExpiresAt
    && w.previousSecretExpiresAt.getTime() > Date.now();
  return {
    id: w.id,
    merchant: w.merchantAddress,
    url: w.url,
    events: JSON.parse(w.events) as string[],
    active: w.active,
    createdAt: w.createdAt.toISOString(),
    // Secret is returned in full ONLY at create + rotate time. After that,
    // callers see a masked preview only.
    secret: opts.includeSecret ? w.secret : `${w.secret.slice(0, 6)}…${w.secret.slice(-4)}`,
    // Rotation metadata. Frontend uses these to render the grace-window
    // countdown banner. previousSecret itself is never re-exposed.
    previousSecretPreview: previousActive
      ? `${w.previousSecret!.slice(0, 6)}…${w.previousSecret!.slice(-4)}`
      : null,
    previousSecretExpiresAt: previousActive
      ? w.previousSecretExpiresAt!.toISOString()
      : null,
  };
}

const ROTATE_GRACE_MS = 24 * 60 * 60 * 1000; // 24h dual-secret window

export default async function webhookRoutes(app: FastifyInstance) {
  app.get("/v1/webhooks", async (req, reply) => {
    if (!requireMerchantAuth(req, reply)) return;
    const me = req.merchantAddress!;
    const list = await db.webhook.findMany({
      where: { merchantAddress: me },
      orderBy: { createdAt: "desc" },
    });
    return list.map((w) => serialize(w, { includeSecret: false }));
  });

  app.post("/v1/webhooks", async (req, reply) => {
    if (!requireMerchantAuth(req, reply)) return;
    const me = req.merchantAddress!;
    const body = CreateWebhook.parse(req.body);

    await db.merchant.upsert({
      where: { address: me },
      update: {},
      create: {
        address: me,
        defaultTreasury: me,
        acceptedTokens: JSON.stringify(["USDC", "USDT", "DAI"]),
        acceptedChains: JSON.stringify([11155111]),
        defaultChainId: 11155111,
        merchantFeeReceiver: me,
      },
    });

    const created = await db.webhook.create({
      data: {
        merchantAddress: me,
        url:    body.url,
        secret: newSecret(),
        events: JSON.stringify(body.events),
      },
    });
    // First-and-only time we hand back the full secret.
    return reply.code(201).send(serialize(created, { includeSecret: true }));
  });

  app.patch<{ Params: { id: string } }>("/v1/webhooks/:id", async (req, reply) => {
    if (!requireMerchantAuth(req, reply)) return;
    const me = req.merchantAddress!;
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const body = PatchWebhook.parse(req.body);

    const wh = await db.webhook.findUnique({ where: { id } });
    if (!wh) return reply.code(404).send({ error: "not_found" });
    if (wh.merchantAddress !== me) return reply.code(403).send({ error: "forbidden" });

    const updated = await db.webhook.update({
      where: { id },
      data: {
        ...(body.url !== undefined ? { url: body.url } : {}),
        ...(body.events !== undefined ? { events: JSON.stringify(body.events) } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
      },
    });
    return serialize(updated, { includeSecret: false });
  });

  app.delete<{ Params: { id: string } }>("/v1/webhooks/:id", async (req, reply) => {
    if (!requireMerchantAuth(req, reply)) return;
    const me = req.merchantAddress!;
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);

    const wh = await db.webhook.findUnique({ where: { id } });
    if (!wh) return reply.code(404).send({ error: "not_found" });
    if (wh.merchantAddress !== me) return reply.code(403).send({ error: "forbidden" });
    await db.webhook.delete({ where: { id } });
    return reply.code(204).send();
  });

  app.get<{ Params: { id: string } }>("/v1/webhooks/:id/deliveries", async (req, reply) => {
    if (!requireMerchantAuth(req, reply)) return;
    const me = req.merchantAddress!;
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const wh = await db.webhook.findUnique({ where: { id } });
    if (!wh) return reply.code(404).send({ error: "not_found" });
    if (wh.merchantAddress !== me) return reply.code(403).send({ error: "forbidden" });

    const deliveries = await db.webhookDelivery.findMany({
      where: { webhookId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return deliveries.map((d) => ({
      id:             d.id,
      eventType:      d.eventType,
      attempts:       d.attempts,
      lastAttemptAt:  d.lastAttemptAt?.toISOString() ?? null,
      successAt:      d.successAt?.toISOString() ?? null,
      responseStatus: d.responseStatus,
      responseBody:   d.responseBody,
      createdAt:      d.createdAt.toISOString(),
    }));
  });

  app.post<{ Params: { id: string } }>("/v1/webhooks/:id/test", async (req, reply) => {
    if (!requireMerchantAuth(req, reply)) return;
    const me = req.merchantAddress!;
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const wh = await db.webhook.findUnique({ where: { id } });
    if (!wh) return reply.code(404).send({ error: "not_found" });
    if (wh.merchantAddress !== me) return reply.code(403).send({ error: "forbidden" });
    if (!wh.active) return reply.code(409).send({ error: "webhook_inactive" });

    // Synthetic invoice.paid payload — the same shape a real one would have.
    const fakeInvoice = {
      id: "0x" + "00".repeat(32),
      merchant: me,
      creator: me,
      chainId: 11155111,
      token: "USDC",
      amount: "25.00",
      description: "Secudigate test event",
      items: null,
      taxRateBps: null,
      expiresAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
      status: "paid",
      txHash: "0x" + "00".repeat(32),
      payer:  "0x" + "00".repeat(20),
      paidAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    const deliveryId = await enqueueTestDelivery(wh.id, "invoice.paid", { invoice: fakeInvoice });
    if (!deliveryId) return reply.code(409).send({ error: "webhook_inactive" });
    return reply.code(202).send({ deliveryId });
  });

  // Moves the current secret into `previousSecret` with a 24h expiry and
  // mints a new current secret. Until the expiry passes, signatures from
  // either secret are valid — receivers should accept both during the
  // grace window. New deliveries are always signed with the *current*
  // secret only; the previous one exists purely so already-in-flight or
  // imminent-retry deliveries don't strand the merchant during rotation.
  app.post<{ Params: { id: string } }>("/v1/webhooks/:id/rotate", async (req, reply) => {
    if (!requireMerchantAuth(req, reply)) return;
    const me = req.merchantAddress!;
    const { id } = z.object({ id: z.string().min(1) }).parse(req.params);
    const wh = await db.webhook.findUnique({ where: { id } });
    if (!wh) return reply.code(404).send({ error: "not_found" });
    if (wh.merchantAddress !== me) return reply.code(403).send({ error: "forbidden" });

    const updated = await db.webhook.update({
      where: { id },
      data: {
        previousSecret:          wh.secret,
        previousSecretExpiresAt: new Date(Date.now() + ROTATE_GRACE_MS),
        secret:                  newSecret(),
      },
    });
    // First-and-only time we hand back the freshly-rotated secret in
    // plaintext. Subsequent reads only see the masked preview.
    return reply.code(200).send(serialize(updated, { includeSecret: true }));
  });
}
