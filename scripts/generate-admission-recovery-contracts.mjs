import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';
const paths=['contracts/admission-recovery/profile.json','contracts/admission-recovery/request.schema.json','contracts/admission-recovery/response.schema.json'];
const sources=await Promise.all(paths.map(path=>readFile(path))),[profile,request,response]=sources.map(bytes=>JSON.parse(bytes));
if(profile.profileId!=='pwce-admission-recovery.v1'||profile.profileVersion!=='1.0.0'||profile.requestSchemaRef!==request.$id||profile.responseSchemaRef!==response.$id)throw new Error('unsupported admission recovery profile');
for(const [field,path] of [['requiredGatewayBundle','contracts/gateway/bundle-manifest.json'],['requiredAdmissionBundle','contracts/action-admission/bundle-manifest.json']]){
 const dependency=JSON.parse(await readFile(path));if(!isDeepStrictEqual(profile[field],Object.fromEntries(['bundleId','bundleVersion','bundleDigest'].map(key=>[key,dependency[key]]))))throw new Error('admission recovery dependency mismatch');
}
if(!isDeepStrictEqual(response.$defs.OriginalAdmission,JSON.parse(await readFile('contracts/action-admission/evidence.schema.json'))))throw new Error('original admission schema mismatch');
const aggregate=createHash('sha256'),artifacts=paths.map((path,index)=>{aggregate.update(path).update('\0').update(sources[index]);return {path,sha256:createHash('sha256').update(sources[index]).digest('hex')};});
const schemaArtifacts=[request,response].map((schema,i)=>({reference:schema.$id,sha256:artifacts[i+1].sha256,byteLength:sources[i+1].length,mediaType:'application/schema+json',schemaRef:schema.$schema}));
const bundle={...profile,digestAlgorithm:'sha256-ordered-path-bytes-v1',bundleDigest:aggregate.digest('hex'),artifacts,schemaArtifacts};
const output=`// Generated exclusively from public admission-recovery contracts.\nconst freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};\nexport const admissionRecoveryContracts=freeze(${JSON.stringify(bundle,null,2)});\nexport const admissionRecoverySchemas=freeze(${JSON.stringify(sources.slice(1).map((bytes,i)=>({artifact:schemaArtifacts[i],schemaJson:bytes.toString('utf8')})),null,2)});\n`;
let matches=true;
for(const [path,value] of [['contracts/admission-recovery/bundle-manifest.json',JSON.stringify(bundle,null,2)+'\n'],['src/gateway/admission-recovery-contracts.js',output]]){
 if(process.argv.includes('--write'))await writeFile(path,value);else if(await readFile(path,'utf8').catch(()=>'')!==value)matches=false;
}
console.log(JSON.stringify({bundleId:bundle.bundleId,bundleDigest:bundle.bundleDigest,byteIdentical:matches}));if(!matches)process.exitCode=1;
