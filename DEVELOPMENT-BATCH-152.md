# Development Batch 152 — make recovery sign-in reachable

## Outcome

The Studio sign-in form now validates credentials conditionally: username/password sign-in requires both fields, while recovery sign-in accepts a recovery code without requiring placeholder credentials.

## Evidence

- `src/studio/app.js` selects exactly one authentication mode and reports incomplete password credentials locally.
- `node --check src/studio/app.js`, `npm test`, `npm run validate`, and `git diff --check` pass.

## Boundary

The browser still sends recovery codes only over the same-origin local Studio session endpoint. Recovery codes remain one-time and offline-operated.
