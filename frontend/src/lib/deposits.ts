import type { StablecoinSymbol } from "./tokens";
import { DEFAULT_CHAIN_ID } from "./chains";
import { isApiEnabled } from "./api";
import {
  createDepositLink as apiCreateLink,
  deleteDepositLink as apiDeleteLink,
  getDepositLink as apiGetLink,
  listDepositLinks as apiListLinks,
  patchDepositLink as apiPatchLink,
} from "./api/deposit-links";
import { listDeposits as apiListDeposits } from "./api/deposits";

export interface DepositLink {
  slug: string;                    // unique, URL-friendly
  merchant: `0x${string}`;
  chainId: number;
  treasury: `0x${string}`;
  title: string;
  description?: string;
  requireReference: boolean;
  referenceLabel: string;          // shown to customer, e.g. "Account number"
  minAmount?: string;
  maxAmount?: string;
  active: boolean;
  createdAt: number;
}

export interface Deposit {
  id: string;
  linkSlug: string;
  merchant: `0x${string}`;
  chainId: number;
  payer: `0x${string}`;
  reference?: string;
  token: StablecoinSymbol;
  amount: string;
  txHash: `0x${string}`;
  paidAt: number;
}

export interface CreateDepositLinkInput {
  slug: string;
  merchant: `0x${string}`;
  chainId: number;
  treasury: `0x${string}`;
  title: string;
  description?: string;
  requireReference: boolean;
  referenceLabel: string;
  minAmount?: string;
  maxAmount?: string;
}

const LINKS_KEY = "secudigate:deposit-links:v1";
const DEPOSITS_KEY = "secudigate:deposits:v1";
const EVENT = "secudigate:deposits-updated";

function readLinks(): DepositLink[] {
  try {
    const raw = localStorage.getItem(LINKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DepositLink[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((l) => (l.chainId ? l : { ...l, chainId: DEFAULT_CHAIN_ID }));
  } catch {
    return [];
  }
}

function writeLinks(list: DepositLink[], opts: { silent?: boolean } = {}) {
  // Skip no-op writes — see comment in lib/storage.ts:write for the
  // cross-tab fetch-storm rationale. tl;dr: localStorage.setItem fires
  // a storage event in every other tab even when the value is identical.
  const next = JSON.stringify(list);
  if (next === localStorage.getItem(LINKS_KEY)) return;
  localStorage.setItem(LINKS_KEY, next);
  if (!opts.silent) window.dispatchEvent(new CustomEvent(EVENT));
}

function readDeposits(): Deposit[] {
  try {
    const raw = localStorage.getItem(DEPOSITS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Deposit[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((d) => (d.chainId ? d : { ...d, chainId: DEFAULT_CHAIN_ID }));
  } catch {
    return [];
  }
}

function writeDeposits(list: Deposit[], opts: { silent?: boolean } = {}) {
  // Skip no-op writes — see comment in lib/storage.ts:write.
  const next = JSON.stringify(list);
  if (next === localStorage.getItem(DEPOSITS_KEY)) return;
  localStorage.setItem(DEPOSITS_KEY, next);
  if (!opts.silent) window.dispatchEvent(new CustomEvent(EVENT));
}

function randomSlug(): string {
  const arr = new Uint8Array(4);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return "0x" + Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function suggestSlug(): string {
  return randomSlug();
}

function upsertLinkLocal(link: DepositLink, opts: { silent?: boolean } = {}) {
  const all = readLinks();
  const idx = all.findIndex((l) => l.slug.toLowerCase() === link.slug.toLowerCase());
  if (idx === -1) all.unshift(link);
  else all[idx] = link;
  writeLinks(all, opts);
}

function upsertDepositLocal(d: Deposit, opts: { silent?: boolean } = {}) {
  const all = readDeposits();
  const idx = all.findIndex((x) => x.id === d.id);
  if (idx === -1) all.unshift(d);
  else all[idx] = d;
  writeDeposits(all, opts);
}

export const depositLinkStore = {
  /// Async list. With backend, hits `GET /v1/deposit-links` (auth required —
  /// returns the connected merchant's links). Without, reads localStorage
  /// optionally filtered by merchant.
  async list(merchant?: string): Promise<DepositLink[]> {
    if (isApiEnabled()) {
      try {
        const remote = await apiListLinks();
        writeLinks(remote, { silent: true });
        const sorted = remote.sort((a, b) => b.createdAt - a.createdAt);
        if (!merchant) return sorted;
        const lower = merchant.toLowerCase();
        return sorted.filter((l) => l.merchant.toLowerCase() === lower);
      } catch {
        // fall through to local
      }
    }
    const all = readLinks().sort((a, b) => b.createdAt - a.createdAt);
    if (!merchant) return all;
    const lower = merchant.toLowerCase();
    return all.filter((l) => l.merchant.toLowerCase() === lower);
  },

  listCached(merchant?: string): DepositLink[] {
    const all = readLinks().sort((a, b) => b.createdAt - a.createdAt);
    if (!merchant) return all;
    const lower = merchant.toLowerCase();
    return all.filter((l) => l.merchant.toLowerCase() === lower);
  },

  async get(slug: string): Promise<DepositLink | undefined> {
    if (isApiEnabled()) {
      try {
        const remote = await apiGetLink(slug);
        if (remote) {
          upsertLinkLocal(remote, { silent: true });
          return remote;
        }
      } catch {
        // fall through
      }
    }
    return readLinks().find((l) => l.slug.toLowerCase() === slug.toLowerCase());
  },

  getCached(slug: string): DepositLink | undefined {
    return readLinks().find((l) => l.slug.toLowerCase() === slug.toLowerCase());
  },

  async create(input: CreateDepositLinkInput): Promise<DepositLink> {
    let link: DepositLink;
    if (isApiEnabled()) {
      link = await apiCreateLink(input);
    } else {
      const local = readLinks();
      if (local.some((l) => l.slug.toLowerCase() === input.slug.toLowerCase())) {
        throw new Error(`Slug "${input.slug}" is already taken.`);
      }
      link = {
        slug: input.slug,
        merchant: input.merchant,
        chainId: input.chainId,
        treasury: input.treasury,
        title: input.title,
        description: input.description?.trim() || undefined,
        requireReference: input.requireReference,
        referenceLabel: input.referenceLabel || "Reference",
        minAmount: input.minAmount?.trim() || undefined,
        maxAmount: input.maxAmount?.trim() || undefined,
        active: true,
        createdAt: Date.now(),
      };
    }
    upsertLinkLocal(link);
    return link;
  },

  async update(slug: string, patch: Partial<DepositLink>): Promise<void> {
    if (isApiEnabled()) {
      const apiPatch: Record<string, unknown> = {};
      if (patch.title !== undefined) apiPatch.title = patch.title;
      if (patch.description !== undefined) apiPatch.description = patch.description ?? null;
      if (patch.treasury !== undefined) apiPatch.treasury = patch.treasury;
      if (patch.requireReference !== undefined) apiPatch.requireReference = patch.requireReference;
      if (patch.referenceLabel !== undefined) apiPatch.referenceLabel = patch.referenceLabel;
      if (patch.minAmount !== undefined) apiPatch.minAmount = patch.minAmount ?? null;
      if (patch.maxAmount !== undefined) apiPatch.maxAmount = patch.maxAmount ?? null;
      if (patch.active !== undefined) apiPatch.active = patch.active;
      const updated = await apiPatchLink(slug, apiPatch);
      upsertLinkLocal(updated);
      return;
    }
    const all = readLinks();
    const idx = all.findIndex((l) => l.slug.toLowerCase() === slug.toLowerCase());
    if (idx === -1) return;
    all[idx] = { ...all[idx], ...patch };
    writeLinks(all);
  },

  async remove(slug: string): Promise<void> {
    if (isApiEnabled()) {
      await apiDeleteLink(slug);
    }
    writeLinks(readLinks().filter((l) => l.slug.toLowerCase() !== slug.toLowerCase()));
  },

  subscribe(cb: () => void): () => void {
    // In-tab events only. See settings.ts subscribe() comment.
    let timer: number | null = null;
    const fire = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => { timer = null; cb(); }, 80);
    };
    window.addEventListener(EVENT, fire);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener(EVENT, fire);
    };
  },
};

export const depositStore = {
  async list(filter?: { merchant?: string; linkSlug?: string }): Promise<Deposit[]> {
    if (isApiEnabled()) {
      try {
        const remote = await apiListDeposits({ linkSlug: filter?.linkSlug });
        writeDeposits(remote, { silent: true });
        const sorted = remote.sort((a, b) => b.paidAt - a.paidAt);
        if (!filter?.merchant) return sorted;
        const lower = filter.merchant.toLowerCase();
        return sorted.filter((d) => d.merchant.toLowerCase() === lower);
      } catch {
        // fall through
      }
    }
    const all = readDeposits().sort((a, b) => b.paidAt - a.paidAt);
    if (!filter) return all;
    return all.filter((d) => {
      if (filter.merchant && d.merchant.toLowerCase() !== filter.merchant.toLowerCase()) return false;
      if (filter.linkSlug && d.linkSlug.toLowerCase() !== filter.linkSlug.toLowerCase()) return false;
      return true;
    });
  },

  listCached(filter?: { merchant?: string; linkSlug?: string }): Deposit[] {
    const all = readDeposits().sort((a, b) => b.paidAt - a.paidAt);
    if (!filter) return all;
    return all.filter((d) => {
      if (filter.merchant && d.merchant.toLowerCase() !== filter.merchant.toLowerCase()) return false;
      if (filter.linkSlug && d.linkSlug.toLowerCase() !== filter.linkSlug.toLowerCase()) return false;
      return true;
    });
  },

  /// Local-only optimistic record applied right after a successful tx. The
  /// chain indexer (next iteration) will be the canonical source server-side;
  /// this just keeps the customer's "Deposit confirmed" UI snappy.
  record(input: Omit<Deposit, "id" | "paidAt"> & { paidAt?: number }): Deposit {
    const deposit: Deposit = {
      ...input,
      id: randomHex(8),
      paidAt: input.paidAt ?? Date.now(),
    };
    upsertDepositLocal(deposit);
    return deposit;
  },

  subscribe(cb: () => void): () => void {
    // In-tab events only. See settings.ts subscribe() comment.
    let timer: number | null = null;
    const fire = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => { timer = null; cb(); }, 80);
    };
    window.addEventListener(EVENT, fire);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener(EVENT, fire);
    };
  },
};
