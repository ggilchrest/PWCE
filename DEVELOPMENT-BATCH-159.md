# Development Batch 159 — authenticate the second Home Assistant site

## Outcome

PWCE now has authenticated read-only synchronization evidence for both separately operated local Home Assistant sites. The primary and secondary sources each reached `online` during startup sync and each admitted a site-qualified `light.kitchen_lights` observation.

## Evidence

- `pwce-homeassistant-dev` and `pwce-homeassistant-dev-two` were healthy Docker containers.
- Authenticated `/api/config` and `/api/states` reads returned `200` from the second Home Assistant instance.
- PWCE startup sync with `PWCE_STUDIO_SYNC_ON_START=true` and `PWCE_STUDIO_LIVE_EVENTS=false` reported both sources as `online` with `state_synced`.
- The resulting observations were qualified as `home.one::light.kitchen_lights` and `home.two::light.kitchen_lights`.
- An authenticated `context.query` through the PWCE gateway returned exactly two current items, one for each site, with the limitation that values remain site-qualified and are not merged.

## Boundary

This proves local authenticated read-only multi-site integration. It does not claim production availability, cross-site value merging, or permission to dispatch effects to the secondary site.
