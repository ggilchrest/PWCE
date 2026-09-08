import test from "node:test";
import assert from "node:assert/strict";
import { createStudioAuthService, createStudioSessionRegistry, generateRecoveryCodes, getStudioContext, hasStudioAuthority, parseCookies } from "../src/http/studio-auth.js";
import { StateStore, emptyState } from "../src/runtime/state-store.js";

test("Studio accepts the configured bearer token and rejects other tokens", () => {
  const sessions = createStudioSessionRegistry();
  assert.equal(hasStudioAuthority({ authorization: "Bearer local-secret", configuredToken: "local-secret", sessions }), true);
  assert.equal(hasStudioAuthority({ authorization: "Bearer wrong", configuredToken: "local-secret", sessions }), false);
});

test("Studio browser sessions are opaque and cookie parsed", () => {
  const sessions = createStudioSessionRegistry();
  const session = sessions.issue();
  assert.equal(hasStudioAuthority({ cookie: session.sessionRef, configuredToken: "local-secret", sessions }), true);
  assert.deepEqual(getStudioContext({ cookie: session.sessionRef, configuredToken: "local-secret", sessions }).siteRefs, ["home.one"]);
  assert.equal(parseCookies(`pwce_studio_session=${encodeURIComponent(session.sessionRef)}; theme=dark`).theme, "dark");
  assert.equal(hasStudioAuthority({ cookie: "unknown", configuredToken: "local-secret", sessions }), false);
});

test("Studio contexts expire and preserve explicit site scope", () => {
  const sessions = createStudioSessionRegistry();
  const session = sessions.issue({ siteRefs: ["home.one"], ttlMs: -1 });
  assert.equal(sessions.get(session.sessionRef), null);
  const bearer = getStudioContext({ authorization: "Bearer local-secret", configuredToken: "local-secret", sessions, siteRefs: ["home.one"] });
  assert.deepEqual(bearer.siteRefs, ["home.one"]);
});

test("Studio local auth stores password and recovery digests and consumes recovery codes once", async () => {
  const store = new StateStore({ state: emptyState() });
  const auth = createStudioAuthService({ store, clock: () => new Date("2026-09-08T12:00:00.000Z") });
  const recoveryCodes = generateRecoveryCodes(2);
  await auth.initialize({ username: "dev.user", password: "a sufficiently long test password", recoveryCodes });
  const state = await store.load();
  assert.equal(state.studioAuth.username, "dev.user");
  assert.equal(state.studioAuth.passwordHash.derivedKey.includes("test password"), false);
  assert.equal(JSON.stringify(state).includes(recoveryCodes[0]), false);
  assert.equal((await auth.authenticate({ username: "dev.user", password: "wrong password" })), null);
  assert.equal((await auth.authenticate({ username: "dev.user", password: "a sufficiently long test password" })).transport, "password");
  assert.equal((await auth.authenticateRecovery({ code: recoveryCodes[0] })).transport, "recovery_code");
  assert.equal(await auth.authenticateRecovery({ code: recoveryCodes[0] }), null);
  assert.equal((await auth.authenticateRecovery({ code: recoveryCodes[1] })).transport, "recovery_code");
});

test("Studio local auth rejects weak passwords and duplicate recovery codes", async () => {
  const store = new StateStore({ state: emptyState() });
  const auth = createStudioAuthService({ store });
  await assert.rejects(() => auth.initialize({ username: "dev", password: "too-short", recoveryCodes: ["ABCDEF0123456789"] }), { code: "invalid_request" });
  await assert.rejects(() => auth.initialize({ username: "dev", password: "a sufficiently long test password", recoveryCodes: ["ABCDEF0123456789", "ABC-DEF01 23456789"] }), { code: "invalid_request" });
});

test("Studio session scope returned to callers is isolated from registry state", () => {
  const sessions = createStudioSessionRegistry();
  const session = sessions.issue({ siteRefs: ["home.one", "home.two"] });
  const context = sessions.get(session.sessionRef);
  context.siteRefs.pop();
  assert.deepEqual(sessions.get(session.sessionRef).siteRefs, ["home.one", "home.two"]);
  assert.equal(sessions.revoke(session.sessionRef), true);
  assert.equal(sessions.get(session.sessionRef), null);
});
