# Development Batch 160 — live Lifestream gateway compatibility smoke

## Outcome

The current Lifestream PWCE client and mapping tests pass against a disposable local PWCE gateway using the refreshed compatibility pins. The gateway synchronized both authenticated local Home Assistant sites before the client ran.

## Evidence

- PWCE served the gateway at `http://127.0.0.1:4183` with a disposable gateway token and read-only Home Assistant startup sync.
- Lifestream ran `packages/providers-pwce/test/client.test.ts` and `packages/runtime/test/pwce-mapping.test.ts` with `PWCE_GATEWAY_URL` set to that gateway.
- Seven tests passed: profile negotiation and real authority/health/prepared-input reads, incompatibility rejection, operation-advertisement protection, mapped operation coverage, SSE parsing, qualified-context mapping, and unbound-slice rejection.
- PWCE’s 138-test suite and contract validation also passed.

## Boundary

This is local development-host compatibility evidence. It does not claim production readiness, full Lifestream product acceptance, voice-provider acceptance, or the complete core mapping acceptance gate.
