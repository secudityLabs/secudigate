// Imperative confirm/alert dialogs — replaces native `confirm()`/`alert()`
// with promise-returning hooks that match the rest of the UI's styling.

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  /** Defaults to "Confirm". */
  confirmLabel?: string;
  /** Defaults to "Cancel". */
  cancelLabel?: string;
  /** Renders the affirmative button in the destructive style and outlines
   *  the dialog in red. Use for delete / renounce / reset operations. */
  destructive?: boolean;
  /** If set, the affirmative button stays disabled until the user types
   *  this exact phrase. Reserved for irreversible actions (renounce, etc.). */
  typedConfirmation?: string;
}

export interface AlertOptions {
  title: string;
  message: ReactNode;
  /** Defaults to "OK". */
  buttonLabel?: string;
}

export interface DialogContextValue {
  confirm(opts: ConfirmOptions): Promise<boolean>;
  alert(opts: AlertOptions): Promise<void>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog must be used inside <DialogProvider>");
  return ctx;
}

type Pending =
  | { kind: "confirm"; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: "alert";   opts: AlertOptions;   resolve: () => void };

export function DialogProvider({ children }: { children: ReactNode }) {
  // Queue rather than single-slot so a rapid-fire pair of dialogs (rare,
  // but possible during shutdown flows) doesn't drop one silently.
  const [queue, setQueue] = useState<Pending[]>([]);

  const enqueue = useCallback((entry: Pending) => {
    setQueue((q) => [...q, entry]);
  }, []);

  const ctx: DialogContextValue = {
    confirm: (opts) =>
      new Promise<boolean>((resolve) => enqueue({ kind: "confirm", opts, resolve })),
    alert: (opts) =>
      new Promise<void>((resolve) => enqueue({ kind: "alert", opts, resolve })),
  };

  const current = queue[0];

  const close = useCallback(
    (value: boolean | undefined) => {
      if (!current) return;
      if (current.kind === "confirm") current.resolve(value === true);
      else current.resolve();
      setQueue((q) => q.slice(1));
    },
    [current],
  );

  return (
    <DialogContext.Provider value={ctx}>
      {children}
      {current && <DialogShell entry={current} onClose={close} />}
    </DialogContext.Provider>
  );
}

// Rendering shell

function DialogShell({
  entry,
  onClose,
}: {
  entry: Pending;
  onClose: (value: boolean | undefined) => void;
}) {
  const [typed, setTyped] = useState("");
  // Re-focus the right control each time a new entry mounts.
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setTyped("");
    // Give the modal a frame to mount before focusing — keeps screen-reader
    // announcement of the dialog role from racing the focus jump.
    const t = window.setTimeout(() => confirmRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [entry]);

  // Esc cancels (false for confirm, dismiss for alert). Enter confirms when
  // the affirmative button is enabled.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose(entry.kind === "confirm" ? false : undefined);
      } else if (e.key === "Enter" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        if (!confirmRef.current?.disabled) onClose(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entry, onClose]);

  const isConfirm = entry.kind === "confirm";
  const destructive = isConfirm && entry.opts.destructive === true;
  const typedRequired = isConfirm ? entry.opts.typedConfirmation : undefined;
  const typedOk = !typedRequired || typed.trim() === typedRequired;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-black/60 backdrop-blur-sm animate-fade-in"
      onMouseDown={(e) => {
        // Click outside cancels (same as Esc). For alerts, "outside" = dismiss.
        if (e.target === e.currentTarget) onClose(entry.kind === "confirm" ? false : undefined);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="secudigate-dialog-title"
        className={`card w-full max-w-md p-6 border ${destructive ? "border-bad/40" : "border-line/80"} animate-rise-in`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-3">
          <DialogIcon variant={destructive ? "destructive" : "neutral"} />
          <div className="flex-1 min-w-0">
            <h2
              id="secudigate-dialog-title"
              className={`text-base font-semibold ${destructive ? "text-bad" : "text-ink"}`}
            >
              {entry.opts.title}
            </h2>
          </div>
        </div>

        <div className="text-sm text-ink-dim leading-relaxed pl-9">
          {entry.opts.message}
        </div>

        {typedRequired && (
          <div className="mt-4 pl-9">
            <label className="label">
              Type <span className="font-mono text-ink">{typedRequired}</span> to confirm
            </label>
            <input
              autoFocus
              spellCheck={false}
              className="input font-mono text-sm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          {isConfirm && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => onClose(false)}
            >
              {entry.opts.cancelLabel ?? "Cancel"}
            </button>
          )}
          <button
            ref={confirmRef}
            type="button"
            className={destructive ? "btn-bad" : "btn-primary"}
            disabled={!typedOk}
            onClick={() => onClose(true)}
          >
            {isConfirm
              ? (entry.opts.confirmLabel ?? "Confirm")
              : (entry.opts.buttonLabel ?? "OK")}
          </button>
        </div>
      </div>
    </div>
  );
}

function DialogIcon({ variant }: { variant: "neutral" | "destructive" }) {
  if (variant === "destructive") {
    return (
      <span className="shrink-0 mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-bad/10 border border-bad/30 text-bad">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
          <line x1="12" y1="9"  x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </span>
    );
  }
  return (
    <span className="shrink-0 mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand/15 border border-brand/40 text-brand-soft">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8"  x2="12.01" y2="8" />
      </svg>
    </span>
  );
}
