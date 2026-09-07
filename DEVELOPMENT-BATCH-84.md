# Development Batch 84 — reproducible multi-site Home Assistant development

## Outcome

The development deployment can now run a second isolated Home Assistant installation through the opt-in `multi-site` Compose profile. Home One remains the default. Home Two uses a separate container, configuration directory, and host port.

## Evidence

- `docker-compose.dev.yml` defines `homeassistant-two` under the `multi-site` profile on host port `8124`.
- `scripts/prepare-home-assistant-dev.sh --multi-site` seeds both disposable configuration directories.
- Invalid setup-script arguments fail before any directory is created or modified.
- `HOME_ASSISTANT_DEV.md` and `.env.example` document the second-site binding.
- `docker compose -f docker-compose.dev.yml config --quiet` — passed.
- `npm test` — 78 passing tests.
- `npm run validate` — PV1-T0 profile validation passed with no failures.
- `git diff --check` — passed.

## Safety boundary

The second site is opt-in and isolated. PWCE still requires explicit site scope for reads and rejects cross-site action targets before any external call.
