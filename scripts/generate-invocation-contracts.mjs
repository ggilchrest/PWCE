import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';
const paths=['contracts/action-invocation/profile.json','contracts/action-invocation/evidence.schema.json'];
const sources=await Promise.all(paths.map(path=>readFile(path))),profile=JSON.parse(sources[0]),schema=JSON.parse(sources[1]);
if(profile.profileId!=='pwce-action-invocation.v1'||profile.profileVersion!=='1.0.1'||profile.schemaRef!==schema.$id)throw new Error('unsupported invocation contract');
for(const [field,path] of [['requiredAdmissionBundle','contracts/action-admission/bundle-manifest.json'],['requiredCapabilityBundle','contracts/capabilities/bundle-manifest.json'],['requiredDispatchBundle','contracts/gateway-dispatch/bundle-manifest.json']]){
 const dependency=JSON.parse(await readFile(path));if(!isDeepStrictEqual(profile[field],Object.fromEntries(['bundleId','bundleVersion','bundleDigest'].map(key=>[key,dependency[key]]))))throw new Error('invocation dependency mismatch');
}
for(const [name,path] of [['OriginalAdmission','contracts/action-admission/evidence.schema.json'],['ProducerResult','contracts/capabilities/light-set-level/result.schema.json']])if(!isDeepStrictEqual(schema.$defs[name],JSON.parse(await readFile(path))))throw new Error('embedded public schema differs from its dependency');
const aggregate=createHash('sha256'),artifacts=paths.map((path,index)=>{aggregate.update(path).update('\0').update(sources[index]);return {path,sha256:createHash('sha256').update(sources[index]).digest('hex')};});
const artifact={reference:schema.$id,sha256:artifacts[1].sha256,byteLength:sources[1].length,mediaType:'application/schema+json',schemaRef:schema.$schema};
const bundle={...profile,digestAlgorithm:'sha256-ordered-path-bytes-v1',bundleDigest:aggregate.digest('hex'),artifacts,schemaArtifact:artifact};
const output=`// Generated exclusively from public action-invocation contracts.\nconst freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};\nexport const invocationContracts=freeze(${JSON.stringify(bundle,null,2)});\nexport const invocationSchema=freeze(${JSON.stringify({artifact,schemaJson:sources[1].toString('utf8')},null,2)});\n`;
let matches=true;for(const [path,value] of [['contracts/action-invocation/bundle-manifest.json',JSON.stringify(bundle,null,2)+'\n'],['src/actions/invocation-contracts.js',output]]){if(process.argv.includes('--write'))await writeFile(path,value);else if(await readFile(path,'utf8').catch(()=>'')!==value)matches=false;}
console.log(JSON.stringify({bundleId:bundle.bundleId,bundleDigest:bundle.bundleDigest,byteIdentical:matches}));if(!matches)process.exitCode=1;
