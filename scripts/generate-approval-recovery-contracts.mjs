import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';
const paths=['contracts/approval-recovery/profile.json','contracts/approval-recovery/request.schema.json','contracts/approval-recovery/response.schema.json','contracts/approval-recovery/evidence.schema.json'];
const sources=await Promise.all(paths.map(path=>readFile(path))),[profile,request,response,evidence]=sources.map(bytes=>JSON.parse(bytes));
if(profile.profileId!=='pwce-approval-recovery.v1'||profile.profileVersion!=='1.0.0'||profile.requestSchemaRef!==request.$id||profile.responseSchemaRef!==response.$id)throw new Error('unsupported approval recovery profile');
for(const [field,path] of [['requiredGatewayBundle','contracts/gateway/bundle-manifest.json'],['requiredDispatchBundle','contracts/gateway-dispatch/bundle-manifest.json']]){
 const dependency=JSON.parse(await readFile(path));if(!isDeepStrictEqual(profile[field],Object.fromEntries(['bundleId','bundleVersion','bundleDigest'].map(key=>[key,dependency[key]]))))throw new Error('approval recovery dependency mismatch');
}
if(!isDeepStrictEqual(response.$defs.OriginalApproval,JSON.parse(await readFile('contracts/approval-recovery/evidence.schema.json'))))throw new Error('original admission schema mismatch');
const aggregate=createHash('sha256'),artifacts=paths.map((path,index)=>{aggregate.update(path).update('\0').update(sources[index]);return {path,sha256:createHash('sha256').update(sources[index]).digest('hex')};});
const schemaArtifacts=[request,response,evidence].map((schema,i)=>({reference:schema.$id,sha256:artifacts[i+1].sha256,byteLength:sources[i+1].length,mediaType:'application/schema+json',schemaRef:schema.$schema}));
const bundle={...profile,digestAlgorithm:'sha256-ordered-path-bytes-v1',bundleDigest:aggregate.digest('hex'),artifacts,schemaArtifacts};
const output=`// Generated exclusively from public approval-recovery contracts.\nconst freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};\nexport const approvalRecoveryContracts=freeze(${JSON.stringify(bundle,null,2)});\nexport const approvalRecoverySchemas=freeze(${JSON.stringify(sources.slice(1).map((bytes,i)=>({artifact:schemaArtifacts[i],schemaJson:bytes.toString('utf8')})),null,2)});\n`;
let matches=true;
for(const [path,value] of [['contracts/approval-recovery/bundle-manifest.json',JSON.stringify(bundle,null,2)+'\n'],['src/gateway/approval-recovery-contracts.js',output]]){
 if(process.argv.includes('--write'))await writeFile(path,value);else if(await readFile(path,'utf8').catch(()=>'')!==value)matches=false;
}
console.log(JSON.stringify({bundleId:bundle.bundleId,bundleDigest:bundle.bundleDigest,byteIdentical:matches}));if(!matches)process.exitCode=1;
