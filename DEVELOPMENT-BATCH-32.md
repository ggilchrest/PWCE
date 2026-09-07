# Development Batch 32 — filtered gateway cursor progress

Status: implemented and verified locally.

## Scope

- Advance filtered gateway cursors across irrelevant site events.
- Preserve page boundaries so matching events are not skipped when a limit is reached.
- Keep event delivery site- and principal-scoped.

## Evidence

- `test/gateway-service.test.js` verifies an Agent watching `home.one` advances past a `home.two` event without receiving it.
- `npm test`: 46 tests passing.
- `npm run validate`: contract fixture validation passing.

The cursor remains an in-memory development stream cursor until durable event-cursor custody is selected.
