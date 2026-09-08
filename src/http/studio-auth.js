import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

function sameSecret(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

const PASSWORD_KEY_BYTES = 32;
const PASSWORD_SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };

function invalid(message) {
  const error = new Error(message);
  error.code = "invalid_request";
  return error;
}

function normalizeRecoveryCode(value) {
  return typeof value === "string" ? value.replaceAll("-", "").replaceAll(" ", "").toUpperCase() : "";
}

function recoveryDigest(code) {
  return createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
}

export function hashPassword(password) {
  if (typeof password !== "string" || password.length < 12 || password.length > 256) throw invalid("password must be between 12 and 256 characters");
  const salt = randomBytes(16);
  const derivedKey = scryptSync(password, salt, PASSWORD_KEY_BYTES, PASSWORD_SCRYPT_OPTIONS);
  return { algorithm: "scrypt", salt: salt.toString("base64url"), derivedKey: derivedKey.toString("base64url"), parameters: { N: PASSWORD_SCRYPT_OPTIONS.N, r: PASSWORD_SCRYPT_OPTIONS.r, p: PASSWORD_SCRYPT_OPTIONS.p, keyBytes: PASSWORD_KEY_BYTES } };
}

export function verifyPassword(password, stored) {
  if (typeof password !== "string" || !stored || stored.algorithm !== "scrypt") return false;
  try {
    const expected = Buffer.from(stored.derivedKey, "base64url");
    const actual = scryptSync(password, Buffer.from(stored.salt, "base64url"), expected.length, { N: stored.parameters.N, r: stored.parameters.r, p: stored.parameters.p, maxmem: PASSWORD_SCRYPT_OPTIONS.maxmem });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function generateRecoveryCodes(count = 10) {
  if (!Number.isInteger(count) || count < 1 || count > 32) throw invalid("recovery code count is outside the allowed range");
  return Array.from({ length: count }, () => randomBytes(10).toString("hex").toUpperCase());
}

export function createStudioAuthService({ store, clock = () => new Date() } = {}) {
  if (!store) throw new Error("Studio auth requires a state store");
  return {
    async hasAccount() { return Boolean((await store.load()).studioAuth?.username); },
    async initialize({ username, password, recoveryCodes } = {}) {
      if (typeof username !== "string" || !/^[a-zA-Z0-9._-]{1,64}$/.test(username)) throw invalid("username must be 1 to 64 letters, numbers, dots, underscores, or hyphens");
      if (!Array.isArray(recoveryCodes) || recoveryCodes.length < 1 || recoveryCodes.length > 32 || recoveryCodes.some((code) => normalizeRecoveryCode(code).length < 16)) throw invalid("at least one valid recovery code is required");
      const passwordHash = hashPassword(password);
      const normalizedCodes = recoveryCodes.map(normalizeRecoveryCode);
      if (new Set(normalizedCodes).size !== normalizedCodes.length) throw invalid("recovery codes must be unique");
      const account = { schemaVersion: 1, username, passwordHash, recoveryCodes: normalizedCodes.map((code) => ({ digest: recoveryDigest(code), usedAt: null })), principalRef: "principal.studio", createdAt: clock().toISOString(), revision: 1 };
      await store.transaction((state) => {
        if (state.studioAuth?.username) throw invalid("Studio account is already initialized");
        state.studioAuth = account;
        state.audit.push({ type: "studio.auth.initialized", username, recordedAt: account.createdAt });
      });
      return { username, recoveryCodeCount: normalizedCodes.length, principalRef: account.principalRef };
    },
    async authenticate({ username, password } = {}) {
      const account = (await store.load()).studioAuth;
      if (!account || typeof username !== "string" || username !== account.username || !verifyPassword(password, account.passwordHash)) return null;
      return { principalRef: account.principalRef, username: account.username, transport: "password" };
    },
    async authenticateRecovery({ code } = {}) {
      const digest = recoveryDigest(code);
      if (!digest || digest.length !== 64) return null;
      const current = await store.load();
      if (!current.studioAuth?.recoveryCodes?.some((candidate) => candidate.digest === digest && !candidate.usedAt)) return null;
      const result = await store.transaction((state) => {
        const account = state.studioAuth;
        const recovery = account?.recoveryCodes?.find((candidate) => candidate.digest === digest && !candidate.usedAt);
        if (!account || !recovery) return null;
        recovery.usedAt = clock().toISOString();
        account.revision += 1;
        state.audit.push({ type: "studio.auth.recovery_used", principalRef: account.principalRef, recordedAt: recovery.usedAt });
        return { principalRef: account.principalRef, username: account.username, transport: "recovery_code" };
      });
      return result.result;
    }
  };
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
    has(sessionRef) { return Boolean(this.get(sessionRef)); },
    revoke(sessionRef) { return sessions.delete(sessionRef); }
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
