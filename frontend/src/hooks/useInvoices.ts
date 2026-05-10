import { useEffect, useState } from "react";
import { invoiceStore } from "../lib/storage";
import type { Invoice } from "../lib/types";

// Returns the connected wallet's invoices. Initial paint shows whatever's
// cached locally so the merchant dashboard isn't blank on every reload;
// the async fetch then replaces it with the authoritative list.
//
// Pass `kind: "invoice"` for the Merchant dashboard view (excludes
// freelance) or `kind: "freelance"` for the Freelancers page. Omit to
// get every invoice the caller created.
export function useInvoices(opts: { kind?: "invoice" | "freelance" } = {}): Invoice[] {
  const { kind } = opts;
  const [invoices, setInvoices] = useState<Invoice[]>(() => invoiceStore.listCached({ kind }));

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const list = await invoiceStore.list({ kind });
      if (!cancelled) setInvoices(list);
    };
    refresh();
    const unsub = invoiceStore.subscribe(refresh);
    const tick = window.setInterval(refresh, 15_000);
    return () => {
      cancelled = true;
      unsub();
      window.clearInterval(tick);
    };
  }, [kind]);

  return invoices;
}

export function useInvoice(id: string | undefined): Invoice | undefined {
  const [invoice, setInvoice] = useState<Invoice | undefined>(() => (id ? invoiceStore.getCached(id) : undefined));

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const refresh = async () => {
      const next = await invoiceStore.get(id);
      if (!cancelled) setInvoice(next);
    };
    refresh();
    const unsub = invoiceStore.subscribe(refresh);
    const tick = window.setInterval(refresh, 5_000);
    return () => {
      cancelled = true;
      unsub();
      window.clearInterval(tick);
    };
  }, [id]);

  return invoice;
}
