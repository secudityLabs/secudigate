// Load .env into process.env BEFORE any module that reads it. Prisma loads
// .env on its own; the Fastify runtime needs this dotenv import so DATABASE_URL
// and friends are available when config.ts parses them.
import "dotenv/config";

import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";

import { config, corsOrigins } from "./config.js";
import { registerErrorHandler } from "./plugins/error-handler.js";
import healthRoutes from "./routes/health.js";
import authRoutes from "./routes/auth.js";
import invoiceRoutes from "./routes/invoices.js";
import depositLinkRoutes from "./routes/deposit-links.js";
import depositRoutes from "./routes/deposits.js";
import merchantRoutes from "./routes/merchants.js";
import webhookRoutes from "./routes/webhooks.js";
import { startIndexer } from "./indexer.js";
import { startWebhookDispatcher } from "./webhooks/dispatcher.js";

async function start() {
  const app = Fastify({
    logger: { level: config.LOG_LEVEL },
    disableRequestLogging: false,
  });

  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow no-origin (curl, server-to-server) and listed origins.
      if (!origin) return cb(null, true);
      if (corsOrigins.includes(origin) || corsOrigins.includes("*")) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`), false);
    },
    credentials: false,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["content-type", "authorization", "x-merchant-address"],
  });
  await app.register(sensible);

  registerErrorHandler(app);

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(merchantRoutes);
  await app.register(invoiceRoutes);
  await app.register(depositLinkRoutes);
  await app.register(depositRoutes);
  await app.register(webhookRoutes);

  const close = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT",  () => void close("SIGINT"));
  process.on("SIGTERM", () => void close("SIGTERM"));

  // Belt-and-suspenders: surface any unhandled async error rather than letting
  // it crash the process silently. A misbehaving plugin or RPC client
  // shouldn't take the HTTP server down.
  process.on("unhandledRejection", (reason) => {
    app.log.error({ err: reason }, "unhandled promise rejection");
  });

  try {
    await app.listen({ port: config.PORT, host: config.HOST });
    // Start the chain indexer alongside the HTTP server. It's a no-op if
    // SEPOLIA_PAYMENT_GATEWAY_ADDRESS isn't set, and any error inside it is
    // caught + logged rather than propagated.
    startIndexer(app.log).catch((err) => app.log.error({ err }, "indexer startup failed"));
    // The dispatcher runs independently of the indexer so test deliveries
    // (manual inserts into WebhookDelivery) get drained even when the chain
    // RPC is unreachable.
    startWebhookDispatcher(app.log);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
