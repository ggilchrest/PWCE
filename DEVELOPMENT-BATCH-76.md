# Development Batch 76 — Backup and restore CLI

Status: implemented and verified locally.

## Scope

- Expose the integrity-checked state backup and restore boundary through `scripts/pwce-state-backup.mjs`.
- Use the configured `PWCE_STATE_PATH`, with an ignored development backup directory by default.
- Reject tampered backups before replacing the restore target.
- Document stop, backup, and restore usage for the local development environment.

## Evidence

- CLI smoke created and restored a `pwce-state-backup.v1` artifact in an isolated temporary path.
- `npm test`: 73 tests passing.
- `npm run validate`: contract fixture validation passing.
- `node --check scripts/pwce-state-backup.mjs`: passing.
- `git diff --check`: passing.
