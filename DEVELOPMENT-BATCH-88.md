# Development Batch 88 — second Home Assistant runtime boundary

## Outcome

The opt-in multi-site development profile now has a live second Home Assistant container with isolated storage and host port `8124`. Home One remains on `8123`. Both containers are independently supervised by Docker Compose.

## Evidence

- `docker compose -f docker-compose.dev.yml --profile multi-site up -d homeassistant-two` — container created and started.
- `docker ps` — `pwce-homeassistant-dev-two` is healthy and publishes `8124->8123`.
- `curl http://127.0.0.1:8124/api/` — returns `401 Unauthorized`, confirming the API boundary is protected and the instance needs its own onboarding/token.
- `PV1-T2-CHECKLIST.md` records the authenticated-live-sync boundary as deferred until the second instance is onboarded.

## Safety boundary

The second container has no shared Home Assistant configuration or credentials with Home One. It is not wired into PWCE until its own token is placed in the local secret mechanism.
