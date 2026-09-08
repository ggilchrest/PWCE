# Development Batch 151 — harden Studio auth boundaries

## Outcome

Studio authentication now performs a password verification attempt even when the submitted username does not match, reducing account-existence timing differences. Session scope returned to callers is also copied so a caller cannot mutate the registry's authorization scope.

## Evidence

- `test/studio-auth.test.js` covers isolated session scope and revocation.
- `npm test`, `npm run validate`, and `git diff --check` pass.

## Boundary

This is local authentication hardening. It does not claim resistance to a compromised host, production credential custody, or remote identity-provider requirements.
