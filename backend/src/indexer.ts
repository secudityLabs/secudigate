import { decodeEventLog, type Log } from "viem";
import { sepoliaClient } from "./chain/client.js";
import { secudigateEventsAbi } from "./chain/abi.js";
import { formatTokenAmount, getDecimals, symbolForToken } from "./chain/tokens.js";
import { decodePaymentRef } from "./lib/payment-ref.js";
import { db } from "./db.js";
import { config } from "./config.js";
import { enqueueWebhooks } from "./webhooks/dispatcher.js";
import type { FastifyBaseLogger } from "fastify";

const SEPOLIA_CHAIN_ID = 11155111;
// Public Sepolia RPCs typically cap eth_getLogs at 10k blocks. 5k stays
// comfortably under that limit.
const CATCHUP_CHUNK = 5000n;

let running = false;

export async function startIndexer(log: FastifyBaseLogger): Promise<void> {
  const gateway = config.SEPOLIA_PAYMENT_GATEWAY_ADDRESS;
  if (!gateway) {
    log.warn("indexer disabled: SEPOLIA_PAYMENT_GATEWAY_ADDRESS not set");
    return;
  }
  if (running) return;
  running = true;

  const childLog = log.child({ component: "indexer", chainId: SEPOLIA_CHAIN_ID });
  childLog.info({ gateway }, "indexer starting");

  // Run the loop without awaiting it so the HTTP server boots regardless of
  // chain reachability. Any startup error (RPC down, DB locked) is caught
  // inside runForever and retried after INDEXER_POLL_MS.
  void runForever(childLog, gateway as `0x${string}`).catch((err) => {
    childLog.error({ err: serializeErr(err) }, "indexer crashed unexpectedly");
  });
}

async function runForever(log: FastifyBaseLogger, gateway: `0x${string}`) {
  let initialized = false;
  while (true) {
    try {
      if (!initialized) {
        await initCursor(log);
        initialized = true;
      }
      await tick(log, gateway);
    } catch (e) {
      log.error({ err: serializeErr(e) }, "indexer tick failed; will retry");
    }
    await sleep(config.INDEXER_POLL_MS);
  }
}

// Resolve the starting cursor on the first tick (not at startup), so a
// transient RPC outage at boot doesn't take down the HTTP server.
async function initCursor(log: FastifyBaseLogger) {
  const existing = await db.indexerState.findUnique({ where: { chainId: SEPOLIA_CHAIN_ID } });
  if (existing) {
    log.info({ lastBlock: existing.lastBlock.toString() }, "resuming from cursor");
    return;
  }
  let startBlock: bigint;
  if (config.SEPOLIA_INDEXER_START_BLOCK !== undefined) {
    startBlock = BigInt(config.SEPOLIA_INDEXER_START_BLOCK);
  } else {
    // No cursor and no configured start: begin from the current head.
    startBlock = await sepoliaClient.getBlockNumber();
  }
  await db.indexerState.create({
    data: { chainId: SEPOLIA_CHAIN_ID, lastBlock: startBlock - 1n },
  });
  log.info({ startBlock: startBlock.toString() }, "cursor initialized");
}

async function tick(log: FastifyBaseLogger, gateway: `0x${string}`) {
  const head = await sepoliaClient.getBlockNumber();
  let cursor = await readCursor();
  if (cursor >= head) return;

  while (cursor < head) {
    const from = cursor + 1n;
    const to = head < from + CATCHUP_CHUNK - 1n ? head : from + CATCHUP_CHUNK - 1n;

    const logs = await sepoliaClient.getLogs({
      address: gateway,
      events: secudigateEventsAbi,
      fromBlock: from,
      toBlock: to,
    });

    if (logs.length > 0) {
      log.info({ from: from.toString(), to: to.toString(), count: logs.length }, "processing logs");
      for (const entry of logs) {
        try { await handleLog(log, entry); }
        catch (e) { log.error({ err: serializeErr(e), tx: entry.transactionHash }, "log handler failed"); }
      }
    }

    await writeCursor(to);
    cursor = to;
  }
}

async function handleLog(log: FastifyBaseLogger, entry: Log) {
  const decoded = decodeEventLog({
    abi: secudigateEventsAbi,
    data: entry.data,
    topics: entry.topics,
  });

  if (decoded.eventName === "PaymentReceived") {
    const a = decoded.args as {
      invoiceId: `0x${string}`;
      merchant: `0x${string}`;
      payer: `0x${string}`;
      token: `0x${string}`;
      grossAmount: bigint;
    };
    const txHash = entry.transactionHash!;
    await onPaymentReceived(log, {
      invoiceId: a.invoiceId.toLowerCase() as `0x${string}`,
      merchant:  a.merchant.toLowerCase()  as `0x${string}`,
      payer:     a.payer.toLowerCase()     as `0x${string}`,
      token:     a.token,
      grossAmount: a.grossAmount,
      txHash,
    });
    return;
  }

  if (decoded.eventName === "DepositReceived") {
    const a = decoded.args as {
      merchant: `0x${string}`;
      payer: `0x${string}`;
      token: `0x${string}`;
      paymentRef: string;
      grossAmount: bigint;
    };
    const txHash = entry.transactionHash!;
    await onDepositReceived(log, {
      merchant: a.merchant.toLowerCase() as `0x${string}`,
      payer:    a.payer.toLowerCase()    as `0x${string}`,
      token:    a.token,
      paymentRef: a.paymentRef,
      grossAmount: a.grossAmount,
      txHash,
    });
    return;
  }
}

async function onPaymentReceived(
  log: FastifyBaseLogger,
  ev: {
    invoiceId: `0x${string}`;
    merchant: `0x${string}`;
    payer: `0x${string}`;
    token: `0x${string}`;
    grossAmount: bigint;
    txHash: `0x${string}`;
  },
) {
  const inv = await db.invoice.findUnique({ where: { id: ev.invoiceId } });
  if (!inv) {
    log.warn({ invoiceId: ev.invoiceId }, "PaymentReceived for unknown invoice — skipping");
    return;
  }
  if (inv.status === "paid") {
    return; // already processed
  }
  const updated = await db.invoice.update({
    where: { id: ev.invoiceId },
    data: {
      status: "paid",
      txHash: ev.txHash,
      payer: ev.payer,
      paidAt: new Date(),
    },
  });
  log.info({ invoiceId: ev.invoiceId, txHash: ev.txHash }, "invoice marked paid");

  // Fire `invoice.paid` webhooks. Failures don't block indexer progress —
  // the dispatcher's retry loop handles transient delivery failures.
  try {
    await enqueueWebhooks("invoice.paid", { invoice: serializeInvoice(updated) }, ev.merchant);
  } catch (e) {
    log.error({ err: serializeErr(e), invoiceId: ev.invoiceId }, "failed to enqueue invoice.paid webhook");
  }
}

async function onDepositReceived(
  log: FastifyBaseLogger,
  ev: {
    merchant: `0x${string}`;
    payer: `0x${string}`;
    token: `0x${string}`;
    paymentRef: string;
    grossAmount: bigint;
    txHash: `0x${string}`;
  },
) {
  const decoded = decodePaymentRef(ev.paymentRef);
  if (!decoded) {
    log.warn({ paymentRef: ev.paymentRef, txHash: ev.txHash }, "deposit with unparseable paymentRef — skipping");
    return;
  }

  // Idempotency: same on-chain tx maps to one deposit row.
  const existing = await db.deposit.findFirst({ where: { txHash: ev.txHash } });
  if (existing) return;

  const link = await db.depositLink.findUnique({ where: { slug: decoded.linkSlug } });
  if (!link) {
    log.warn({ slug: decoded.linkSlug, txHash: ev.txHash }, "deposit references unknown link — skipping");
    return;
  }
  if (link.merchantAddress !== ev.merchant) {
    log.warn(
      { slug: decoded.linkSlug, expected: link.merchantAddress, actual: ev.merchant },
      "deposit merchant doesn't match link merchant — skipping",
    );
    return;
  }

  // Resolve symbol + decimals so we store the same shape the frontend expects.
  const symbol = symbolForToken(ev.token);
  if (!symbol) {
    log.warn({ token: ev.token, txHash: ev.txHash }, "deposit with unknown token — skipping");
    return;
  }
  const dec = await getDecimals(ev.token);
  const amount = formatTokenAmount(ev.grossAmount, dec);

  const created = await db.deposit.create({
    data: {
      id: ev.txHash.slice(2, 18), // 8 bytes from the txHash for a stable id
      linkSlug: decoded.linkSlug,
      merchantAddress: ev.merchant,
      chainId: SEPOLIA_CHAIN_ID,
      payer: ev.payer,
      reference: decoded.reference,
      token: symbol,
      amount,
      txHash: ev.txHash,
      paidAt: new Date(),
    },
  });
  log.info(
    { slug: decoded.linkSlug, payer: ev.payer, amount, symbol, txHash: ev.txHash },
    "deposit recorded",
  );

  // Fire `deposit.received` webhooks.
  try {
    await enqueueWebhooks("deposit.received", { deposit: serializeDeposit(created) }, ev.merchant);
  } catch (e) {
    log.error({ err: serializeErr(e), txHash: ev.txHash }, "failed to enqueue deposit.received webhook");
  }
}

// Serializers — match the wire shape the API routes return.

interface InvoiceRow {
  id: string;
  merchantAddress: string;
  creator: string;
  chainId: number;
  token: string;
  amount: string;
  description: string | null;
  items: string | null;
  taxRateBps: number | null;
  expiresAt: Date;
  status: string;
  txHash: string | null;
  payer: string | null;
  paidAt: Date | null;
  createdAt: Date;
}
function serializeInvoice(i: InvoiceRow) {
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
    expiresAt: i.expiresAt.toISOString(),
    status: i.status,
    txHash: i.txHash,
    payer: i.payer,
    paidAt: i.paidAt?.toISOString() ?? null,
    createdAt: i.createdAt.toISOString(),
  };
}

interface DepositRow {
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
}
function serializeDeposit(d: DepositRow) {
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

async function readCursor(): Promise<bigint> {
  const row = await db.indexerState.findUnique({ where: { chainId: SEPOLIA_CHAIN_ID } });
  return row?.lastBlock ?? -1n;
}

async function writeCursor(block: bigint) {
  await db.indexerState.upsert({
    where: { chainId: SEPOLIA_CHAIN_ID },
    create: { chainId: SEPOLIA_CHAIN_ID, lastBlock: block },
    update: { lastBlock: block },
  });
}

function sleep(ms: number) { return new Promise<void>((res) => setTimeout(res, ms)); }

function serializeErr(e: unknown): { message: string; stack?: string } {
  if (e instanceof Error) return { message: e.message, stack: e.stack };
  return { message: String(e) };
}
