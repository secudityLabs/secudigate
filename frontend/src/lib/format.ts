export function shortAddress(addr?: string, head = 6, tail = 4): string {
  if (!addr) return "";
  if (addr.length <= head + tail + 2) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

export function formatAmount(amount: string, symbol: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `${amount} ${symbol}`;
  return `${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ${symbol}`;
}

export function formatRelativeTime(ms: number): string {
  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  const future = diff > 0;
  const minutes = Math.round(abs / 60_000);
  if (minutes < 1) return future ? "in <1 min" : "just now";
  if (minutes < 60) return future ? `in ${minutes} min` : `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return future ? `in ${hours}h` : `${hours}h ago`;
  const days = Math.round(hours / 24);
  return future ? `in ${days}d` : `${days}d ago`;
}

export function isValidAddress(s: string): s is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(s);
}

export function isValidAmount(s: string): boolean {
  if (!s) return false;
  if (!/^\d+(\.\d{1,18})?$/.test(s)) return false;
  return Number(s) > 0;
}
