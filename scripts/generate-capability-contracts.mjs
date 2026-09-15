import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const catalogPath='contracts/capabilities/catalog.json', catalog=JSON.parse(await readFile(catalogPath,'utf8'));
const paths=[catalogPath,...catalog.capabilities.flatMap(item=>[item.descriptor,item.inputSchema,item.resultSchema])];
if(new Set(paths).size!==paths.length||paths.some(path=>!/^contracts\/capabilities\/[a-z0-9./-]+\.json$/.test(path)||path.includes('..')))throw new Error('invalid public capability artifact paths');
const aggregate=createHash('sha256'),artifacts=[],source=new Map();
for(const path of paths){const bytes=await readFile(path);aggregate.update(path).update('\0').update(bytes);const sha256=createHash('sha256').update(bytes).digest('hex');artifacts.push({path,sha256});source.set(path,{schemaJson:bytes.toString('utf8'),sha256,byteLength:bytes.length});}
const schemas=[],definitions=[];
for(const item of catalog.capabilities){
 const descriptor=JSON.parse(source.get(item.descriptor).schemaJson),refs={};
 for(const [field,schemaField] of [['inputSchema','inputSchemaRef'],['resultSchema','resultSchemaRef']]){
  const stored=source.get(item[field]),schema=JSON.parse(stored.schemaJson);
  if(schema.$id!==descriptor[schemaField])throw new Error('capability schema reference mismatch');
  const artifact={reference:schema.$id,sha256:stored.sha256,byteLength:stored.byteLength,mediaType:'application/schema+json',schemaRef:schema.$schema};
  refs[`${field}Artifact`]=artifact;schemas.push({artifact,schemaJson:stored.schemaJson});
 }
 definitions.push({...descriptor,...refs});
}
const bundle={bundleId:catalog.bundleId,bundleVersion:catalog.bundleVersion,digestAlgorithm:'sha256-ordered-path-bytes-v1',bundleDigest:aggregate.digest('hex'),artifacts,capabilities:definitions};
const output=`// Generated from public capability definitions and schemas.\nconst freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};\nexport const capabilityContracts=freeze(${JSON.stringify(bundle,null,2)});\nexport const capabilitySchemas=freeze(${JSON.stringify(schemas,null,2)});\n`;
let matches=true;
for(const [path,value] of [['contracts/capabilities/bundle-manifest.json',JSON.stringify(bundle,null,2)+'\n'],['src/actions/capability-contracts.js',output]]){
 if(process.argv.includes('--write'))await writeFile(path,value);else if(await readFile(path,'utf8').catch(()=>'')!==value)matches=false;
}
console.log(JSON.stringify({bundleId:bundle.bundleId,bundleVersion:bundle.bundleVersion,bundleDigest:bundle.bundleDigest,byteIdentical:matches}));if(!matches)process.exitCode=1;
