import { randomBytes, timingSafeEqual } from "node:crypto";

function sameSecret(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").map((part) => part.trim().split("=")).filter(([key, value]) => key && value).map(([key, ...value]) => [key, decodeURIComponent(value.join("="))]));
}

export function createStudioSessionRegistry() {
  const sessions = new Map();
  return {
    issue({ principalRef = "principal.studio", siteRefs = ["home.one"], ttlMs = 3_600_000 } = {}) {
      const sessionRef = randomBytes(32).toString("base64url");
      const context = { principalRef, siteRefs: [...new Set(siteRefs)], expiresAt: new Date(Date.now() + ttlMs).toISOString() };
      sessions.set(sessionRef, context);
      return { sessionRef, ...context };
    },
    get(sessionRef) {
      const context = sessions.get(sessionRef);
      if (!context || new Date(context.expiresAt) <= new Date()) { if (sessionRef) sessions.delete(sessionRef); return null; }
      return { ...context };
    },
    has(sessionRef) { return Boolean(this.get(sessionRef)); }
  };
}

export function getStudioContext({ authorization, cookie, configuredToken, sessions, siteRefs = ["home.one"] }) {
  const bearer = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : null;
  if (configuredToken && sameSecret(bearer, configuredToken)) return { principalRef: "principal.studio.api", siteRefs: [...siteRefs], expiresAt: null, transport: "bearer" };
  const context = cookie ? sessions.get(cookie) : null;
  return context ? { ...context, transport: "local_session" } : null;
}

export function hasStudioAuthority(input) {
  return Boolean(getStudioContext(input));
}
