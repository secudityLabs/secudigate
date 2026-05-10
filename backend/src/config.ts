import { z } from "zod";

const ADDR = z.string().regex(/^0x[a-fA-F0-9]{40}$/i);

const ConfigSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  DATABASE_URL: z.string(),
  SEPOLIA_RPC_URL: z.string().url().default("https://sepolia.gateway.tenderly.co"),
  SEPOLIA_PAYMENT_GATEWAY_ADDRESS: ADDR.optional(),
  SEPOLIA_INDEXER_START_BLOCK: z.coerce.number().int().nonnegative().optional(),
  SEPOLIA_USDC_ADDRESS: ADDR.optional(),
  SEPOLIA_USDT_ADDRESS: ADDR.optional(),
  SEPOLIA_DAI_ADDRESS:  ADDR.optional(),
  INDEXER_POLL_MS: z.coerce.number().int().positive().default(6000),
  TRUSTED_HEADER_AUTH: z
    .union([z.literal("true"), z.literal("false")])
    .default("true")
    .transform((v) => v === "true"),
  // Secret used to HMAC-sign session JWTs. MUST be set to a long random
  // value in production. The default below is for local dev only and will
  // print a loud warning if used.
  SESSION_SECRET: z.string().min(16).default("dev-only-secret-replace-me-in-production"),
  // Session lifetime in seconds (default: 7 days).
  SESSION_TTL: z.coerce.number().int().positive().default(60 * 60 * 24 * 7),
  // EIP-4361 domain bound into the signed SIWE message. The wallet shows
  // this; mismatch with the front-end origin breaks the verify step. Set
  // to the bare hostname the front-end is served from.
  SIWE_DOMAIN: z.string().default("localhost:5173"),
});

export type Config = z.infer<typeof ConfigSchema>;

export const config: Config = ConfigSchema.parse(process.env);

if (config.SESSION_SECRET === "dev-only-secret-replace-me-in-production") {
  // eslint-disable-next-line no-console
  console.warn(
    "[config] SESSION_SECRET is the default dev value — set a long random value in .env before exposing this server to anyone.",
  );
}

export const corsOrigins: string[] = config.CORS_ORIGIN.split(",")
  .map((s) => s.trim())
  .filter(Boolean);
