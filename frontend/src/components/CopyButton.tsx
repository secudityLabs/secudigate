import { useState } from "react";

export default function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard may be unavailable in some browser contexts; silently no-op.
    }
  }

  return (
    <button type="button" onClick={handleCopy} className="text-xs text-ink-dim hover:text-ink transition-colors">
      {copied ? "Copied" : label}
    </button>
  );
}
