import test from "node:test";
import assert from "node:assert/strict";
import { createStudioSessionRegistry, getStudioContext, hasStudioAuthority, parseCookies } from "../src/http/studio-auth.js";

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
