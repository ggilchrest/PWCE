export function reconnectDelay({ initialMs = 1_000, maxMs = 30_000, attempt = 0 } = {}) {
  if (!Number.isInteger(initialMs) || initialMs < 0) throw new Error("Reconnect initial delay must be a non-negative integer");
  if (!Number.isInteger(maxMs) || maxMs < initialMs) throw new Error("Reconnect maximum delay must be an integer greater than or equal to the initial delay");
  if (!Number.isInteger(attempt) || attempt < 0) throw new Error("Reconnect attempt must be a non-negative integer");
  return Math.min(maxMs, initialMs * (2 ** attempt));
}

export function canReconnect({ attempt, maxAttempts = 10 } = {}) {
  if (!Number.isInteger(attempt) || attempt < 0) throw new Error("Reconnect attempt must be a non-negative integer");
  if (!Number.isInteger(maxAttempts)) throw new Error("Reconnect maximum attempts must be an integer");
  return maxAttempts <= 0 || attempt < maxAttempts;
}

export function readReconnectConfig(env = process.env) {
  const initialMs = Number(env.PWCE_HA_RECONNECT_INITIAL_MS ?? 1_000);
  const maxMs = Number(env.PWCE_HA_RECONNECT_MAX_MS ?? 30_000);
  const maxAttempts = Number(env.PWCE_HA_RECONNECT_MAX_ATTEMPTS ?? 10);
  if (!Number.isInteger(initialMs) || initialMs < 0) throw new Error("PWCE_HA_RECONNECT_INITIAL_MS must be a non-negative integer");
  if (!Number.isInteger(maxMs) || maxMs < initialMs) throw new Error("PWCE_HA_RECONNECT_MAX_MS must be an integer greater than or equal to PWCE_HA_RECONNECT_INITIAL_MS");
  if (!Number.isInteger(maxAttempts)) throw new Error("PWCE_HA_RECONNECT_MAX_ATTEMPTS must be an integer");
  return { initialMs, maxMs, maxAttempts };
}
