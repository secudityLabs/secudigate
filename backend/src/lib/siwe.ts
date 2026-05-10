// EIP-4361 (Sign-In with Ethereum) helper.
//
// The full `siwe` npm package handles ABNF parsing + ENS resolution +
// statement validation — we don't need any of that for our flow. The
// frontend builds the message from a deterministic template; the backend
// re-builds the same template from the {nonce, address, issuedAt, …} it
// stored, and re-verifies the signature with viem. Because we never trust
// the wallet-side message verbatim, ABNF tolerance isn't a security
// property here — message-equality is.
//
// JWT sessions are a minimal HMAC-SHA256-signed token; we don't pull a
// JWT lib for the same reason (avoiding npm-install). Same crypto, fewer
// dependencies.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { verifyMessage, type Hex } from "viem";
import { config } from "../config.js";

const SIWE_VERSION = "1";
const STATEMENT = "Sign in to Secudigate. This signature is free and does not authorize any transaction.";

export interface SiweFields {
  domain: string;
  address: `0x${string}`;
  uri: string;
  chainId: number;
  nonce: string;
  issuedAt: string; // ISO-8601, e.g. 2026-05-11T12:34:56.000Z
}

// Builds the canonical EIP-4361 message. The wallet displays this exact
// text to the user when they sign in.
export function buildSiweMessage(f: SiweFields): string {
  return [
    `${f.domain} wants you to sign in with your Ethereum account:`,
    f.address,
    "",
    STATEMENT,
    "",
    `URI: ${f.uri}`,
    `Version: ${SIWE_VERSION}`,
    `Chain ID: ${f.chainId}`,
    `Nonce: ${f.nonce}`,
    `Issued At: ${f.issuedAt}`,
  ].join("\n");
}

// Verifies that `signature` was produced by signing `message` with the
// private key of `address`. Handles both EOA (ECDSA) and EIP-1271
// contract signatures via viem.
export async function verifySiweSignature(
  message: string,
  signature: Hex,
  address: `0x${string}`,
): Promise<boolean> {
  try {
    return await verifyMessage({ message, signature, address });
  } catch {
    return false;
  }
}

// In-memory nonce store, single-use, 10-minute TTL.
const NONCE_TTL_MS = 10 * 60 * 1000;

const nonces = new Map<string, { issuedAt: number }>();

export function issueNonce(): string {
  // 16 bytes = 128 bits of entropy, hex-encoded → 32 chars.
  const nonce = randomBytes(16).toString("hex");
  nonces.set(nonce, { issuedAt: Date.now() });
  cleanupExpired();
  return nonce;
}

export function consumeNonce(nonce: string): boolean {
  cleanupExpired();
  const entry = nonces.get(nonce);
  if (!entry) return false;
  if (Date.now() - entry.issuedAt > NONCE_TTL_MS) {
    nonces.delete(nonce);
    return false;
  }
  nonces.delete(nonce); // single-use
  return true;
}

function cleanupExpired(): void {
  const now = Date.now();
  for (const [n, e] of nonces) {
    if (now - e.issuedAt > NONCE_TTL_MS) nonces.delete(n);
  }
}

// JWT-ish session tokens — HS256 over a JSON payload.

interface SessionPayload {
  sub: `0x${string}`; // lowercased merchant address
  iat: number;
  exp: number;
}

// Lifetime is `SESSION_TTL` seconds.
export function issueSession(address: `0x${string}`): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: address.toLowerCase() as `0x${string}`,
    iat: now,
    exp: now + config.SESSION_TTL,
  };
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body   = b64url(JSON.stringify(payload));
  const sig    = sign(`${header}.${body}`);
  return `${header}.${body}.${sig}`;
}

// Returns the payload if signature + expiry check out, else null.
export function verifySession(token: string): SessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = sign(`${header}.${body}`);
  // Constant-time compare so a timing oracle can't extract the secret.
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
  } catch {
    return null;
  }
  if (typeof payload.sub !== "string" || !/^0x[a-f0-9]{40}$/.test(payload.sub)) return null;
  if (typeof payload.exp !== "number" || payload.exp <= Math.floor(Date.now() / 1000)) return null;
  return payload;
}

function sign(input: string): string {
  return b64url(createHmac("sha256", config.SESSION_SECRET).update(input).digest());
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}
