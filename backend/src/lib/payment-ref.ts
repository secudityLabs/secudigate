// Convention for the on-chain `paymentRef` string in DepositReceived events.
//
// The contract has no concept of a "deposit link" — that's purely off-chain.
// To bridge the gap, the frontend encodes the link slug into paymentRef using
// the format `slug` (no user reference) or `slug:reference` (with one). The
// indexer parses this on ingest. Direct callers of `deposit()` who don't
// follow the convention will produce events the indexer logs as orphans.

export function encodePaymentRef(slug: string, userReference?: string): string {
  const ref = userReference?.trim();
  return ref ? `${slug}:${ref}` : slug;
}

export interface DecodedPaymentRef {
  linkSlug: string;
  reference: string | null;
}

export function decodePaymentRef(raw: string): DecodedPaymentRef | null {
  if (!raw) return null;
  const colon = raw.indexOf(":");
  if (colon === -1) {
    if (!isValidSlug(raw)) return null;
    return { linkSlug: raw, reference: null };
  }
  const slug = raw.slice(0, colon);
  if (!isValidSlug(slug)) return null;
  const reference = raw.slice(colon + 1).trim();
  return { linkSlug: slug, reference: reference || null };
}

function isValidSlug(s: string): boolean {
  return /^[a-zA-Z0-9_-]{3,32}$/.test(s);
}
