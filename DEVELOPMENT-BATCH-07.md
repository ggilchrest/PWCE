# PWCE development batch 07

## Scope completed

1. Environment-backed Home Assistant configuration using opaque `env://` secret references.
2. Home Assistant runtime registration for one site and source.
3. Read-only initial state synchronization into canonical PWCE Observations and Projections.
4. Live WebSocket `state_changed` subscription routed through Observation ingestion.
5. Guarded Home Assistant action target mapping for reversible light level changes.
6. Live action results remain `outcome_unknown` until independent state observation confirms the target state.

## Validation

- `npm test`: 28 tests passed.
- `npm run validate`: 13 contract vectors and 3 manifest digests passed.
- Live read-only sync: `light.kitchen_lights` and `sensor.outside_temperature` ingested from `home.one`.
- Live WebSocket: authenticated and subscribed successfully; Home Assistant `2026.9.1`; zero effect calls.

## Explicit boundary

No real Home Assistant service call was made. Live effect dispatch still requires the existing approval path, an explicit live action request, and independent post-dispatch state reconciliation.
