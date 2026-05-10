import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { verifySession } from "./siwe.js";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

declare module "fastify" {
  interface FastifyRequest {
    merchantAddress?: `0x${string}`;
  }
}

// Authenticates the caller as a specific merchant address.
//
// Resolution order:
//   1. `Authorization: Bearer <siwe-jwt>` — preferred, EIP-4361 verified.
//   2. `x-merchant-address: 0x…` — legacy demo-only header, accepted only
//      while `TRUSTED_HEADER_AUTH=true`. Logs a warning so it's obvious
//      this isn't real auth. Flip the env var to `false` before exposing
//      the API to anyone but you.
export function requireMerchantAuth(request: FastifyRequest, reply: FastifyReply): boolean {
  // Path 1: SIWE bearer token.
  const bearer = extractBearer(request.headers.authorization);
  if (bearer) {
    const session = verifySession(bearer);
    if (!session) {
      reply.code(401).send({ error: "invalid or expired session token" });
      return false;
    }
    request.merchantAddress = session.sub;
    return true;
  }

  // Path 2: legacy trusted-header (demo only).
  if (config.TRUSTED_HEADER_AUTH) {
    const raw = request.headers["x-merchant-address"];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value && ADDRESS_RE.test(value)) {
      request.log.warn({ address: value }, "authenticated via legacy x-merchant-address header");
      request.merchantAddress = value.toLowerCase() as `0x${string}`;
      return true;
    }
  }

  reply.code(401).send({ error: "authentication required (Sign in with Ethereum)" });
  return false;
}

function extractBearer(authHeader: string | string[] | undefined): string | null {
  if (!authHeader) return null;
  const value = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const [scheme, token] = value.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}
