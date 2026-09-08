import test from "node:test";
import assert from "node:assert/strict";
import { MAX_TRANSPORT_BYTES, readJsonBody } from "../src/http/json-body.js";

function request(chunks, headers = {}) {
  return { headers, async *[Symbol.asyncIterator]() { for (const chunk of chunks) yield chunk; } };
}

test("shared JSON body reader accepts bounded UTF-8 JSON", async () => {
  assert.deepEqual(await readJsonBody(request(["{\"ok\":true}"])), { ok: true });
  assert.equal(MAX_TRANSPORT_BYTES, 1_048_576);
});

test("shared JSON body reader rejects declared and actual oversized bodies", async () => {
  await assert.rejects(() => readJsonBody(request(["{}"], { "content-length": String(MAX_TRANSPORT_BYTES + 1) })), { code: "limit_exceeded" });
  await assert.rejects(() => readJsonBody(request(["x".repeat(MAX_TRANSPORT_BYTES + 1)])), { code: "limit_exceeded" });
});

test("shared JSON body reader reports malformed JSON", async () => {
  await assert.rejects(() => readJsonBody(request(["not-json"])), { code: "invalid_request" });
});
