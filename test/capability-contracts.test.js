import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { capabilityContracts, capabilitySchemas } from '../src/actions/capability-contracts.js';
import { capabilitySnapshot } from '../src/actions/capability-catalog.js';
import { StateStore, emptyState } from '../src/runtime/state-store.js';
import { ActionService } from '../src/actions/action-service.js';
import { FixtureActionTarget } from '../src/actions/fixture-target.js';
import { createGatewayHttpBinding } from '../src/http/gateway-server.js';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const ajv=new Ajv2020({strict:false});addFormats(ajv);
const inputSchema=JSON.parse(capabilitySchemas[0].schemaJson),resultSchema=JSON.parse(capabilitySchemas[1].schemaJson);
const inputValid=ajv.compile(inputSchema),resultValid=ajv.compile(resultSchema);
const validInput={siteRef:'home.one',targetEntityId:'light.synthetic',parameters:{level:0.4}};

test('public capability descriptors and schemas have independently reproducible byte pins',async()=>{
 const aggregate=createHash('sha256');
 for(const item of capabilityContracts.artifacts){const bytes=await readFile(item.path);assert.equal(hash(bytes),item.sha256);aggregate.update(item.path).update('\0').update(bytes);}
 assert.equal(aggregate.digest('hex'),capabilityContracts.bundleDigest);
 assert.deepEqual(JSON.parse(await readFile('contracts/capabilities/bundle-manifest.json','utf8')),capabilityContracts);
 for(const value of capabilitySchemas){assert.equal(hash(value.schemaJson),value.artifact.sha256);assert.equal(Buffer.byteLength(value.schemaJson),value.artifact.byteLength);assert.equal(JSON.parse(value.schemaJson).$id,value.artifact.reference);assert.equal(JSON.parse(value.schemaJson).$schema,value.artifact.schemaRef);}
 const descriptor=capabilitySnapshot()[0];assert.ok(descriptor.title&&descriptor.description);
 assert.equal(descriptor.inputSchemaRef,inputSchema.$id);assert.equal(descriptor.resultSchemaRef,resultSchema.$id);
 assert.deepEqual(descriptor.inputSchemaArtifact,capabilitySchemas[0].artifact);assert.deepEqual(descriptor.resultSchemaArtifact,capabilitySchemas[1].artifact);
 assert.throws(()=>{descriptor.inputSchemaArtifact.sha256='changed';});
});

test('published input schema agrees with accepted and rejected light parameters',()=>{
 const actions=new ActionService({store:new StateStore({state:emptyState()}),target:new FixtureActionTarget()});
 actions.registerGrant({principalRef:'agent.fixture',siteRefs:['home.one'],capabilityRefs:['home.light.set_level']});
 for(const level of [0,0.4,1,-0.1,1.1,'0.4',null]){
  const input={...validInput,parameters:{level}};
  assert.equal(inputValid(input),actions.preview({...input,principalRef:'agent.fixture',capabilityRef:'home.light.set_level',operation:'light.set_level',executionEnvironmentRef:'test'}).outcome==='allowed');
 }
 for(const value of [{...validInput,parameters:{}},{...validInput,parameters:{level:0.4,extra:true}},{...validInput,targetEntityId:''},{...validInput,targetEntityId:'x'.repeat(129)},{...validInput,siteRef:'Unscoped'},{...validInput,authority:'granted'}])assert.equal(inputValid(value),false);
});

test('published result schema preserves actual fixture results and rejects false confirmation combinations',async()=>{
 for(const mode of ['normal','unknown','timeout']){
  const store=new StateStore({state:emptyState()}),actions=new ActionService({store,target:new FixtureActionTarget({mode})});
  actions.registerGrant({principalRef:'agent.fixture',siteRefs:['home.one'],capabilityRefs:['home.light.set_level']});
  const admission=await actions.authorizeDispatch({...validInput,principalRef:'agent.fixture',capabilityRef:'home.light.set_level',operation:'light.set_level',executionEnvironmentRef:'test',idempotencyKey:'synthetic-schema-case'});
  const result=await actions.dispatch(admission.action.actionRef);assert.ok(resultValid(result.result),JSON.stringify(resultValid.errors));
 }
 for(const result of [{status:'succeeded',externalEffectOccurred:'unknown'},{status:'outcome_unknown',externalEffectOccurred:false},{status:'denied',externalEffectOccurred:true},{status:'succeeded',externalEffectOccurred:true,grant:'invented'}])assert.equal(resultValid(result),false);
});

test('authenticated schema discovery returns exact public bytes without creating authority or actions',async t=>{
 const store=new StateStore({state:emptyState()}),token='synthetic-schema-gateway-token';
 const binding=createGatewayHttpBinding({store,token});
 const server=createServer((req,res)=>binding.handle(req,res,new URL(req.url,'http://127.0.0.1').pathname));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));binding.gateway.close();});
 const get=async(path,credential=token,method='GET')=>{const response=await fetch(`http://127.0.0.1:${server.address().port}/gateway/v1/capability-contracts${path}`,{method,headers:{authorization:`Bearer ${credential}`},signal:AbortSignal.timeout(2000)});return {status:response.status,headers:response.headers,body:await response.json()};};
 const bundle=await get('');assert.equal(bundle.status,200);assert.deepEqual(bundle.body,capabilityContracts);assert.equal(bundle.headers.get('cache-control'),'no-store');
 for(const schema of capabilitySchemas){const received=await get('/'+schema.artifact.sha256);assert.equal(received.status,200);assert.deepEqual(received.body,schema);assert.equal(hash(received.body.schemaJson),schema.artifact.sha256);assert.equal((await get('/'+schema.artifact.sha256,'wrong')).status,401);}
 assert.equal((await get('','wrong')).status,401);assert.equal((await get('/'+'0'.repeat(64))).status,404);assert.equal((await get('/not-a-digest')).status,404);assert.equal((await get('',token,'POST')).status,405);
 assert.deepEqual((await store.load()).actions,{});assert.deepEqual((await store.load()).approvals,{});
});
