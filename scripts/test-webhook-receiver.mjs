#!/usr/bin/env node
// Tiny zero-dependency webhook receiver for testing Secudigate's dispatcher.
//
// Usage:
//   1. Register a webhook in the dashboard pointing at http://localhost:3333
//   2. Copy the secret it prints once on creation.
//   3. SECRET=paste-it node scripts/test-webhook-receiver.mjs
//   4. Click "Send test" or pay a real invoice — you'll see signed POSTs
//      logged, signatures verified, headers + body printed.
//
// To exercise rotation, set PREVIOUS_SECRET too — the receiver accepts a
// signature against either, demonstrating the dual-verify pattern.

import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";

const PORT = Number(process.env.PORT ?? 3333);
const SECRET          = process.env.SECRET          ?? "";
const PREVIOUS_SECRET = process.env.PREVIOUS_SECRET ?? "";

if (!SECRET) {
  console.error("Set SECRET=<webhook-secret> before running. Get it from the dashboard.");
  process.exit(1);
}

function tryHmac(rawBody, sigHeader, secret) {
  if (!secret) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  if (expected.length !== sigHeader.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(sigHeader));
}

createServer((req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405);
    return res.end("method not allowed");
  }

  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const rawBody = Buffer.concat(chunks).toString("utf8");
    const sig = String(req.headers["x-secudigate-signature"] ?? "");
    const delivery = String(req.headers["x-secudigate-delivery"] ?? "");
    const event = String(req.headers["x-secudigate-event"] ?? "");

    const current  = tryHmac(rawBody, sig, SECRET);
    const previous = !current && tryHmac(rawBody, sig, PREVIOUS_SECRET);
    const ok = current || previous;

    const tag = current ? "current" : previous ? "previous (rotation)" : "BAD";
    const stamp = new Date().toISOString();
    console.log(`\n[${stamp}] ${event}  delivery=${delivery}  sig=${tag}`);
    try {
      console.log(JSON.stringify(JSON.parse(rawBody), null, 2));
    } catch {
      console.log(rawBody);
    }

    res.writeHead(ok ? 200 : 401, { "content-type": "application/json" });
    res.end(JSON.stringify({ verified: ok }));
  });
}).listen(PORT, () => {
  console.log(`webhook receiver listening on http://localhost:${PORT}`);
  console.log(`current secret: ${SECRET.slice(0, 6)}…${SECRET.slice(-4)}`);
  if (PREVIOUS_SECRET) console.log(`previous secret: ${PREVIOUS_SECRET.slice(0, 6)}…${PREVIOUS_SECRET.slice(-4)}`);
});
