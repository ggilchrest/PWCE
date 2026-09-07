import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createStateBackup, restoreStateBackup } from "../src/runtime/recovery.js";
import { StateStore } from "../src/runtime/state-store.js";

const root = join(fileURLToPath(new URL("..", import.meta.url)));
const statePath = process.env.PWCE_STATE_PATH ?? join(root, ".dev", "pwce", "state.json");
const args = process.argv.slice(2);

if (args[0] === "--restore") {
  if (!args[1]) throw new Error("usage: node scripts/pwce-state-backup.mjs --restore <backup-path>");
  console.log(JSON.stringify(await restoreStateBackup(statePath, args[1])));
} else {
  const destination = args[0] ?? join(root, ".dev", "pwce", "backups", `state-${Date.now()}.json`);
  console.log(JSON.stringify(await createStateBackup(new StateStore({ path: statePath }), destination)));
}
