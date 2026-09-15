import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const paths = ['contracts/action-admission/profile.json','contracts/action-admission/evidence.schema.json'];
const sources = await Promise.all(paths.map(path => readFile(path)));
const profile = JSON.parse(sources[0]), schema = JSON.parse(sources[1]);
if (profile.schemaRef !== schema.$id || profile.profileId !== 'pwce-action-admission.v1' || profile.profileVersion !== '1.0.0') throw new Error('unsupported admission contract');
for (const [field,path] of [['requiredDispatchBundle','contracts/gateway-dispatch/bundle-manifest.json'],['requiredCapabilityBundle','contracts/capabilities/bundle-manifest.json']]) {
  const dependency=JSON.parse(await readFile(path,'utf8'));
  if (JSON.stringify(profile[field])!==JSON.stringify({bundleId:dependency.bundleId,bundleVersion:dependency.bundleVersion,bundleDigest:dependency.bundleDigest})) throw new Error('admission dependency mismatch');
}
const aggregate = createHash('sha256');
const artifacts = paths.map((path,index) => { aggregate.update(path).update('\0').update(sources[index]); return {path,sha256:createHash('sha256').update(sources[index]).digest('hex')}; });
const artifact = {reference:schema.$id,sha256:artifacts[1].sha256,byteLength:sources[1].length,mediaType:'application/schema+json',schemaRef:schema.$schema};
const bundle = {...profile,digestAlgorithm:'sha256-ordered-path-bytes-v1',bundleDigest:aggregate.digest('hex'),artifacts,schemaArtifact:artifact};
const output = `// Generated exclusively from public action-admission contracts.\nconst freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};\nexport const admissionContracts=freeze(${JSON.stringify(bundle,null,2)});\nexport const admissionSchema=freeze(${JSON.stringify({artifact,schemaJson:sources[1].toString('utf8')},null,2)});\n`;
let matches = true;
for (const [path,value] of [['contracts/action-admission/bundle-manifest.json',JSON.stringify(bundle,null,2)+'\n'],['src/actions/admission-contracts.js',output]]) {
  if (process.argv.includes('--write')) await writeFile(path,value);
  else if (await readFile(path,'utf8').catch(()=>'') !== value) matches = false;
}
console.log(JSON.stringify({bundleId:bundle.bundleId,bundleVersion:bundle.bundleVersion,bundleDigest:bundle.bundleDigest,byteIdentical:matches}));
if (!matches) process.exitCode = 1;
