import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buildSiweMessage, consumeNonce, issueNonce, issueSession, verifySession, verifySiweSignature } from "../lib/siwe.js";
import { config } from "../config.js";

const ADDRESS = z.string().regex(/^0x[a-fA-F0-9]{40}$/i);
const HEX_SIGNATURE = z.string().regex(/^0x[a-fA-F0-9]+$/);

const VerifyBody = z.object({
  address:  ADDRESS,
  signature: HEX_SIGNATURE,
  nonce:     z.string().min(8),
  issuedAt:  z.string(),
  chainId:   z.number().int().positive(),
  uri:       z.string().url(),
  domain:    z.string().min(1),
});

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  // GET /v1/auth/nonce
  // Returns a single-use nonce the frontend must bake into its SIWE message.
  app.get("/v1/auth/nonce", async () => {
    return { nonce: issueNonce() };
  });

  // POST /v1/auth/verify
  // Body: { address, signature, nonce, issuedAt, chainId, uri, domain }
  // Re-builds the canonical SIWE message from the same fields the frontend
  // signed, verifies the signature, mints a session token.
  app.post("/v1/auth/verify", async (req, reply) => {
    const parsed = VerifyBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid body", details: parsed.error.flatten() });
    const f = parsed.data;

    if (f.domain !== config.SIWE_DOMAIN) {
      return reply.code(400).send({ error: `domain must be ${config.SIWE_DOMAIN}` });
    }

    if (!consumeNonce(f.nonce)) {
      // Either never issued, already used, or expired.
      return reply.code(400).send({ error: "invalid or expired nonce" });
    }

    // Build the message with the address EXACTLY as the wallet presented
    // it. wagmi returns EIP-55-checksummed addresses; the frontend signs
    // with that case, so the bytes the backend reconstructs must match.
    // Lowercase the address only for the session subject + comparisons,
    // never for the canonical SIWE message.
    const presentedAddress = f.address as `0x${string}`;
    const message = buildSiweMessage({
      domain: f.domain,
      address: presentedAddress,
      uri: f.uri,
      chainId: f.chainId,
      nonce: f.nonce,
      issuedAt: f.issuedAt,
    });

    const ok = await verifySiweSignature(
      message,
      f.signature as `0x${string}`,
      presentedAddress,
    );
    if (!ok) {
      return reply.code(401).send({ error: "signature did not recover to address" });
    }

    const subject = presentedAddress.toLowerCase() as `0x${string}`;
    const token = issueSession(subject);
    return { token, address: subject, expiresIn: config.SESSION_TTL };
  });

  // GET /v1/auth/me — hydration helper. Tells the frontend whether its
  // stored token is still valid (and which address it's bound to).
  app.get("/v1/auth/me", async (req, reply) => {
    const token = extractBearer(req.headers.authorization);
    if (!token) return reply.code(401).send({ error: "no token" });
    const session = verifySession(token);
    if (!session) return reply.code(401).send({ error: "invalid or expired token" });
    return { address: session.sub, expiresAt: session.exp };
  });

  // POST /v1/auth/logout — purely a UX convenience; the JWT is stateless,
  // so the real "logout" is the frontend deleting its stored token. We
  // accept the call so the frontend can show a 200 confirmation.
  app.post("/v1/auth/logout", async () => {
    return { ok: true };
  });
}

function extractBearer(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}
