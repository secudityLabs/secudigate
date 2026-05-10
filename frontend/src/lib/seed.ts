import type { Invoice, InvoiceStatus } from "./types";
import type { DepositLink, Deposit } from "./deposits";
import type { StablecoinSymbol } from "./tokens";
import { SEPOLIA_ID } from "./chains";

// Demo seeder — writes directly to localStorage and fires the same custom
// events the stores use, so all hooks rebuild without a page reload.

const INVOICES_KEY = "secudigate:invoices:v1";
const LINKS_KEY = "secudigate:deposit-links:v1";
const DEPOSITS_KEY = "secudigate:deposits:v1";

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function rndInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function randomHex(bytes: number): `0x${string}` {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return ("0x" + Array.from(a).map((b) => b.toString(16).padStart(2, "0")).join("")) as `0x${string}`;
}

function readJson<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch { return []; }
}

function writeJson<T>(key: string, list: T[]) { localStorage.setItem(key, JSON.stringify(list)); }

function broadcast() {
  window.dispatchEvent(new CustomEvent("secudigate:invoices-updated"));
  window.dispatchEvent(new CustomEvent("secudigate:deposits-updated"));
}

const TOKENS: StablecoinSymbol[] = ["USDC", "USDT", "DAI"];

const INVOICE_DESCRIPTIONS = [
  "Pro plan — monthly",
  "Starter plan — monthly",
  "Order #4291",
  "Order #4292",
  "Webinar admission",
  "Custom design — 2hr",
  "Annual subscription",
  "Setup fee",
  "Course bundle",
  "Hardware kit shipping",
];

export interface SeedResult {
  invoices: number;
  links: number;
  deposits: number;
}

export function seedSampleData(merchant: `0x${string}`): SeedResult {
  const now = Date.now();

  // --- invoices ---
  const newInvoices: Invoice[] = [];
  for (let i = 0; i < 12; i++) {
    const createdAt = now - rndInt(0, 14) * 86400_000 - rndInt(0, 24) * 3600_000;
    const expiresAt = createdAt + 24 * 3600_000;
    const status: InvoiceStatus = pick<InvoiceStatus>(["paid", "paid", "paid", "paid", "pending", "expired"]);
    const inv: Invoice = {
      id: randomHex(32),
      merchant,
      creator: merchant,
      chainId: SEPOLIA_ID,
      token: pick(TOKENS),
      amount: (Math.random() * 200 + 10).toFixed(2),
      description: pick(INVOICE_DESCRIPTIONS),
      createdAt,
      expiresAt: status === "expired" ? createdAt + 3600_000 : expiresAt,
      status,
    };
    if (status === "paid") {
      inv.txHash = randomHex(32);
      inv.payer = randomHex(20);
      inv.paidAt = createdAt + rndInt(60_000, 6 * 3600_000);
    }
    newInvoices.push(inv);
  }

  // --- deposit links ---
  const linkTemplates: Omit<DepositLink, "createdAt" | "merchant">[] = [
    {
      slug: "secudity-broker",
      chainId: SEPOLIA_ID,
      treasury: merchant,
      title: "Secudity Broker — Fund your account",
      description: "Funds reflect within 1 confirmation.",
      requireReference: true,
      referenceLabel: "Account number",
      minAmount: "10",
      maxAmount: undefined,
      active: true,
    },
    {
      slug: "vip-topup",
      chainId: SEPOLIA_ID,
      treasury: merchant,
      title: "VIP wallet top-up",
      description: undefined,
      requireReference: false,
      referenceLabel: "Reference",
      minAmount: undefined,
      maxAmount: undefined,
      active: true,
    },
    {
      slug: "trading-account",
      chainId: SEPOLIA_ID,
      treasury: merchant,
      title: "Open a trading account",
      description: "Tag your deposit with the user ID from your dashboard.",
      requireReference: true,
      referenceLabel: "User ID",
      minAmount: "50",
      maxAmount: "10000",
      active: false,
    },
  ];

  const existingLinks = readJson<DepositLink>(LINKS_KEY);
  const existingSlugs = new Set(existingLinks.map((l) => l.slug.toLowerCase()));
  const newLinks: DepositLink[] = linkTemplates
    .filter((t) => !existingSlugs.has(t.slug.toLowerCase()))
    .map((t, i) => ({ ...t, merchant, createdAt: now - (12 - i * 4) * 86400_000 }));

  // --- deposits ---
  const activeLinks = [...existingLinks, ...newLinks].filter((l) => l.active && l.merchant.toLowerCase() === merchant.toLowerCase());
  const newDeposits: Deposit[] = [];
  for (let i = 0; i < 18 && activeLinks.length > 0; i++) {
    const link = pick(activeLinks);
    newDeposits.push({
      id: randomHex(8),
      linkSlug: link.slug,
      merchant,
      chainId: SEPOLIA_ID,
      payer: randomHex(20),
      reference: link.requireReference ? `ACC-${rndInt(10000, 99999)}` : undefined,
      token: pick(TOKENS),
      amount: (Math.random() * 800 + 50).toFixed(2),
      txHash: randomHex(32),
      paidAt: now - rndInt(0, 14) * 86400_000 - rndInt(0, 24) * 3600_000,
    });
  }

  // --- write back ---
  writeJson(INVOICES_KEY, [...newInvoices, ...readJson<Invoice>(INVOICES_KEY)]);
  if (newLinks.length) writeJson(LINKS_KEY, [...newLinks, ...existingLinks]);
  writeJson(DEPOSITS_KEY, [...newDeposits, ...readJson<Deposit>(DEPOSITS_KEY)]);

  broadcast();
  return { invoices: newInvoices.length, links: newLinks.length, deposits: newDeposits.length };
}

export function clearMerchantData(merchant: `0x${string}`): SeedResult {
  const lower = merchant.toLowerCase();

  const invoices = readJson<Invoice>(INVOICES_KEY);
  const keptInvoices = invoices.filter((i) =>
    i.merchant.toLowerCase() !== lower &&
    (i.creator?.toLowerCase() ?? i.merchant.toLowerCase()) !== lower,
  );
  writeJson(INVOICES_KEY, keptInvoices);

  const links = readJson<DepositLink>(LINKS_KEY);
  const keptLinks = links.filter((l) => l.merchant.toLowerCase() !== lower);
  writeJson(LINKS_KEY, keptLinks);

  const deposits = readJson<Deposit>(DEPOSITS_KEY);
  const keptDeposits = deposits.filter((d) => d.merchant.toLowerCase() !== lower);
  writeJson(DEPOSITS_KEY, keptDeposits);

  broadcast();
  return {
    invoices: invoices.length - keptInvoices.length,
    links: links.length - keptLinks.length,
    deposits: deposits.length - keptDeposits.length,
  };
}
