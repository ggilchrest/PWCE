import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { admissionContracts, admissionSchema } from '../src/actions/admission-contracts.js';
import { admissionEvidence } from '../src/actions/admission-evidence.js';
import { StateStore, emptyState } from '../src/runtime/state-store.js';
import { ActionService } from '../src/actions/action-service.js';
import { createGatewayHttpBinding } from '../src/http/gateway-server.js';
import { canonicalize } from '../src/contract-foundation/canonical-json.js';
import { dispatchBundle } from '../src/gateway/dispatch-bundle.js';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const ajv=new Ajv2020({strict:false});addFormats(ajv);
const schema=JSON.parse(admissionSchema.schemaJson);ajv.addSchema(schema);
const valid=ajv.getSchema(schema.$id), fingerprintValid=ajv.getSchema(schema.$id+'#/$defs/FingerprintInput'), snapshotValid=ajv.getSchema(schema.$id+'#/$defs/RetainedSnapshotDocument'), checkValid=ajv.getSchema(schema.$id+'#/$defs/AdmissionPrecondition');

async function fixture(t,{preconditions=false,unknown=false}={}) {
  const token='synthetic-admission-agent',dispatcherToken='synthetic-admission-trusted-dispatcher-token';
  let calls=0,checks=0;
  const store=new StateStore({state:emptyState()}),actions=new ActionService({store,target:{identity:'synthetic.admission-proof',
    ...(preconditions?{async checkPreconditions(){checks++;return {allowed:true,observed:{z:checks,a:'original field order'},reasonCode:'synthetic_ready'};}}:{}),
    async invoke(){calls++;return unknown?{status:'outcome_unknown',externalEffectOccurred:'unknown'}:{status:'succeeded',externalEffectOccurred:true};}
  }});
  actions.registerGrant({principalRef:'agent.fixture',siteRefs:['home.one'],capabilityRefs:['home.light.set_level']});
  const binding=createGatewayHttpBinding({store,token,dispatcherToken,actionService:actions});
  const server=createServer((req,res)=>binding.handle(req,res,new URL(req.url,'http://127.0.0.1').pathname));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));binding.gateway.close();});
  const send=async(path,body,headers={},method=body===undefined?'GET':'POST')=>{
    const response=await fetch(`http://127.0.0.1:${server.address().port}/gateway/v1${path}`,{method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(3000)});
    return {status:response.status,headers:response.headers,body:await response.json()};
  };
  const identity={assistantRef:'assistant.synthetic',endpointRef:'endpoint.synthetic',participantRefs:['participant.synthetic'],audienceRef:'audience.synthetic'};
  const authority=await send('/authority',{...identity,siteRefs:['home.one']}),scope={...identity,authorityContextRef:authority.body.authorityContextRef,worldRef:'world.personal.v1',executionEnvironmentRef:'test'};
  const snapshot=await send('/request',{...scope,operation:'capabilities.getSnapshot'});
  const request={...scope,profileId:'pwce-agent-gateway.v1',profileVersion:'1.0.0',dispatchProfileId:dispatchBundle.dispatchProfileId,dispatchProfileVersion:dispatchBundle.dispatchProfileVersion,
    operation:'authority.authorizeDispatch',requestId:'synthetic-admission',correlationId:'synthetic-correlation',deadline:new Date(Date.now()+30000).toISOString(),snapshotRef:snapshot.body.snapshotRef,
    capabilityRef:'home.light.set_level',capabilityVersion:'1.0.0',capabilityOperation:'light.set_level',siteRef:'home.one',targetEntityId:'light.synthetic',parameters:{level:0.5},idempotencyKey:'synthetic-original-admission',approvalRequired:false,approvalRef:null};
  const headers={'x-pwce-dispatcher-token':dispatcherToken,'x-pwce-dispatch-contract':dispatchBundle.bundleDigest};
  return {store,actions,send,request,headers,snapshot:snapshot.body,calls:()=>calls,checks:()=>checks};
}

test('public admission profile and complete schema artifacts have reproducible byte pins',async()=>{
  const aggregate=createHash('sha256');
  for(const artifact of admissionContracts.artifacts){const bytes=await readFile(artifact.path);assert.equal(hash(bytes),artifact.sha256);aggregate.update(artifact.path).update('\0').update(bytes);}
  assert.equal(aggregate.digest('hex'),admissionContracts.bundleDigest);
  assert.deepEqual(JSON.parse(await readFile('contracts/action-admission/bundle-manifest.json','utf8')),admissionContracts);
  assert.equal(hash(admissionSchema.schemaJson),admissionSchema.artifact.sha256);assert.equal(Buffer.byteLength(admissionSchema.schemaJson),admissionSchema.artifact.byteLength);
  assert.equal(schema.$id,admissionContracts.schemaRef);assert.deepEqual(admissionContracts.requiredDispatchBundle,{bundleId:dispatchBundle.bundleId,bundleVersion:dispatchBundle.bundleVersion,bundleDigest:dispatchBundle.bundleDigest});
  assert.throws(()=>{admissionContracts.schemaArtifact.sha256='changed';});
});

test('static admission contracts require Agent authentication and cannot issue authority or an action',async t=>{
  const f=await fixture(t),before=await f.store.load();
  const bundle=await f.send('/admission-contracts');assert.equal(bundle.status,200);assert.deepEqual(bundle.body,admissionContracts);assert.equal(bundle.headers.get('cache-control'),'no-store');
  const artifact=await f.send('/admission-contracts/'+admissionSchema.artifact.sha256);assert.equal(artifact.status,200);assert.deepEqual(artifact.body,admissionSchema);
  for(const path of ['/admission-contracts','/admission-contracts/'+admissionSchema.artifact.sha256])assert.equal((await f.send(path,undefined,{authorization:'Bearer wrong'})).status,401);
  assert.equal((await f.send('/admission-contracts',{})).status,405);assert.equal((await f.send('/admission-contracts/'+'0'.repeat(64))).status,404);
  const after=await f.store.load();assert.deepEqual(after.actions,before.actions);assert.deepEqual(after.approvals,before.approvals);assert.equal(f.calls(),0);
});

test('HTTP admission supplies actual durable proof with original snapshot and zero target calls',async t=>{
  const f=await fixture(t),response=await f.send('/dispatch',f.request,f.headers);assert.equal(response.status,200,JSON.stringify(response.body));
  const proof=response.body.admissionEvidence,action=(await f.store.load()).actions[response.body.actionRef];
  assert.ok(valid(proof),JSON.stringify(valid.errors));assert.deepEqual(proof,admissionEvidence(action));
  assert.equal(proof.admittedAt,action.createdAt);assert.equal(proof.deadlineAt,action.deadlineAt);assert.equal(proof.actionRef,action.actionRef);assert.equal(f.calls(),0);
  assert.ok(fingerprintValid(JSON.parse(proof.requestFingerprint)),JSON.stringify(fingerprintValid.errors));
  const snapshot=JSON.parse(proof.capabilitySnapshot.snapshotJson);assert.ok(snapshotValid(snapshot),JSON.stringify(snapshotValid.errors));
  assert.equal(hash(proof.capabilitySnapshot.snapshotJson),proof.capabilitySnapshot.sha256);assert.equal(snapshot.snapshot.snapshotRef,f.snapshot.snapshotRef);assert.equal(snapshot.scope[0],f.request.authorityContextRef);
  assert.equal(Object.hasOwn(proof,'status'),false);assert.equal(Object.hasOwn(proof,'result'),false);
  assert.equal(proof.precondition,null);
});

test('duplicate admission evidence remains identical after completed and unknown target outcomes',async t=>{
  for(const unknown of [false,true]){
    const f=await fixture(t,{unknown}),first=await f.send('/dispatch',f.request,f.headers),original=JSON.stringify(first.body.admissionEvidence);
    const completed=await f.send('/dispatch',{...f.request,operation:'capabilities.invoke',actionRef:first.body.actionRef},f.headers);
    assert.equal(completed.body.status,unknown?'outcome_unknown':'completed');assert.equal(f.calls(),1);
    const duplicate=await f.send('/dispatch',{...f.request,requestId:'synthetic-read-duplicate'},f.headers);
    assert.equal(duplicate.body.duplicate,true);assert.equal(JSON.stringify(duplicate.body.admissionEvidence),original);assert.equal(f.calls(),1);
    assert.equal(duplicate.body.admission.status,unknown?'outcome_unknown':'succeeded');
  }
});

test('admission precondition retains exact original JSON bytes independently of later checks and key reordering',async t=>{
  const f=await fixture(t,{preconditions:true}),first=await f.send('/dispatch',f.request,f.headers),proof=first.body.admissionEvidence;
  assert.equal(first.status,200,JSON.stringify(first.body));assert.ok(valid(proof),JSON.stringify(valid.errors));assert.equal(f.checks(),1);
  const check=JSON.parse(proof.precondition.checkJson);assert.ok(checkValid(check),JSON.stringify(checkValid.errors));assert.equal(hash(proof.precondition.checkJson),proof.precondition.sha256);
  assert.equal(check.result.observed.z,1);assert.equal(check.phase,'admission');
  const reordered=JSON.parse(canonicalize(proof)); // Outer canonicalization cannot alter embedded custody bytes.
  assert.ok(valid(reordered));assert.equal(hash(reordered.precondition.checkJson),proof.precondition.sha256);assert.equal(reordered.precondition.checkJson,proof.precondition.checkJson);
  await f.send('/dispatch',{...f.request,operation:'capabilities.invoke',actionRef:first.body.actionRef},f.headers);assert.equal(f.checks(),2);
  const duplicate=await f.send('/dispatch',f.request,f.headers);assert.deepEqual(duplicate.body.admissionEvidence,proof);assert.equal(f.calls(),1);
});

test('corrupt fingerprints, scope, snapshot, timestamps and precondition bytes cannot produce a proof',async t=>{
  const f=await fixture(t,{preconditions:true}),first=await f.send('/dispatch',f.request,f.headers),action=first.body.admission;
  const changes=[a=>a.requestFingerprint='{}',a=>a.parameters.level=0.8,a=>a.gatewayScope.audienceRef='other',a=>a.grantRevision++,a=>a.createdAt='invalid',a=>a.deadlineAt=new Date(Date.parse(a.createdAt)+60000).toISOString(),a=>a.capabilitySnapshot.sha256='0'.repeat(64),a=>a.preconditionChecks[0].sha256='0'.repeat(64),a=>a.preconditionChecks[0].result.allowed=false,a=>a.approvalRequired=true];
  for(const change of changes){const changed=structuredClone(action);change(changed);assert.throws(()=>admissionEvidence(changed),{code:'admission_evidence_invalid'});}
  const changed=structuredClone(action),document=JSON.parse(changed.capabilitySnapshot.snapshotJson);document.scope[0]='forged';changed.capabilitySnapshot.snapshotJson=JSON.stringify(document);changed.capabilitySnapshot.sha256=hash(changed.capabilitySnapshot.snapshotJson);
  assert.throws(()=>admissionEvidence(changed),{code:'admission_evidence_invalid'});
  for(const patch of [{status:'succeeded'},{admittedAt:'not-time'},{grantRevision:0},{approvalRequired:true,approvalRef:null}])assert.equal(valid({...first.body.admissionEvidence,...patch}),false);
});
