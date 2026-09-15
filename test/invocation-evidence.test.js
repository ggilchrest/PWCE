import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {StateStore,emptyState} from '../src/runtime/state-store.js';
import {ActionService} from '../src/actions/action-service.js';
import {createGatewayHttpBinding} from '../src/http/gateway-server.js';
import {dispatchBundle} from '../src/gateway/dispatch-bundle.js';
import {invocationContracts,invocationSchema} from '../src/actions/invocation-contracts.js';
import {invocationEvidence} from '../src/actions/invocation-evidence.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
const ajv=new Ajv2020({strict:true,strictRequired:false});addFormats(ajv);const schema=JSON.parse(invocationSchema.schemaJson),valid=ajv.compile(schema);
const proofOf=response=>{assert.equal(response.status,200,JSON.stringify(response.body));assert.ok(valid(response.body.invocationEvidence),JSON.stringify(valid.errors));return response.body.invocationEvidence;};
const admit=async f=>{const response=await f.send('/dispatch',f.request,f.headers);assert.equal(response.status,200,JSON.stringify(response.body));return response.body;};
const invoke=(f,action)=>f.send('/dispatch',{...f.request,operation:'capabilities.invoke',actionRef:action.actionRef},f.headers);
const status=(f,action)=>f.send('/request',{...f.scope,operation:'capabilities.getInvocation',actionRef:action.actionRef});

async function fixture(t,{preconditions=false,status='succeeded',effect=true,reconcileResult=null,invokeGate=null}={}) {
  const token='synthetic-admission-agent',dispatcherToken='synthetic-admission-trusted-dispatcher-token';
  let calls=0,checks=0,reconciliations=0;
  const store=new StateStore({state:emptyState()}),actions=new ActionService({store,target:{identity:'synthetic.admission-proof',
    ...(preconditions?{async checkPreconditions(){checks++;return {allowed:true,observed:{z:checks,a:'original field order'},reasonCode:'synthetic_ready'};}}:{}),
    async invoke(){calls++;if(invokeGate)await invokeGate;return {status,externalEffectOccurred:effect,observed:{synthetic:true}};},
    ...(reconcileResult?{async reconcile(){reconciliations++;return reconcileResult;}}:{})
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
  return {store,actions,send,request,headers,snapshot:snapshot.body,calls:()=>calls,checks:()=>checks,reconciliations:()=>reconciliations,scope};
}

test('public invocation contracts pin original admission and result schemas reproducibly',async()=>{
 const aggregate=createHash('sha256');for(const artifact of invocationContracts.artifacts){const bytes=await readFile(artifact.path);assert.equal(hash(bytes),artifact.sha256);aggregate.update(artifact.path).update('\0').update(bytes);}assert.equal(aggregate.digest('hex'),invocationContracts.bundleDigest);
 assert.deepEqual(JSON.parse(await readFile('contracts/action-invocation/bundle-manifest.json')),invocationContracts);assert.equal(hash(invocationSchema.schemaJson),invocationSchema.artifact.sha256);assert.equal(Buffer.byteLength(invocationSchema.schemaJson),invocationSchema.artifact.byteLength);
 for(const [name,path] of [['OriginalAdmission','contracts/action-admission/evidence.schema.json'],['ProducerResult','contracts/capabilities/light-set-level/result.schema.json']])assert.deepEqual(schema.$defs[name],JSON.parse(await readFile(path)));
 assert.throws(()=>{invocationContracts.schemaArtifact.sha256='changed';});
});

test('invocation contract routes authenticate without creating actions, approvals or target calls',async t=>{
 const f=await fixture(t),before=await f.store.load();assert.deepEqual((await f.send('/invocation-contracts')).body,invocationContracts);assert.deepEqual((await f.send('/invocation-contracts/'+invocationSchema.artifact.sha256)).body,invocationSchema);
 for(const path of ['/invocation-contracts','/invocation-contracts/'+invocationSchema.artifact.sha256])assert.equal((await f.send(path,undefined,{authorization:'Bearer wrong'})).status,401);
 assert.equal((await f.send('/invocation-contracts',{})).status,405);assert.equal((await f.send('/invocation-contracts/'+'0'.repeat(64))).status,404);assert.deepEqual(await f.store.load(),before);assert.equal(f.calls(),0);
});

test('known admitted and succeeded observations retain actual admission, attempt and producer times',async t=>{
 const f=await fixture(t),admitted=await admit(f),before=proofOf(await status(f,admitted));assert.equal(before.status,'admitted');assert.equal(before.attemptRef,null);assert.equal(before.startedAt,null);assert.equal(before.result,null);assert.equal(before.dispatchResult,null);assert.equal(f.calls(),0);
 const completed=proofOf(await invoke(f,admitted)),stored=(await f.store.load()).actions[admitted.actionRef];assert.equal(completed.status,'succeeded');assert.equal(completed.attemptRef,stored.attemptRef);assert.equal(completed.startedAt,stored.startedAt);assert.deepEqual(completed.result,stored.result);assert.deepEqual(completed.dispatchResult,stored.dispatchResult);assert.deepEqual(completed.admissionEvidence,admitted.admissionEvidence);assert.equal(f.calls(),1);
 assert.deepEqual(proofOf(await status(f,admitted)),completed);assert.equal(f.calls(),1);
});

test('all eight producer terminal results remain distinct in actual dispatch and status proof',async t=>{
 for(const [statusValue,effect] of [['succeeded',true],['partially_succeeded',true],['failed',false],['rejected',false],['denied',false],['timed_out','unknown'],['cancelled','unknown'],['outcome_unknown','unknown']]){
  const f=await fixture(t,{status:statusValue,effect}),admitted=await admit(f),proof=proofOf(await invoke(f,admitted));assert.equal(proof.status,statusValue);assert.equal(proof.result.status,statusValue);assert.equal(proof.result.externalEffectOccurred,effect);assert.deepEqual(proofOf(await status(f,admitted)),proof);assert.equal(f.calls(),1);
 }
});

test('read-only confirmation preserves the unknown original dispatch reply and does not resend',async t=>{
 const f=await fixture(t,{status:'outcome_unknown',effect:'unknown',reconcileResult:{status:'succeeded',externalEffectOccurred:true,observed:{source:'synthetic read'}}}),admitted=await admit(f),first=proofOf(await invoke(f,admitted)),confirmed=proofOf(await status(f,admitted));
 assert.equal(first.status,'outcome_unknown');assert.equal(confirmed.status,'succeeded');assert.deepEqual(confirmed.dispatchResult,first.dispatchResult);assert.deepEqual(confirmed.admissionEvidence,first.admissionEvidence);assert.equal(confirmed.attemptRef,first.attemptRef);assert.ok(confirmed.reconciliationRef);assert.equal(confirmed.result.reconciledAt,confirmed.result.completedAt);assert.equal(f.calls(),1);assert.equal(f.reconciliations(),1);
 assert.deepEqual(proofOf(await status(f,admitted)),confirmed);assert.equal(f.reconciliations(),1);assert.equal(f.calls(),1);
});

test('in-flight dispatch produces started proof without fabricating a completed result',async t=>{
 let release;const gate=new Promise(resolve=>{release=resolve;});const f=await fixture(t,{invokeGate:gate}),admitted=await admit(f),pending=invoke(f,admitted);
 try{const deadline=Date.now()+2000;while(!f.calls()&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,5));assert.equal(f.calls(),1);const proof=proofOf(await status(f,admitted));assert.equal(proof.status,'started');assert.ok(proof.attemptRef);assert.ok(proof.startedAt);assert.equal(proof.result,null);assert.equal(proof.dispatchResult,null);}finally{release();await pending;}
});

test('foreign or missing invocation reads disclose no proof and do not query the target',async t=>{
 const f=await fixture(t,{status:'outcome_unknown',effect:'unknown',reconcileResult:{status:'succeeded',externalEffectOccurred:true}}),admitted=await admit(f);await invoke(f,admitted);
 const other={...f.scope,audienceRef:'audience.other'};const auth=await f.send('/authority',{assistantRef:other.assistantRef,endpointRef:other.endpointRef,participantRefs:other.participantRefs,audienceRef:other.audienceRef,siteRefs:['home.one']});
 for(const request of [{...other,authorityContextRef:auth.body.authorityContextRef,actionRef:admitted.actionRef},{...f.scope,actionRef:randomUUID()}]){const response=await f.send('/request',{...request,operation:'capabilities.getInvocation'});assert.equal(response.status,200);assert.equal(response.body.status,'unknown');assert.equal(response.body.invocationEvidence,undefined);}
 assert.equal(f.reconciliations(),0);assert.equal(f.calls(),1);
});

test('malformed results and changed admission, attempt or timestamps cannot produce proof',async t=>{
 const f=await fixture(t),admitted=await admit(f);await invoke(f,admitted);const action=(await f.store.load()).actions[admitted.actionRef];
 for(const change of [a=>a.parameters.level=0.9,a=>a.attemptRef=null,a=>a.startedAt='bad',a=>a.result.status='denied',a=>a.result.externalEffectOccurred=false,a=>a.result.completedAt='bad',a=>a.result.completedAt=new Date(0).toISOString(),a=>a.result.reconciledAt=a.result.completedAt,a=>a.dispatchResult.observed={changed:true},a=>a.result.extra=true]){const other=structuredClone(action);change(other);assert.throws(()=>invocationEvidence(other));}
 const proof=invocationEvidence(action);for(const patch of [{status:'completed'},{attemptRef:'bad'},{extra:true},{result:{status:'succeeded',externalEffectOccurred:false}}])assert.equal(valid({...proof,...patch}),false);
 await f.store.transaction(state=>{state.actions[admitted.actionRef].result.extra=true;});const invalid=await status(f,admitted);assert.notEqual(invalid.status,200);assert.equal(invalid.body.invocationEvidence,undefined);assert.equal(f.calls(),1);
});

test('tampered reconciliation bytes or current result cannot replace the retained prior observation',async t=>{
 const f=await fixture(t,{status:'outcome_unknown',effect:'unknown',reconcileResult:{status:'succeeded',externalEffectOccurred:true}}),admitted=await admit(f);await invoke(f,admitted);await status(f,admitted);const original=(await f.store.load()).actions[admitted.actionRef];
 for(const change of [a=>a.reconciliations[0].sha256='0'.repeat(64),a=>a.reconciliations[0].attemptRef=randomUUID(),a=>a.result.observed={forged:true},a=>a.reconciliations=[]]){const changed=structuredClone(original);change(changed);assert.throws(()=>invocationEvidence(changed),{code:'invocation_evidence_invalid'});}
 assert.equal(invocationEvidence(original).dispatchResult.status,'outcome_unknown');
});

test('a failed reply with unknown physical effect remains reconcilable without another invocation',async t=>{
 const f=await fixture(t,{status:'failed',effect:'unknown',reconcileResult:{status:'succeeded',externalEffectOccurred:true}}),admitted=await admit(f),first=proofOf(await invoke(f,admitted));assert.equal(first.result.status,'failed');assert.equal(first.result.externalEffectOccurred,'unknown');
 const confirmed=proofOf(await status(f,admitted));assert.equal(confirmed.status,'succeeded');assert.deepEqual(confirmed.dispatchResult,first.dispatchResult);assert.equal(f.calls(),1);assert.equal(f.reconciliations(),1);
});
