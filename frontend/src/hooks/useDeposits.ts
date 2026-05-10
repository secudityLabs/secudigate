import { useEffect, useState } from "react";
import { depositLinkStore, depositStore, type Deposit, type DepositLink } from "../lib/deposits";

export function useDepositLinks(merchant: string | undefined): DepositLink[] {
  const [list, setList] = useState<DepositLink[]>(() =>
    merchant ? depositLinkStore.listCached(merchant) : [],
  );

  useEffect(() => {
    if (!merchant) { setList([]); return; }
    let cancelled = false;
    const refresh = async () => {
      const next = await depositLinkStore.list(merchant);
      if (!cancelled) setList(next);
    };
    refresh();
    const unsub = depositLinkStore.subscribe(refresh);
    return () => { cancelled = true; unsub(); };
  }, [merchant]);

  return list;
}

export function useDepositLink(slug: string | undefined): DepositLink | undefined {
  const [link, setLink] = useState<DepositLink | undefined>(() =>
    slug ? depositLinkStore.getCached(slug) : undefined,
  );

  useEffect(() => {
    if (!slug) { setLink(undefined); return; }
    let cancelled = false;
    const refresh = async () => {
      const next = await depositLinkStore.get(slug);
      if (!cancelled) setLink(next);
    };
    refresh();
    const unsub = depositLinkStore.subscribe(refresh);
    return () => { cancelled = true; unsub(); };
  }, [slug]);

  return link;
}

export function useDeposits(filter: { merchant?: string; linkSlug?: string }): Deposit[] {
  const [list, setList] = useState<Deposit[]>(() => depositStore.listCached(filter));
  const key = `${filter.merchant ?? ""}:${filter.linkSlug ?? ""}`;

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const next = await depositStore.list(filter);
      if (!cancelled) setList(next);
    };
    refresh();
    const unsub = depositStore.subscribe(refresh);
    // Periodic poll: backend may have inserted a new deposit via the indexer.
    const tick = window.setInterval(refresh, 15_000);
    return () => {
      cancelled = true;
      unsub();
      window.clearInterval(tick);
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return list;
}
