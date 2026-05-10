import { createHmac, timingSafeEqual } from "node:crypto";

// HMAC-SHA256 over the raw JSON body, prefixed with `sha256=` — same shape
// as GitHub / Stripe webhook signatures. Merchants verify by computing the
// same HMAC over the body they received.
export function signBody(secret: string, body: string): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

export function verifyBody(secret: string, body: string, signature: string): boolean {
  const expected = signBody(secret, body);
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
