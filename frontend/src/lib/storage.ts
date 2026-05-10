import type { CreateInvoiceInput, Invoice } from "./types";
import { DEFAULT_CHAIN_ID } from "./chains";
import { isApiEnabled } from "./api";
import { createInvoice as apiCreateInvoice, getInvoice as apiGetInvoice, listInvoices as apiListInvoices } from "./api/invoices";

const KEY = "secudigate:invoices:v1";

function read(): Invoice[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Invoice[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((i) => ({
      ...i,
      chainId: i.chainId ?? DEFAULT_CHAIN_ID,
      creator: i.creator ?? i.merchant,
    }));
  } catch {
    return [];
  }
}

function write(invoices: Invoice[], opts: { silent?: boolean } = {}) {
  // Short-circuit no-op writes — localStorage.setItem fires a `storage`
  // event in every OTHER tab even when the value is byte-identical, and
  // every tab's useInvoices subscribes to that event and refetches,
  // which calls back into write() → cross-tab fetch storm. Comparing
  // serialized payloads keeps the loop closed.
  const next = JSON.stringify(invoices);
  const prev = localStorage.getItem(KEY);
  if (next === prev) return;
  localStorage.setItem(KEY, next);
  // Silent writes are used when mirroring an API read back into the local
  // cache. They skip the change event so subscribers don't refetch in a loop.
  if (!opts.silent) {
    window.dispatchEvent(new CustomEvent("secudigate:invoices-updated"));
  }
}

function broadcast() {
  window.dispatchEvent(new CustomEvent("secudigate:invoices-updated"));
}

function refreshExpiry(inv: Invoice): Invoice {
  if (inv.status === "pending" && Date.now() > inv.expiresAt) {
    return { ...inv, status: "expired" };
  }
  return inv;
}

// Filter by the kind discriminator. Treats undefined `kind` on a stored
// invoice as "invoice" (the default before freelance existed), so the
// Merchant page still sees its historical invoices.
function filterByKind(list: Invoice[], kind: "invoice" | "freelance" | undefined): Invoice[] {
  if (!kind) return list;
  return list.filter((i) => (i.kind ?? "invoice") === kind);
}

function upsertLocal(inv: Invoice, opts: { silent?: boolean } = {}) {
  const all = read();
  const idx = all.findIndex((i) => i.id.toLowerCase() === inv.id.toLowerCase());
  if (idx === -1) all.unshift(inv);
  else all[idx] = inv;
  write(all, opts);
}

// After a successful pay tx the frontend writes status="paid" optimistically.
// The chain indexer takes a tick or two to catch up, during which the API
// still reports the invoice as "pending". Without this merge a page reload
// would replace our optimistic mark with the stale remote view, making the
// invoice flash back to pending. Preserve local "paid" state until the
// indexer's "paid" arrives from the API.
function mergeOptimisticPaid(remote: Invoice[]): Invoice[] {
  const local = read();
  const localById = new Map(local.map((inv) => [inv.id.toLowerCase(), inv]));
  return remote.map((rem) => {
    const loc = localById.get(rem.id.toLowerCase());
    if (loc && loc.status === "paid" && loc.txHash && rem.status === "pending") {
      return {
        ...rem,
        status: loc.status,
        txHash: loc.txHash,
        payer: loc.payer,
        paidAt: loc.paidAt,
      };
    }
    return rem;
  });
}

function mergeOneOptimisticPaid(remote: Invoice): Invoice {
  return mergeOptimisticPaid([remote])[0];
}

export const invoiceStore = {
  // Async: lists invoices the connected wallet created. With backend, hits
  // `GET /v1/invoices?scope=created`. Without, returns localStorage records.
  //
  // The `kind` filter is applied AFTER caching so the local cache stays
  // complete across views — the Merchant page and the Freelancers page
  // both see consistent data, regardless of which one fetched last.
  async list(opts: { kind?: "invoice" | "freelance" } = {}): Promise<Invoice[]> {
    if (isApiEnabled()) {
      try {
        const remote = await apiListInvoices({ scope: "created" });
        const merged = mergeOptimisticPaid(remote);
        write(merged, { silent: true });
        return filterByKind(merged.map(refreshExpiry), opts.kind)
          .sort((a, b) => b.createdAt - a.createdAt);
      } catch {
        // fall through to local
      }
    }
    return filterByKind(read().map(refreshExpiry), opts.kind)
      .sort((a, b) => b.createdAt - a.createdAt);
  },

  // Synchronous local-only read. Used by hooks for placeholder data while
  // the async fetch completes.
  listCached(opts: { kind?: "invoice" | "freelance" } = {}): Invoice[] {
    return filterByKind(read().map(refreshExpiry), opts.kind)
      .sort((a, b) => b.createdAt - a.createdAt);
  },

  // Async fetch by id. Public endpoint — no auth needed.
  async get(id: string): Promise<Invoice | undefined> {
    if (isApiEnabled()) {
      try {
        const remote = await apiGetInvoice(id);
        if (remote) {
          const merged = mergeOneOptimisticPaid(remote);
          upsertLocal(merged, { silent: true });
          return refreshExpiry(merged);
        }
      } catch {
        // fall through
      }
    }
    const found = read().find((i) => i.id.toLowerCase() === id.toLowerCase());
    return found ? refreshExpiry(found) : undefined;
  },

  getCached(id: string): Invoice | undefined {
    const found = read().find((i) => i.id.toLowerCase() === id.toLowerCase());
    return found ? refreshExpiry(found) : undefined;
  },

  async create(input: CreateInvoiceInput): Promise<Invoice> {
    let invoice: Invoice;
    if (isApiEnabled()) {
      invoice = await apiCreateInvoice(input);
    } else {
      const now = Date.now();
      invoice = {
        id: randomHex(32),
        merchant: input.merchant,
        creator: input.creator,
        chainId: input.chainId,
        token: input.token,
        amount: input.amount,
        description: input.description?.trim() || undefined,
        items: input.items && input.items.length > 0 ? input.items : undefined,
        taxRate: input.taxRate && input.taxRate > 0 ? input.taxRate : undefined,
        createdAt: now,
        expiresAt: now + input.expiresInMinutes * 60_000,
        status: "pending",
      };
    }
    upsertLocal(invoice);
    return invoice;
  },

  // Local-only optimistic update applied right after a successful tx. The
  // chain indexer (next iteration) will be the canonical source for paid
  // status server-side; this just keeps the UI snappy.
  markPaid(id: string, txHash: `0x${string}`, payer: `0x${string}`) {
    const all = read();
    const idx = all.findIndex((i) => i.id.toLowerCase() === id.toLowerCase());
    if (idx === -1) return;
    all[idx] = { ...all[idx], status: "paid", txHash, payer, paidAt: Date.now() };
    write(all);
  },

  remove(id: string) {
    write(read().filter((i) => i.id.toLowerCase() !== id.toLowerCase()));
  },

  subscribe(cb: () => void): () => void {
    // In-tab events only. See the long comment in settings.ts subscribe()
    // for why we dropped the cross-tab `storage` listener: it forms a
    // tight feedback loop with sibling tabs running the same hooks.
    let timer: number | null = null;
    const fire = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => { timer = null; cb(); }, 80);
    };
    window.addEventListener("secudigate:invoices-updated", fire);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener("secudigate:invoices-updated", fire);
    };
  },

  // Internal — used by the seed module to nudge subscribers after bulk writes.
  broadcast,
};

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return "0x" + Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}
