// Frontend mirror of backend/src/lib/payment-ref.ts. Keep them in sync.
//
// The contract's `deposit(...)` function only accepts a single string for the
// off-chain payment reference. To carry both the deposit-link slug AND the
// customer-supplied reference (account number, etc.), we encode them as
// `slug` (no user reference) or `slug:reference` (with one). The backend
// indexer parses this on the way in.

export function encodePaymentRef(slug: string, userReference?: string): string {
  const ref = userReference?.trim();
  return ref ? `${slug}:${ref}` : slug;
}
