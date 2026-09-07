import { readFile } from "node:fs/promises";
import { validateCompatibilityLock } from "../src/gateway/compatibility-lock.js";

const path = process.argv[2];
if (!path) {
  console.error("Usage: node scripts/validate-pwce-compatibility-lock.mjs <lock.json>");
  process.exitCode = 2;
} else {
  try {
    const lock = JSON.parse(await readFile(path, "utf8"));
    const errors = validateCompatibilityLock(lock);
    if (errors.length) {
      console.error(JSON.stringify({ valid: false, errors }, null, 2));
      process.exitCode = 1;
    } else {
      console.log(JSON.stringify({ valid: true, lockVersion: lock.lockVersion, environment: lock.environment }, null, 2));
    }
  } catch (error) {
    console.error(JSON.stringify({ valid: false, error: error.message }, null, 2));
    process.exitCode = 1;
  }
}
