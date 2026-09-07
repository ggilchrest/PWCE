import test from "node:test";
import assert from "node:assert/strict";
import { canReconnect, readReconnectConfig, reconnectDelay } from "../src/runtime/reconnect-policy.js";

test("reconnect delay uses bounded exponential backoff", () => {
  assert.deepEqual([0, 1, 2, 3].map((attempt) => reconnectDelay({ initialMs: 100, maxMs: 250, attempt })), [100, 200, 250, 250]);
});

test("reconnect attempts are bounded unless explicitly unlimited", () => {
  assert.equal(canReconnect({ attempt: 0, maxAttempts: 2 }), true);
  assert.equal(canReconnect({ attempt: 2, maxAttempts: 2 }), false);
  assert.equal(canReconnect({ attempt: 100, maxAttempts: 0 }), true);
});

test("reconnect configuration fails fast when malformed", () => {
  assert.deepEqual(readReconnectConfig({ PWCE_HA_RECONNECT_INITIAL_MS: "250", PWCE_HA_RECONNECT_MAX_MS: "500", PWCE_HA_RECONNECT_MAX_ATTEMPTS: "0" }), { initialMs: 250, maxMs: 500, maxAttempts: 0 });
  assert.throws(() => readReconnectConfig({ PWCE_HA_RECONNECT_INITIAL_MS: "bad" }), /INITIAL_MS/);
  assert.throws(() => readReconnectConfig({ PWCE_HA_RECONNECT_INITIAL_MS: "500", PWCE_HA_RECONNECT_MAX_MS: "100" }), /MAX_MS/);
});
