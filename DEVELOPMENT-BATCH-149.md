# Development Batch 149 — local Studio Human authentication

## Outcome

Studio now supports the approved local Human session profile: username/password sign-in, opaque HttpOnly browser sessions, explicit sign out, and offline one-time recovery codes.

## Evidence

- Passwords use scrypt and recovery codes are stored as SHA-256 digests; plaintext credentials are not persisted.
- Recovery consumption is atomic and a used code cannot create another session.
- The Studio browser shows a sign-in form when Human access is configured and returns to it after sign out.
- `test/studio-auth.test.js` covers credential validation, secret storage, recovery consumption, and session behavior.
- `docs/user-docs/qa/inspect-local-context.html` and the related manual/release note describe the user-visible flow.
- `npm test`, `npm run validate`, and `git diff --check` pass.

## Boundary

`PWCE_STUDIO_TOKEN` remains the direct API/workload bearer boundary. This slice does not add remote identity providers, account recovery delivery, or production-grade credential custody.
