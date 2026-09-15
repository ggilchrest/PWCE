import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const paths = ['contracts/gateway-dispatch/transport.json', 'contracts/gateway-dispatch/request.schema.json', 'contracts/gateway-dispatch/response.schema.json'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const aggregate = createHash('sha256'), artifacts = [];
for (const path of paths) {
  const bytes = await readFile(path);
  aggregate.update(path).update('\0').update(bytes); artifacts.push({ path, sha256: hash(bytes) });
}
const transport = JSON.parse(await readFile(paths[0], 'utf8'));
const bundle = { bundleId: transport.bundleId, bundleVersion: transport.bundleVersion, dispatchProfileId: transport.dispatchProfileId,
  dispatchProfileVersion: transport.dispatchProfileVersion, requiredGatewayBundle: transport.requiredGatewayBundle,
  digestAlgorithm: 'sha256-ordered-path-bytes-v1', bundleDigest: aggregate.digest('hex'), artifacts };
const json = JSON.stringify(bundle, null, 2), source = `// Generated from the public trusted-dispatch contract.\nconst freeze = value => { if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; };\nexport const dispatchBundle = freeze(${json});\n`;
const outputs = [['contracts/gateway-dispatch/bundle-manifest.json', json + '\n'], ['src/gateway/dispatch-bundle.js', source]];
let matches = true;
for (const [path, value] of outputs) {
  if (process.argv.includes('--write')) await writeFile(path, value);
  else if (await readFile(path, 'utf8').catch(() => '') !== value) matches = false;
}
console.log(JSON.stringify({ bundleId: bundle.bundleId, bundleVersion: bundle.bundleVersion, bundleDigest: bundle.bundleDigest, byteIdentical: matches }));
if (!matches) process.exitCode = 1;
