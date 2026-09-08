# Development Batch 150 — document Studio auth configuration

## Outcome

The development environment template now exposes the local Studio username, password, and offline recovery-code settings alongside the existing API bearer setting.

## Evidence

- `.env.example` lists the three Human-auth configuration variables and warns that recovery codes stay offline.
- The prior local Studio authentication tests and documentation remain green.

## Boundary

The template contains no credential values. The generator prints codes only; it does not persist, rotate, or deliver them.
