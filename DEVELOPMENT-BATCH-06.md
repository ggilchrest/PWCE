# PWCE development batch 06

## Scope completed

1. Repaired Docker Desktop configuration by removing the nested `/config/configuration.yaml` mount.
2. Added a tracked Home Assistant seed configuration and an ignored writable state directory.
3. Added a seed script that replaces an empty failed-mount placeholder without overwriting an existing configured instance.
4. Corrected the Compose readiness probe to accept Home Assistant's expected unauthenticated `401` response.
5. Started and verified the local Home Assistant container.
6. Verified the supplied development token against Home Assistant and performed a read-only PWCE adapter state request.

## Observed evidence

- Container: `pwce-homeassistant-dev`, healthy on `127.0.0.1:8123`.
- Authenticated Home Assistant API: `200` with `{"message":"API running."}`.
- Demo state inventory: 122 entities, including demo lights and sensors.
- PWCE adapter read: `home.one / ha.one / light.kitchen_lights / state = on`.
- PWCE regression: 25 tests passed; contract validation passed.

The token was used transiently for local verification and was not written to the repository or echoed in output.
