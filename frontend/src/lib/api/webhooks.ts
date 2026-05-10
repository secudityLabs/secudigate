import { apiFetch, ApiError } from "../api";

export type WebhookEventType = "invoice.paid" | "deposit.received";

// Webhook config shape returned from the backend. The `secret` field is
// only the FULL secret on the response from POST (created); on subsequent
// list/get calls it's a masked preview ("c79e…ab10"). The frontend keeps
// the freshly-issued full secret in component state until the merchant
// confirms they've saved it.
export interface ApiWebhook {
  id:        string;
  merchant:  string;
  url:       string;
  events:    WebhookEventType[];
  active:    boolean;
  createdAt: string;
  secret:    string;
  // Masked preview of the previous secret during a rotation grace window;
  // null when no rotation is in progress or the grace expired.
  previousSecretPreview:   string | null;
  // ISO timestamp when the previous secret stops being honored. The
  // receiver can verify against either secret until this passes.
  previousSecretExpiresAt: string | null;
}

export interface ApiWebhookDelivery {
  id:             string;
  eventType:      string;
  attempts:       number;
  lastAttemptAt:  string | null;
  successAt:      string | null;
  responseStatus: number | null;
  responseBody:   string | null;
  createdAt:      string;
}

export async function listWebhooks(): Promise<ApiWebhook[]> {
  return apiFetch<ApiWebhook[]>("/v1/webhooks", { auth: true });
}

export async function createWebhook(input: { url: string; events: WebhookEventType[] }): Promise<ApiWebhook> {
  return apiFetch<ApiWebhook>("/v1/webhooks", { method: "POST", auth: true, body: input });
}

export async function patchWebhook(
  id: string,
  patch: { url?: string; events?: WebhookEventType[]; active?: boolean },
): Promise<ApiWebhook> {
  return apiFetch<ApiWebhook>(`/v1/webhooks/${encodeURIComponent(id)}`, {
    method: "PATCH",
    auth: true,
    body: patch,
  });
}

export async function deleteWebhook(id: string): Promise<void> {
  await apiFetch<void>(`/v1/webhooks/${encodeURIComponent(id)}`, { method: "DELETE", auth: true });
}

export async function listDeliveries(webhookId: string): Promise<ApiWebhookDelivery[]> {
  return apiFetch<ApiWebhookDelivery[]>(
    `/v1/webhooks/${encodeURIComponent(webhookId)}/deliveries`,
    { auth: true },
  );
}

export async function sendTestDelivery(webhookId: string): Promise<{ deliveryId: string }> {
  return apiFetch<{ deliveryId: string }>(
    `/v1/webhooks/${encodeURIComponent(webhookId)}/test`,
    { method: "POST", auth: true },
  );
}

// Rotate the signing secret. The response includes the freshly-issued
// full secret (only time it's returned in plaintext) plus the
// previousSecretExpiresAt marker for the dual-verify grace window.
export async function rotateWebhookSecret(webhookId: string): Promise<ApiWebhook> {
  return apiFetch<ApiWebhook>(
    `/v1/webhooks/${encodeURIComponent(webhookId)}/rotate`,
    { method: "POST", auth: true },
  );
}

export { ApiError };
