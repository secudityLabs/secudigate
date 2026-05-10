import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type ToastVariant = "success" | "error" | "info";

export interface Toast {
  id: number;
  message: string;
  description?: string;
  variant: ToastVariant;
  duration: number;
}

interface ToastContextValue {
  toast: (input: { message: string; description?: string; variant?: ToastVariant; duration?: number }) => void;
  success: (message: string, description?: string) => void;
  error: (message: string, description?: string) => void;
  info: (message: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const timers = useRef<Map<number, number>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
    const handle = timers.current.get(id);
    if (handle) {
      window.clearTimeout(handle);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = ++idRef.current;
    const next: Toast = { ...t, id };
    setToasts((current) => [...current, next]);
    if (t.duration > 0) {
      const handle = window.setTimeout(() => dismiss(id), t.duration);
      timers.current.set(id, handle);
    }
  }, [dismiss]);

  useEffect(() => () => {
    timers.current.forEach((h) => window.clearTimeout(h));
    timers.current.clear();
  }, []);

  const value = useMemo<ToastContextValue>(() => ({
    toast: ({ message, description, variant = "info", duration = 3500 }) =>
      push({ message, description, variant, duration }),
    success: (message, description) => push({ message, description, variant: "success", duration: 3500 }),
    error:   (message, description) => push({ message, description, variant: "error",   duration: 5000 }),
    info:    (message, description) => push({ message, description, variant: "info",    duration: 3500 }),
  }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Viewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function Viewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none w-full max-w-sm">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const accent =
    toast.variant === "success" ? "border-good/40 bg-good/10"
    : toast.variant === "error" ? "border-bad/40 bg-bad/10"
    : "border-line bg-bg-soft";
  const dot =
    toast.variant === "success" ? "bg-good"
    : toast.variant === "error" ? "bg-bad"
    : "bg-brand-soft";

  return (
    <div
      role="status"
      className={`pointer-events-auto card border ${accent} px-4 py-3 flex items-start gap-3 animate-[fade-in_180ms_ease-out]`}
    >
      <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${dot}`} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-ink">{toast.message}</div>
        {toast.description && (
          <div className="mt-0.5 text-xs text-ink-dim leading-relaxed">{toast.description}</div>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="text-ink-faint hover:text-ink text-xs"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
