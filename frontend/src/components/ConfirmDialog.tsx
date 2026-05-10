import { useEffect, useState } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /// If set, the confirm button stays disabled until the user types this
  /// exact string. Use for hard-to-reverse actions like renounceOwnership.
  typedConfirmation?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  typedConfirmation,
  busy = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (open) setTyped("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onCancel(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const typedOk = !typedConfirmation || typed.trim() === typedConfirmation;
  const confirmDisabled = busy || !typedOk;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`card w-full max-w-md p-6 ${destructive ? "border-bad/40" : "border-line/80"}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className={`text-lg font-semibold ${destructive ? "text-bad" : "text-ink"}`}>{title}</h2>
        <div className="mt-2 text-sm text-ink-dim leading-relaxed">{message}</div>

        {typedConfirmation && (
          <div className="mt-4">
            <label className="label">
              Type <span className="font-mono text-ink">{typedConfirmation}</span> to confirm
            </label>
            <input
              spellCheck={false}
              autoFocus
              className="input font-mono text-sm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={destructive ? "btn-bad" : "btn-primary"}
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
