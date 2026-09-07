import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

function run(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/validate-pwce-compatibility-lock.mjs", ...args], { cwd: process.cwd() });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("compatibility lock CLI requires an explicit lock path", async () => {
  const result = await run([]);
  assert.equal(result.code, 2);
  assert.match(result.stderr, /Usage: node scripts\/validate-pwce-compatibility-lock\.mjs/);
});

test("compatibility lock CLI fails closed for an unreadable lock path", async () => {
  const result = await run(["tmp/no-such-compatibility-lock.json"]);
  assert.equal(result.code, 1);
  assert.equal(JSON.parse(result.stderr).valid, false);
});
