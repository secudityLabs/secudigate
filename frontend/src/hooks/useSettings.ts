import { useEffect, useState } from "react";
import { defaultSettings, settingsStore, type MerchantSettings } from "../lib/settings";

// Returns the merchant's settings, with `defaultSettings(merchant)` as a
// placeholder while the async fetch is in flight (so callers can read
// `.brandColor` etc. without a null guard on first render).
export function useSettings(merchant: `0x${string}` | undefined): MerchantSettings | undefined {
  const [settings, setSettings] = useState<MerchantSettings | undefined>(() =>
    merchant ? settingsStore.getCached(merchant) ?? defaultSettings(merchant) : undefined,
  );

  useEffect(() => {
    if (!merchant) {
      setSettings(undefined);
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      const next = await settingsStore.getOrDefault(merchant);
      if (!cancelled) setSettings(next);
    };
    refresh();
    const unsub = settingsStore.subscribe(refresh);
    return () => { cancelled = true; unsub(); };
  }, [merchant]);

  return settings;
}

// Same shape but for any address (used on customer-facing pages where the
// connected wallet is the payer, not the merchant). Falls back to a defaults
// shell so the pay/deposit pages can render branding tiles safely.
export function useSettingsByAddress(merchant: string | undefined): MerchantSettings | undefined {
  const [settings, setSettings] = useState<MerchantSettings | undefined>(() =>
    merchant ? settingsStore.getCached(merchant) : undefined,
  );

  useEffect(() => {
    if (!merchant) {
      setSettings(undefined);
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      const next = await settingsStore.get(merchant);
      if (!cancelled) setSettings(next);
    };
    refresh();
    const unsub = settingsStore.subscribe(refresh);
    return () => { cancelled = true; unsub(); };
  }, [merchant]);

  if (!settings && merchant && /^0x[a-fA-F0-9]{40}$/.test(merchant)) {
    return defaultSettings(merchant as `0x${string}`);
  }
  return settings;
}
