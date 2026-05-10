import { useState } from "react";

export type EmbedKind = "invoice" | "deposit";

export function buildEmbedSnippet(kind: EmbedKind, value: string, origin: string = window.location.origin): string {
  const attr = kind === "invoice" ? "data-secudigate-invoice" : "data-secudigate-deposit";
  const label = kind === "invoice" ? "Pay with Secudigate" : "Deposit with Secudigate";
  return `<script async src="${origin}/embed.js"></script>\n<button ${attr}="${value}">${label}</button>`;
}

export default function EmbedButton({
  kind,
  value,
  label = "Copy embed",
}: {
  kind: EmbedKind;
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(buildEmbedSnippet(kind, value));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be blocked in some contexts; silently no-op.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="text-xs text-ink-dim hover:text-ink transition-colors inline-flex items-center gap-1.5"
      title="Copy embed snippet for any website"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
      {copied ? "Embed copied" : label}
    </button>
  );
}
