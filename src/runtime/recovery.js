import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { canonicalize } from "../contract-foundation/canonical-json.js";
import { migrateState } from "./state-store.js";

const BACKUP_FORMAT = "pwce-state-backup.v1";

function digest(state) {
  return createHash("sha256").update(canonicalize(state)).digest("hex");
}

async function writeAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

export async function createStateBackup(store, destination, { now = () => new Date() } = {}) {
  if (!store || typeof store.load !== "function") throw new Error("backup requires a state store");
  if (typeof destination !== "string" || !destination) throw new Error("backup destination is required");
  const state = await store.load();
  const backup = { format: BACKUP_FORMAT, capturedAt: now().toISOString(), schemaVersion: state.schemaVersion, state, integrity: { schemeId: "sha256-jcs-v1", value: digest(state) } };
  await writeAtomic(destination, backup);
  return { format: backup.format, capturedAt: backup.capturedAt, schemaVersion: backup.schemaVersion, integrity: backup.integrity };
}

export async function restoreStateBackup(destination, backupPath) {
  if (typeof destination !== "string" || !destination || typeof backupPath !== "string" || !backupPath) throw new Error("restore destination and backup path are required");
  const backup = JSON.parse(await readFile(backupPath, "utf8"));
  if (backup?.format !== BACKUP_FORMAT || !backup.state || backup.integrity?.schemeId !== "sha256-jcs-v1") throw new Error("unsupported or malformed state backup");
  const state = migrateState(backup.state);
  if (backup.integrity.value !== digest(state)) throw new Error("state backup integrity check failed");
  await writeAtomic(destination, state);
  return { format: backup.format, capturedAt: backup.capturedAt, schemaVersion: state.schemaVersion, integrity: backup.integrity };
}

