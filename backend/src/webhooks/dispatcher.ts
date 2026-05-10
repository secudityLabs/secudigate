import type { FastifyBaseLogger } from "fastify";
import { db } from "../db.js";
import { signBody } from "./sign.js";

export type WebhookEventType = "invoice.paid" | "deposit.received";

const MAX_ATTEMPTS         = 5;
const RETRY_AFTER_SECONDS  = 30;     // soft cooldown between attempts
const POLL_INTERVAL_MS     = 5_000;
const HTTP_TIMEOUT_MS      = 10_000;
const MAX_RESPONSE_BODY    = 4_096;  // truncated and persisted for debugging

let dispatcherStarted = false;

// Called from the indexer after an event is durably ingested. Inserts a
// pending delivery row for each of the merchant's webhooks that subscribes
// to this event type. The dispatcher loop drains them.
export async function enqueueWebhooks(
  eventType: WebhookEventType,
  data: unknown,
  merchantAddress: string,
): Promise<void> {
  const webhooks = await db.webhook.findMany({
    where: { merchantAddress: merchantAddress.toLowerCase(), active: true },
  });
  if (webhooks.length === 0) return;

  const eligible = webhooks.filter((w) => {
    try {
      const events = JSON.parse(w.events) as unknown;
      return Array.isArray(events) && (events as string[]).includes(eventType);
    } catch { return false; }
  });
  if (eligible.length === 0) return;

  const envelope = {
    type: eventType,
    createdAt: new Date().toISOString(),
    data,
  };
  const payload = JSON.stringify(envelope);

  await Promise.all(eligible.map((w) =>
    db.webhookDelivery.create({
      data: { webhookId: w.id, eventType, payload },
    }),
  ));
}

// Enqueue a delivery for a specific webhook regardless of its event
// subscription list — used by the merchant-triggered "send test event"
// button. Returns the delivery id, or undefined if the webhook is
// inactive / nonexistent.
export async function enqueueTestDelivery(
  webhookId: string,
  eventType: WebhookEventType,
  data: unknown,
): Promise<string | undefined> {
  const wh = await db.webhook.findUnique({ where: { id: webhookId } });
  if (!wh || !wh.active) return undefined;
  const envelope = {
    type: eventType,
    createdAt: new Date().toISOString(),
    data,
    test: true,
  };
  const created = await db.webhookDelivery.create({
    data: {
      webhookId: wh.id,
      eventType,
      payload: JSON.stringify(envelope),
    },
  });
  return created.id;
}

// Idempotent — safe to call from the bootstrap path even if hot-reloaded.
export function startWebhookDispatcher(log: FastifyBaseLogger): void {
  if (dispatcherStarted) return;
  dispatcherStarted = true;
  const childLog = log.child({ component: "webhook-dispatcher" });
  childLog.info("dispatcher starting");
  void runDispatcher(childLog);
}

async function runDispatcher(log: FastifyBaseLogger) {
  while (true) {
    try {
      await tick(log);
    } catch (e) {
      log.error({ err: serializeErr(e) }, "dispatcher tick failed; will retry");
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

async function tick(log: FastifyBaseLogger) {
  const cutoff = new Date(Date.now() - RETRY_AFTER_SECONDS * 1000);

  // Pull a small batch of pending deliveries that are either fresh or past
  // their retry cooldown. Cap attempts so terminally-failing webhooks don't
  // get retried forever.
  const pending = await db.webhookDelivery.findMany({
    where: {
      successAt: null,
      attempts: { lt: MAX_ATTEMPTS },
      OR: [
        { lastAttemptAt: null },
        { lastAttemptAt: { lt: cutoff } },
      ],
    },
    take: 50,
    orderBy: { createdAt: "asc" },
  });
  if (pending.length === 0) return;

  for (const delivery of pending) {
    const wh = await db.webhook.findUnique({ where: { id: delivery.webhookId } });
    if (!wh || !wh.active) {
      // Mark terminal so we stop trying.
      await db.webhookDelivery.update({
        where: { id: delivery.id },
        data: { attempts: MAX_ATTEMPTS, lastAttemptAt: new Date() },
      });
      continue;
    }
    await deliver(log, delivery, wh);
  }
}

interface DeliveryRow {
  id: string;
  webhookId: string;
  eventType: string;
  payload: string;
  attempts: number;
}

interface WebhookRow {
  id: string;
  url: string;
  secret: string;
}

async function deliver(log: FastifyBaseLogger, delivery: DeliveryRow, wh: WebhookRow) {
  const signature = signBody(wh.secret, delivery.payload);
  const ts = Math.floor(Date.now() / 1000).toString();

  let status: number | null = null;
  let body: string | null = null;
  let success = false;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
    try {
      const res = await fetch(wh.url, {
        method: "POST",
        headers: {
          "content-type":           "application/json",
          "x-secudigate-signature": signature,
          "x-secudigate-timestamp": ts,
          "x-secudigate-delivery":  delivery.id,
          "x-secudigate-event":     delivery.eventType,
          "user-agent":             "Secudigate/0.1",
        },
        body: delivery.payload,
        signal: ctrl.signal,
      });
      status = res.status;
      const text = await res.text().catch(() => "");
      body = text.slice(0, MAX_RESPONSE_BODY);
      success = res.status >= 200 && res.status < 300;
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    body = `network: ${e instanceof Error ? e.message : String(e)}`.slice(0, MAX_RESPONSE_BODY);
  }

  await db.webhookDelivery.update({
    where: { id: delivery.id },
    data: {
      attempts:       { increment: 1 },
      lastAttemptAt:  new Date(),
      responseStatus: status,
      responseBody:   body,
      successAt:      success ? new Date() : null,
    },
  });

  if (success) {
    log.info(
      { delivery: delivery.id, event: delivery.eventType, url: wh.url, status },
      "webhook delivered",
    );
  } else {
    log.warn(
      { delivery: delivery.id, attempt: delivery.attempts + 1, status, body },
      "webhook delivery failed",
    );
  }
}

function sleep(ms: number) { return new Promise<void>((res) => setTimeout(res, ms)); }
function serializeErr(e: unknown): { message: string; stack?: string } {
  if (e instanceof Error) return { message: e.message, stack: e.stack };
  return { message: String(e) };
}
