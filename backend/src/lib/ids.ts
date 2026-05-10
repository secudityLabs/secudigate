import { randomBytes } from "node:crypto";

// 32-byte hex (bytes32 shape) — matches the contract's invoiceId input.
export function newInvoiceId(): `0x${string}` {
  return ("0x" + randomBytes(32).toString("hex")) as `0x${string}`;
}

export function newDepositId(): string {
  return randomBytes(8).toString("hex");
}

export function newSecret(): string {
  return randomBytes(24).toString("hex");
}

export function suggestSlug(): string {
  return randomBytes(4).toString("hex");
}
