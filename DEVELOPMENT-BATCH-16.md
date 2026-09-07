# Development Batch 16 — Home Assistant reconnect and backoff

Status: implemented and verified locally.

## Scope

- Retry dropped Home Assistant live connections automatically.
- Use bounded exponential backoff with explicit development configuration.
- Stop retries when the Studio service stops or the configured attempt limit is exhausted.
- Keep runtime and source health honest while reconnecting.

## Evidence

- Added unit coverage for delay growth, maximum delay, finite attempts, and unlimited retry mode.
- `npm test`: 36 tests passing.
- `npm run validate`: contract fixture validation passing.

The reconnect policy is local development evidence; it does not claim production availability or external restoration.
