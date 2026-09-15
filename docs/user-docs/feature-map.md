# PWCE user feature map

| Feature | Journey page | QA script | Entry points | Key source paths | Last updated |
|---|---|---|---|---|---|
| Ask the home with the local Basic Agent | manual/ask-the-home.html | qa/ask-the-home.html | `/`, `/api/agent`, `/api/agent/message` | `src/agent/`, `src/studio/`, `src/http/` | 2026-09-15 |
| Inspect local context and request a safe action | manual/inspect-local-context.html | qa/inspect-local-context.html | `/`, `/api/session`, `/api/health`, `/api/sites`, `/api/context/current`, `/api/actions/preview`, `/api/approvals`, `/api/approvals/:approvalRef`, `/api/actions/dispatch`, `/gateway/v1/authority`, `/gateway/v1/request` (including original invocation status), `/gateway/v1/events` | `src/studio/`, `src/http/`, `src/actions/`, `src/runtime/state-store.js`, `src/gateway/`, `src/domain/`, `scripts/gateway-fixture-server.mjs`; Lifestream scoped read-session adapter and authenticated conversation preparation | 2026-09-15 |
