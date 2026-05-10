// Minimal CSV builder + browser download trigger. No deps.

export function toCsv(rows: Record<string, string | number | undefined | null>[]): string {
  if (rows.length === 0) return "";
  const headers = Array.from(
    rows.reduce<Set<string>>((set, row) => {
      Object.keys(row).forEach((k) => set.add(k));
      return set;
    }, new Set()),
  );
  const escape = (v: string | number | undefined | null) => {
    if (v === undefined || v === null) return "";
    const s = String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const body = rows.map((row) => headers.map((h) => escape(row[h])).join(",")).join("\n");
  return [headers.join(","), body].join("\n");
}

export function downloadCsv(filename: string, rows: Record<string, string | number | undefined | null>[]): number {
  const csv = toCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return rows.length;
}
