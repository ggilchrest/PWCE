import test from "node:test";
import assert from "node:assert/strict";
import { MAX_TRANSPORT_BYTES, readJsonBody, readJsonObjectBody, requireJsonContentType } from "../src/http/json-body.js";

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

test("shared JSON transport requires an application/json content type", () => {
  requireJsonContentType(request([], { "content-type": "application/json; charset=utf-8" }));
  assert.throws(() => requireJsonContentType(request([], { "content-type": "text/plain" })), { code: "invalid_request" });
  assert.throws(() => requireJsonContentType(request([])), { code: "invalid_request" });
});

test("shared JSON body reader types request stream failures", async () => {
  const failingRequest = { headers: {}, async *[Symbol.asyncIterator]() { throw new TypeError("request stream closed"); } };
  await assert.rejects(() => readJsonBody(failingRequest), { code: "invalid_request", message: "request body was unavailable" });
});

test("shared JSON object reader rejects non-object payloads", async () => {
  await assert.deepEqual(await readJsonObjectBody(request(["{\"ok\":true}"])), { ok: true });
  for (const payload of ["null", "[]", "true"]) {
    await assert.rejects(() => readJsonObjectBody(request([payload])), { code: "invalid_request", message: "request body must be a JSON object" });
  }
});
