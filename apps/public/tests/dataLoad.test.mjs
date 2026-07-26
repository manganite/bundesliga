import test from "node:test";
import assert from "node:assert/strict";
import { getOptionalJson } from "../src/lib/data.js";

// ============================================================================
//  §Codex §4 — getOptionalJson: ONLY 404 is a quiet null. Everything else fails
//  loud so a corrupt outlook.json can never again read as „gibt es noch nicht".
// ============================================================================

const withFetch = async (impl, fn) => {
  const orig = globalThis.fetch;
  globalThis.fetch = impl;
  try { return await fn(); } finally { globalThis.fetch = orig; }
};
const response = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => (typeof body === "function" ? body() : body),
});

test("404 returns null (the legitimate does-not-exist case)", async () => {
  await withFetch(async () => response(404), async () => {
    assert.equal(await getOptionalJson("x.json"), null);
  });
});

test("200 with valid JSON → the parsed value", async () => {
  await withFetch(async () => response(200, { a: 1 }), async () => {
    assert.deepEqual(await getOptionalJson("x.json"), { a: 1 });
  });
});

test("500 throws — never a silent null", async () => {
  await withFetch(async () => response(500), async () => {
    await assert.rejects(() => getOptionalJson("x.json"), /HTTP 500/);
  });
});

test("a network failure throws", async () => {
  await withFetch(async () => { throw new Error("ECONNREFUSED"); }, async () => {
    await assert.rejects(() => getOptionalJson("x.json"), /Netzwerkfehler/);
  });
});

test("invalid JSON throws (a truncated body is a failure, not an absence)", async () => {
  await withFetch(async () => response(200, () => { throw new SyntaxError("Unexpected token <"); }), async () => {
    await assert.rejects(() => getOptionalJson("x.json"), /ungültiges JSON/);
  });
});
