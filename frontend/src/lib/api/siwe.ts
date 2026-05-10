// SIWE sign-in API client. The three endpoints are:
//
//   GET  /v1/auth/nonce  → { nonce }
//   POST /v1/auth/verify → { token, address, expiresIn }
//   GET  /v1/auth/me     → { address, expiresAt } | 401
//
// The message we sign is the canonical EIP-4361 shape rebuilt server-side
// from the same fields; the backend signs nothing back — it only verifies
// our signature and mints a JWT.

import { apiFetch } from "../api";

export interface NonceResponse { nonce: string }

export interface VerifyResponse {
  token: string;
  address: `0x${string}`;
  expiresIn: number; // seconds
}

export interface MeResponse {
  address: `0x${string}`;
  expiresAt: number; // unix seconds
}

export async function fetchNonce(): Promise<NonceResponse> {
  return apiFetch<NonceResponse>("/v1/auth/nonce");
}

export async function verifySignature(input: {
  address: `0x${string}`;
  signature: `0x${string}`;
  nonce: string;
  issuedAt: string;
  chainId: number;
  uri: string;
  domain: string;
}): Promise<VerifyResponse> {
  return apiFetch<VerifyResponse>("/v1/auth/verify", { method: "POST", body: input });
}

export async function fetchMe(): Promise<MeResponse> {
  return apiFetch<MeResponse>("/v1/auth/me", { auth: true });
}

// Builds the message we hand to the wallet. MUST match the server's
// `buildSiweMessage` byte-for-byte or the signature will not verify.
export function buildClientSiweMessage(fields: {
  domain: string;
  address: `0x${string}`;
  uri: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
}): string {
  const STATEMENT = "Sign in to Secudigate. This signature is free and does not authorize any transaction.";
  return [
    `${fields.domain} wants you to sign in with your Ethereum account:`,
    fields.address,
    "",
    STATEMENT,
    "",
    `URI: ${fields.uri}`,
    `Version: 1`,
    `Chain ID: ${fields.chainId}`,
    `Nonce: ${fields.nonce}`,
    `Issued At: ${fields.issuedAt}`,
  ].join("\n");
}
