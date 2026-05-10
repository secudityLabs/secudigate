// Tiny typed fetch wrapper for the Secudigate backend.
//
// - Base URL comes from VITE_API_BASE_URL. When that's unset, `isApiEnabled()`
//   returns false and the rest of the app falls back to localStorage stores.
// - The connected wallet address is held in a module-level singleton, kept in
//   sync by <AuthBridge /> mounted near the React root. Authenticated calls
//   inject it as an `x-merchant-address` header.

const RAW_BASE = import.meta.env.VITE_API_BASE_URL?.trim();
export const API_BASE = RAW_BASE && RAW_BASE.length > 0 ? RAW_BASE.replace(/\/+$/, "") : undefined;

export function isApiEnabled(): boolean {
  return Boolean(API_BASE);
}

let currentAddress: `0x${string}` | undefined;

// Set by <AuthBridge /> from wagmi's useAccount().
export function setApiAddress(addr: string | undefined) {
  currentAddress = addr ? (addr.toLowerCase() as `0x${string}`) : undefined;
}

export function getApiAddress(): `0x${string}` | undefined {
  return currentAddress;
}

// SIWE session token. Stored in localStorage so it survives reloads but
// not in cookies — see ../components/AuthBridge for the rationale. The
// useSiwe hook is the authority that mutates this; the apiFetch caller
// just reads it and attaches the bearer header to authenticated calls.

const SESSION_KEY = "secudigate:siwe-session:v1";

interface StoredSession {
  token: string;
  address: `0x${string}`;
  expiresAt: number; // unix seconds
}

let currentSession: StoredSession | null = readSession();

function readSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.token || typeof parsed.expiresAt !== "number") return null;
    if (parsed.expiresAt <= Math.floor(Date.now() / 1000)) {
      // Expired — purge so we don't keep sending dead tokens.
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch { return null; }
}

export function getSiweSession(): StoredSession | null {
  return currentSession;
}

export function setSiweSession(s: StoredSession | null) {
  currentSession = s;
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* quota — non-fatal */ }
  // Let subscribers (the useSiwe hook) react to changes from other tabs
  // or from logout paths in this tab.
  window.dispatchEvent(new CustomEvent("secudigate:siwe-session-changed"));
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

interface FetchOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean;          // attach x-merchant-address
  signal?: AbortSignal;
}

export async function apiFetch<T = unknown>(path: string, opts: FetchOptions = {}): Promise<T> {
  if (!API_BASE) throw new Error("API not configured (VITE_API_BASE_URL is unset).");

  const headers = new Headers();
  if (opts.body !== undefined) headers.set("content-type", "application/json");
  if (opts.auth) {
    // Prefer the SIWE bearer; fall back to the legacy x-merchant-address
    // header so the demo keeps working before sign-in lands in every flow.
    // The backend treats whichever is present first as authoritative.
    if (currentSession?.token) {
      headers.set("authorization", `Bearer ${currentSession.token}`);
    } else if (currentAddress) {
      headers.set("x-merchant-address", currentAddress);
    } else {
      throw new ApiError("wallet not connected", 401, null);
    }
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }

  if (!res.ok) {
    const message =
      typeof body === "object" && body !== null && "error" in body && typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : `${res.status} ${res.statusText}`;
    throw new ApiError(message, res.status, body);
  }
  return body as T;
}
