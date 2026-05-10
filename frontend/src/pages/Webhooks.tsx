import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import MerchantNav from "../components/MerchantNav";
import CopyButton from "../components/CopyButton";
import { useToast } from "../components/Toast";
import { useDialog } from "../components/Dialog";
import { isApiEnabled } from "../lib/api";
import {
  type ApiWebhook,
  type ApiWebhookDelivery,
  type WebhookEventType,
  createWebhook,
  deleteWebhook,
  listDeliveries,
  listWebhooks,
  patchWebhook,
  rotateWebhookSecret,
  sendTestDelivery,
} from "../lib/api/webhooks";
import { formatRelativeTime, shortAddress } from "../lib/format";

const EVENT_TYPES: WebhookEventType[] = ["invoice.paid", "deposit.received"];

export default function WebhooksPage() {
  const { address, isConnected } = useAccount();

  if (!isApiEnabled()) {
    return (
      <div>
        <MerchantNav />
        <div className="card p-12 text-center">
          <h1 className="text-2xl font-semibold">Backend not configured</h1>
          <p className="mt-2 text-ink-dim text-sm max-w-md mx-auto">
            Webhooks require the Secudigate backend. Set{" "}
            <code className="font-mono text-xs">VITE_API_BASE_URL</code> in
            <code className="font-mono text-xs"> frontend/.env</code> and restart the dev server.
          </p>
        </div>
      </div>
    );
  }

  if (!isConnected || !address) {
    return (
      <div>
        <MerchantNav />
        <div className="py-24 text-center">
          <h1 className="text-2xl font-semibold">Connect a wallet to manage webhooks</h1>
          <p className="mt-2 text-ink-dim">Each webhook is scoped to the connected wallet.</p>
          <div className="mt-8 inline-flex"><ConnectButton /></div>
        </div>
      </div>
    );
  }

  return <WebhooksDashboard merchant={address} />;
}

function WebhooksDashboard({ merchant }: { merchant: `0x${string}` }) {
  const toast = useToast();
  const [webhooks, setWebhooks] = useState<ApiWebhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  // The full secret is only available on the create response; we hold it
  // until the merchant confirms they've saved it, then drop it.
  const [freshlyCreated, setFreshlyCreated] = useState<ApiWebhook | null>(null);

  const refetch = useCallback(async () => {
    try {
      const list = await listWebhooks();
      setWebhooks(list);
    } catch (e) {
      toast.error("Failed to load webhooks", e instanceof Error ? e.message : "");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void refetch(); }, [refetch]);

  return (
    <div>
      <MerchantNav />

      <header className="flex items-end justify-between gap-3 flex-wrap mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Webhooks</h1>
          <p className="text-sm text-ink-dim mt-1 max-w-2xl">
            Receive HMAC-signed POSTs the moment an invoice is paid or a deposit lands. Each
            webhook is for <span className="font-mono text-ink">{shortAddress(merchant)}</span>.
          </p>
        </div>
        {!creating && !freshlyCreated && (
          <button type="button" className="btn-primary text-sm" onClick={() => setCreating(true)}>
            Add webhook
          </button>
        )}
      </header>

      {freshlyCreated && (
        <FreshlyCreated webhook={freshlyCreated} onDismiss={() => setFreshlyCreated(null)} />
      )}

      {creating && !freshlyCreated && (
        <CreateForm
          onCancel={() => setCreating(false)}
          onCreated={(w) => {
            setCreating(false);
            setFreshlyCreated(w);
            void refetch();
          }}
        />
      )}

      {loading ? (
        <div className="card p-8 text-center text-sm text-ink-dim">Loading webhooks…</div>
      ) : webhooks.length === 0 && !creating && !freshlyCreated ? (
        <EmptyState onCreate={() => setCreating(true)} />
      ) : (
        <ul className="space-y-3">
          {webhooks.map((wh) => (
            <WebhookRow key={wh.id} webhook={wh} onChange={refetch} />
          ))}
        </ul>
      )}

      <SecurityNote />
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="card p-12 text-center">
      <div className="mx-auto w-14 h-14 rounded-2xl bg-brand/10 border border-brand/30 flex items-center justify-center text-brand-soft">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 13a3 3 0 1 0-2.83-4 6 6 0 0 0-7.93 5" />
          <path d="M9 17a3 3 0 1 1-3-3" />
          <path d="M15 17h-6" />
          <circle cx="6" cy="14" r="3" />
        </svg>
      </div>
      <div className="mt-4 font-medium">No webhooks yet</div>
      <p className="mt-1 text-sm text-ink-dim max-w-sm mx-auto">
        Add a webhook URL to your backend and Secudigate will POST every <code className="font-mono text-xs">invoice.paid</code> and{" "}
        <code className="font-mono text-xs">deposit.received</code> event to it within seconds.
      </p>
      <button type="button" className="btn-primary mt-5 text-sm" onClick={onCreate}>
        Add your first webhook
      </button>
    </div>
  );
}

function FreshlyCreated({ webhook, onDismiss }: { webhook: ApiWebhook; onDismiss: () => void }) {
  return (
    <div className="card p-5 mb-5 border-good/40 bg-good/5">
      <div className="text-sm font-semibold text-good">Webhook created</div>
      <p className="mt-1 text-xs text-ink-dim leading-relaxed">
        Save the signing secret below — this is the only time it will be shown in full. Use it
        on your server to verify the <code className="font-mono">x-secudigate-signature</code> header
        on every incoming request.
      </p>
      <div className="mt-3 label">Signing secret</div>
      <div className="flex gap-2">
        <input
          className="input font-mono text-xs"
          readOnly
          value={webhook.secret}
          onFocus={(e) => e.currentTarget.select()}
        />
        <button type="button" className="btn-ghost" onClick={() => navigator.clipboard.writeText(webhook.secret)}>
          Copy
        </button>
      </div>
      <div className="mt-4 flex justify-end">
        <button type="button" className="btn-primary text-sm" onClick={onDismiss}>
          I've saved it
        </button>
      </div>
    </div>
  );
}

function CreateForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (w: ApiWebhook) => void }) {
  const toast = useToast();
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<Set<WebhookEventType>>(new Set(EVENT_TYPES));
  const [busy, setBusy] = useState(false);

  const urlValid = useMemo(() => {
    try { new URL(url); return /^https?:\/\//.test(url); } catch { return false; }
  }, [url]);

  function toggle(ev: WebhookEventType) {
    const next = new Set(events);
    if (next.has(ev)) next.delete(ev); else next.add(ev);
    setEvents(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!urlValid || events.size === 0) return;
    setBusy(true);
    try {
      const w = await createWebhook({ url, events: [...events] });
      onCreated(w);
    } catch (e) {
      toast.error("Couldn't create webhook", e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card p-5 mb-5 space-y-4">
      <h2 className="font-semibold">New webhook</h2>

      <div>
        <label className="label" htmlFor="wh-url">URL</label>
        <input
          id="wh-url"
          className={`input font-mono text-xs ${url && !urlValid ? "border-bad/60" : ""}`}
          placeholder="https://your-backend.com/secudigate/webhook"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <p className="mt-1.5 text-[11px] text-ink-faint">Must be reachable from the public internet.</p>
      </div>

      <div>
        <label className="label">Events</label>
        <div className="grid grid-cols-2 gap-2">
          {EVENT_TYPES.map((ev) => {
            const on = events.has(ev);
            return (
              <button
                key={ev}
                type="button"
                onClick={() => toggle(ev)}
                className={`px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors flex items-center justify-between ${
                  on
                    ? "bg-brand/15 border-brand/50 text-brand-soft"
                    : "bg-bg-soft border-line text-ink-dim hover:text-ink"
                }`}
              >
                <span className="font-mono text-xs">{ev}</span>
                <span className="text-[10px]">{on ? "on" : "off"}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={!urlValid || events.size === 0 || busy}>
          {busy ? "Creating…" : "Create webhook"}
        </button>
      </div>
    </form>
  );
}

function WebhookRow({ webhook, onChange }: { webhook: ApiWebhook; onChange: () => void }) {
  const toast = useToast();
  const dialog = useDialog();
  const [expanded, setExpanded] = useState(false);
  const [deliveries, setDeliveries] = useState<ApiWebhookDelivery[] | null>(null);
  const [loadingDel, setLoadingDel] = useState(false);
  const [busy, setBusy] = useState(false);
  // Once we rotate, the backend hands back the freshly-issued plaintext
  // secret exactly once. Hold it in component state until the merchant
  // dismisses the reveal modal — after that, only the masked preview lives
  // anywhere accessible from the UI.
  const [rotatedSecret, setRotatedSecret] = useState<string | null>(null);

  const refetchDeliveries = useCallback(async () => {
    setLoadingDel(true);
    try {
      const list = await listDeliveries(webhook.id);
      setDeliveries(list);
    } catch (e) {
      toast.error("Failed to load deliveries", e instanceof Error ? e.message : "");
    } finally {
      setLoadingDel(false);
    }
  }, [webhook.id, toast]);

  useEffect(() => {
    if (!expanded) return;
    void refetchDeliveries();
    const tick = window.setInterval(refetchDeliveries, 5_000);
    return () => window.clearInterval(tick);
  }, [expanded, refetchDeliveries]);

  async function togglePause() {
    setBusy(true);
    try {
      await patchWebhook(webhook.id, { active: !webhook.active });
      onChange();
    } catch (e) {
      toast.error("Couldn't update webhook", e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    const ok = await dialog.confirm({
      title: "Delete webhook?",
      message: (
        <>
          Permanently remove the webhook for{" "}
          <span className="font-mono text-ink break-all">{webhook.url}</span>?
          The delivery history goes with it. New events on the chain will not
          be POSTed to this URL anymore.
        </>
      ),
      confirmLabel: "Delete webhook",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteWebhook(webhook.id);
      onChange();
    } catch (e) {
      toast.error("Couldn't delete webhook", e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  }

  async function handleRotate() {
    const ok = await dialog.confirm({
      title: "Rotate signing secret?",
      message: (
        <>
          The current secret keeps verifying for <strong>24 hours</strong>;
          after that, only the new one works. Update your receiver to accept
          both during the window — see the docs for the dual-verify pattern.
        </>
      ),
      confirmLabel: "Rotate secret",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const updated = await rotateWebhookSecret(webhook.id);
      setRotatedSecret(updated.secret);   // shown ONCE in the reveal modal
      onChange();                          // refresh the list so the banner appears
      toast.success("Secret rotated", "Save the new secret — it won't be shown again.");
    } catch (e) {
      toast.error("Couldn't rotate secret", e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  }

  async function handleTest() {
    setBusy(true);
    try {
      await sendTestDelivery(webhook.id);
      toast.success("Test event queued", "It'll be POSTed within 5 seconds.");
      setExpanded(true);
      void refetchDeliveries();
    } catch (e) {
      toast.error("Couldn't queue test event", e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="card overflow-hidden">
      <div className="p-4 flex items-start gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm text-ink truncate max-w-xl">{webhook.url}</span>
            {webhook.active
              ? <span className="badge-paid"><span className="h-1.5 w-1.5 rounded-full bg-good" />Active</span>
              : <span className="badge-expired"><span className="h-1.5 w-1.5 rounded-full bg-ink-faint" />Paused</span>}
          </div>
          <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[11px] text-ink-faint">
            {webhook.events.map((ev) => (
              <span key={ev} className="px-1.5 py-0.5 rounded bg-bg-soft border border-line font-mono">{ev}</span>
            ))}
            <span>·</span>
            <span>created {formatRelativeTime(Date.parse(webhook.createdAt))}</span>
            <span>·</span>
            <span className="flex items-center gap-1">secret: <span className="font-mono text-ink-dim">{webhook.secret}</span> <CopyButton value={webhook.id} label="Copy id" /></span>
          </div>
        </div>
        <div className="flex items-center gap-2 whitespace-nowrap">
          <button type="button" className="btn-ghost text-xs py-1.5 px-2.5" onClick={handleTest} disabled={busy || !webhook.active}>
            Send test
          </button>
          <button type="button" className="text-xs text-ink-dim hover:text-ink" onClick={handleRotate} disabled={busy}>
            Rotate
          </button>
          <button type="button" className="text-xs text-ink-dim hover:text-ink" onClick={togglePause} disabled={busy}>
            {webhook.active ? "Pause" : "Activate"}
          </button>
          <button type="button" className="text-xs text-bad/80 hover:text-bad" onClick={handleDelete} disabled={busy}>
            Delete
          </button>
          <button
            type="button"
            className="text-xs text-ink-dim hover:text-ink"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Collapse deliveries" : "Show deliveries"}
          >
            {expanded ? "▴" : "▾"}
          </button>
        </div>
      </div>

      {webhook.previousSecretExpiresAt && (
        <GraceBanner
          previousPreview={webhook.previousSecretPreview ?? ""}
          expiresAt={webhook.previousSecretExpiresAt}
        />
      )}

      {rotatedSecret && (
        <RotatedSecretModal
          secret={rotatedSecret}
          onClose={() => setRotatedSecret(null)}
        />
      )}

      {expanded && (
        <div className="border-t border-line/60 bg-bg-soft/40 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-widest text-ink-faint">Recent deliveries</span>
            <button type="button" className="text-xs text-ink-dim hover:text-ink" onClick={refetchDeliveries}>
              Refresh
            </button>
          </div>

          {loadingDel && deliveries === null
            ? <div className="text-xs text-ink-faint py-3">Loading…</div>
            : deliveries && deliveries.length === 0
              ? <div className="text-xs text-ink-dim py-3">No deliveries yet. Click <strong>Send test</strong> to fire one now.</div>
              : (
                <ul className="space-y-1.5">
                  {deliveries?.map((d) => <DeliveryRow key={d.id} d={d} />)}
                </ul>
              )}
        </div>
      )}
    </li>
  );
}

function DeliveryRow({ d }: { d: ApiWebhookDelivery }) {
  const succeeded = d.successAt !== null;
  const permFail  = !succeeded && d.attempts >= 5;

  const tagClass =
    succeeded ? "bg-good/15 text-good"
    : permFail ? "bg-bad/15 text-bad"
    : "bg-warn/15 text-warn";
  const tag = succeeded ? "succeeded" : permFail ? "failed" : "pending";

  return (
    <li className="px-3 py-2 rounded-lg bg-bg-card border border-line/60 flex items-start gap-3 text-xs">
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium tracking-wide uppercase ${tagClass}`}>
        {tag}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono">{d.eventType}</span>
          <span className="text-ink-faint">·</span>
          <span className="text-ink-faint">{d.attempts} attempt{d.attempts === 1 ? "" : "s"}</span>
          {d.responseStatus !== null && (
            <>
              <span className="text-ink-faint">·</span>
              <span className="text-ink-faint">HTTP {d.responseStatus}</span>
            </>
          )}
          <span className="text-ink-faint">·</span>
          <span className="text-ink-faint">{formatRelativeTime(Date.parse(d.lastAttemptAt ?? d.createdAt))}</span>
        </div>
        {d.responseBody && (
          <pre className="mt-1 text-[10px] font-mono text-ink-faint whitespace-pre-wrap break-all max-h-20 overflow-hidden">{d.responseBody}</pre>
        )}
      </div>
    </li>
  );
}

// Inline banner shown on a rotated webhook while the prior secret is still
// honored. Counts down to the cutoff so the merchant knows how much time
// they have to update receivers.
function GraceBanner({ previousPreview, expiresAt }: { previousPreview: string; expiresAt: string }) {
  const cutoff = Date.parse(expiresAt);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const remaining = cutoff - now;
  if (remaining <= 0) return null;

  const hrs = Math.floor(remaining / 3_600_000);
  const mins = Math.floor((remaining % 3_600_000) / 60_000);

  return (
    <div className="border-t border-line/60 bg-warn/5 px-4 py-2.5 text-[11px] text-warn flex items-center gap-3 flex-wrap">
      <span className="font-medium">Rotation in progress</span>
      <span className="text-ink-dim">
        Previous secret <span className="font-mono">{previousPreview}</span> still verifies for{" "}
        <span className="font-mono">{hrs}h {mins}m</span>. Update receivers to accept the new secret.
      </span>
    </div>
  );
}

// One-shot reveal of a freshly-rotated secret. Closes on Cancel / Esc /
// after the user clicks "I've copied it." The secret is never re-rendered
// after dismiss — the merchant has to rotate again if they lose it.
function RotatedSecretModal({ secret, onClose }: { secret: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="card border-warn/40 w-full max-w-md p-6"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">New signing secret</h2>
        <p className="mt-2 text-sm text-ink-dim leading-relaxed">
          Save this now — it will not be shown again. Your old secret keeps
          verifying for 24 hours, giving you time to update your receiver
          to accept both during the window.
        </p>
        <div className="mt-4 flex gap-2">
          <input
            className="input font-mono text-[11px]"
            readOnly
            value={secret}
            onFocus={(e) => e.currentTarget.select()}
          />
          <button type="button" className="btn-ghost" onClick={() => navigator.clipboard.writeText(secret)}>
            Copy
          </button>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-primary" onClick={onClose}>
            I've saved it
          </button>
        </div>
      </div>
    </div>
  );
}

function SecurityNote() {
  return (
    <div className="card p-5 mt-8 border-line/60 bg-bg-soft/40">
      <div className="text-xs uppercase tracking-widest text-ink-faint">Verifying signatures</div>
      <p className="mt-2 text-sm text-ink-dim leading-relaxed">
        Every request carries an <code className="font-mono text-xs">x-secudigate-signature</code> header
        of the form <code className="font-mono text-xs">sha256=&lt;hex&gt;</code>. Recompute the HMAC over
        the raw request body using your saved secret and reject anything that doesn't match. The
        <code className="font-mono text-xs"> x-secudigate-delivery</code> header is the idempotency key —
        retries reuse the same id, so dedupe on it.
      </p>
      <pre className="mt-3 text-[11px] font-mono bg-bg-card border border-line rounded-lg p-3 overflow-x-auto whitespace-pre">
{`// Node example
import { createHmac, timingSafeEqual } from "node:crypto";
const expected = "sha256=" + createHmac("sha256", SECRET).update(rawBody).digest("hex");
if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader))) reject();`}
      </pre>
    </div>
  );
}
