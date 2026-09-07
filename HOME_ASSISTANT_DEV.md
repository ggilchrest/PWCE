# Home Assistant development environment

The repository includes a disposable Home Assistant container for local PWCE development.

Prepare the writable Home Assistant state directory, then start it with:

```sh
./scripts/prepare-home-assistant-dev.sh
docker compose -f docker-compose.dev.yml up -d
```

Open [http://127.0.0.1:8123](http://127.0.0.1:8123) and complete Home Assistant's first-run onboarding. Create a Long-Lived Access Token in the Home Assistant profile, then place it in your local secret mechanism. Do not commit the token or put it in this repository.

For a local shell-only smoke test, resolve the configured reference with:

```sh
export PWCE_HA_TOKEN_HOME_ONE='your-token-value'
```

PWCE uses the reference `env://PWCE_HA_TOKEN_HOME_ONE`; the token value is read at runtime and is not persisted in PWCE state.

The container stores all mutable Home Assistant state under `.dev/home-assistant/`, which is ignored by Git. The tracked seed configuration is copied there only when the file does not already exist. The `demo` integration supplies deterministic development entities without connecting to household devices.

To run a second isolated Home Assistant site for multi-site development, prepare and start the opt-in Compose profile:

```sh
./scripts/prepare-home-assistant-dev.sh --multi-site
docker compose -f docker-compose.dev.yml --profile multi-site up -d
```

The second site is available at [http://127.0.0.1:8124](http://127.0.0.1:8124) and keeps its state under `.dev/home-assistant-two/`. Complete its onboarding separately and use `PWCE_HA_URL_HOME_TWO` with `PWCE_HA_TOKEN_HOME_TWO` when binding it to PWCE. The default command still starts only Home One.

Check status with:

```sh
docker compose -f docker-compose.dev.yml ps
curl http://127.0.0.1:8123/api/
```

Create an integrity-checked PWCE state backup with:

```sh
node scripts/pwce-state-backup.mjs
```

Restore a verified backup into the configured PWCE state path with:

```sh
node scripts/pwce-state-backup.mjs --restore path/to/backup.json
```

Restore only after stopping PWCE. A tampered backup is rejected before the state file is changed.

The API call will return `401` until a bearer token is supplied. That is expected. PWCE's adapter boundary uses the same token for REST and `/api/websocket` authentication.

When the PWCE Studio server is running with `PWCE_GATEWAY_TOKEN`, exercise the separate fixture Agent process with:

```sh
PWCE_GATEWAY_TOKEN='your-gateway-token' node scripts/pwce-fixture-agent.mjs 'What is the light state?'
```

The fixture Agent uses only the versioned gateway HTTP contract and has no Home Assistant credentials or effect authority.

Run the PWCE light smoke check in read-only mode:

```sh
node scripts/pwce-live-light-smoke.mjs
```

The script only changes Home Assistant when explicitly run with `--execute`; it sets `light.kitchen_lights` to 40%, verifies the observed state, and restores the original brightness.

Stop and remove the container with:

```sh
docker compose -f docker-compose.dev.yml down
```

The ignored `.dev/home-assistant/` directory is retained so onboarding and local state survive a normal stop. Remove it manually when you intentionally want a clean Home Assistant instance.
