import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {admissionRecoveryContracts as bundle,admissionRecoverySchemas} from '../src/gateway/admission-recovery-contracts.js';
import {validateAdmissionRecoveryRequest} from '../src/gateway/admission-recovery-validation.js';
import {StateStore,emptyState} from '../src/runtime/state-store.js';
import {ActionService} from '../src/actions/action-service.js';
import {GatewayService} from '../src/gateway/gateway-service.js';
import {actionFingerprint} from '../src/actions/approval-service.js';
import {createGatewayHttpBinding} from '../src/http/gateway-server.js';
import {dispatchBundle} from '../src/gateway/dispatch-bundle.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
const ajv=new Ajv2020({strict:true,strictRequired:false});addFormats(ajv);
const [validRequest,validResponse]=admissionRecoverySchemas.map(item=>ajv.compile(JSON.parse(item.schemaJson)));

async function fixture(t,{persistent=false,unknown=false}={}){
 let now=Date.now(),calls=0,checks=0,reconciles=0;
 const clock=()=>new Date(now),token='synthetic-recovery-agent',dispatcherToken='synthetic-recovery-trusted-dispatcher-token';
 const dir=persistent?await mkdtemp(join(tmpdir(),'pwce-admission-recovery-')):null,path=dir?join(dir,'state.json'):null;
 if(dir)t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=new StateStore(path?{path}:{state:emptyState()});
 const target={identity:'synthetic.recovery-proof',async checkPreconditions(){checks++;return {allowed:true,observed:{synthetic:true},reasonCode:'synthetic_ready'};},async invoke(){calls++;return {status:unknown?'outcome_unknown':'succeeded',externalEffectOccurred:unknown?'unknown':true};},async getInvocation(){reconciles++;return {status:'succeeded',externalEffectOccurred:true};}};
 const actions=new ActionService({store,target,clock});actions.registerGrant({principalRef:'agent.fixture',siteRefs:['home.one'],capabilityRefs:['home.light.set_level']});
 const gateway=new GatewayService({store,actionService:actions,clock}),binding=createGatewayHttpBinding({store,token,dispatcherToken,actionService:actions,gateway});
 const server=createServer((req,res)=>binding.handle(req,res,new URL(req.url,'http://127.0.0.1').pathname));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));gateway.close();});
 const send=async(route,body,headers={},method=body===undefined?'GET':'POST')=>{
  const response=await fetch(`http://127.0.0.1:${server.address().port}/gateway/v1${route}`,{method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json',...headers},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)}),signal:AbortSignal.timeout(3000)});
  return {status:response.status,headers:response.headers,body:await response.json()};
 };
 const identity={assistantRef:'assistant.synthetic',endpointRef:'endpoint.synthetic',participantRefs:['participant.one','participant.two'],audienceRef:'audience.synthetic'};
 const authority=await send('/authority',{...identity,siteRefs:['home.one']}),scope={...identity,authorityContextRef:authority.body.authorityContextRef,worldRef:'world.personal.v1',executionEnvironmentRef:'test'};
 const snapshot=(await send('/request',{...scope,operation:'capabilities.getSnapshot'})).body;
 const request={...scope,profileId:'pwce-agent-gateway.v1',profileVersion:'1.0.0',dispatchProfileId:dispatchBundle.dispatchProfileId,dispatchProfileVersion:dispatchBundle.dispatchProfileVersion,operation:'authority.authorizeDispatch',requestId:'synthetic-admission',correlationId:'synthetic-correlation',deadline:new Date(now+30000).toISOString(),snapshotRef:snapshot.snapshotRef,capabilityRef:'home.light.set_level',capabilityVersion:'1.0.0',capabilityOperation:'light.set_level',siteRef:'home.one',targetEntityId:'light.synthetic',parameters:{level:0.5},idempotencyKey:'synthetic-original-admission',approvalRequired:false,approvalRef:null};
 const dispatchHeaders={'x-pwce-dispatcher-token':dispatcherToken,'x-pwce-dispatch-contract':dispatchBundle.bundleDigest},headers={'x-pwce-admission-recovery-contract':bundle.bundleDigest};
 const fingerprint=actionFingerprint({...request,operation:request.capabilityOperation,principalRef:'agent.fixture',gatewayScope:{worldRef:request.worldRef,...identity}});
 const query=()=>({...structuredClone(scope),profileId:'pwce-agent-gateway.v1',profileVersion:'1.0.0',recoveryProfileId:bundle.profileId,recoveryProfileVersion:bundle.profileVersion,operation:'authority.recoverAdmission',requestId:randomUUID(),correlationId:request.correlationId,deadline:new Date(now+30000).toISOString(),idempotencyKey:request.idempotencyKey,requestFingerprint:fingerprint,originalSnapshotRef:request.snapshotRef,approvalRequired:request.approvalRequired,approvalRef:request.approvalRef});
 return {token,path,target,store,actions,gateway,send,request,query,headers,dispatchHeaders,clock,advance:ms=>{now+=ms;},calls:()=>calls,checks:()=>checks,reconciles:()=>reconciles};
}
const recover=f=>f.send('/admission-recovery',f.query(),f.headers);
const admitted=f=>f.send('/dispatch',f.request,f.dispatchHeaders);
const unknown=result=>{assert.equal(result.status,200,JSON.stringify(result.body));assert.ok(validResponse(result.body),JSON.stringify(validResponse.errors));assert.equal(result.body.status,'unknown');assert.equal(result.body.actionRef,null);assert.equal(result.body.admissionEvidence,null);};

test('recovery bundle and complete strict schemas preserve exact public dependencies and artifact bytes',async()=>{
 const aggregate=createHash('sha256');for(const artifact of bundle.artifacts){const bytes=await readFile(artifact.path);assert.equal(hash(bytes),artifact.sha256);aggregate.update(artifact.path).update('\0').update(bytes);}assert.equal(aggregate.digest('hex'),bundle.bundleDigest);
 assert.deepEqual(JSON.parse(await readFile('contracts/admission-recovery/bundle-manifest.json','utf8')),bundle);
 for(const item of admissionRecoverySchemas){assert.equal(hash(item.schemaJson),item.artifact.sha256);assert.equal(Buffer.byteLength(item.schemaJson),item.artifact.byteLength);}
 assert.deepEqual(JSON.parse(admissionRecoverySchemas[1].schemaJson).$defs.OriginalAdmission,JSON.parse(await readFile('contracts/action-admission/evidence.schema.json')));
 assert.throws(()=>{bundle.routes.query.method='GET';});
});

test('read-only recovery requires Agent authentication, exact contract and its dedicated route',async t=>{
 const f=await fixture(t),before=await f.store.load();
 assert.deepEqual((await f.send('/admission-recovery/bundle')).body,bundle);
 assert.equal((await f.send('/admission-recovery/bundle',undefined,{authorization:'Bearer wrong'})).status,401);
 assert.equal((await f.send('/admission-recovery/bundle',{})).status,405);
 assert.equal((await f.send('/admission-recovery',undefined,f.headers)).status,405);
 assert.equal((await f.send('/admission-recovery',f.query(),{...f.headers,authorization:'Bearer wrong'})).status,401);
 assert.equal((await f.send('/admission-recovery',f.query())).status,409);
 assert.equal((await f.send('/request',f.query())).body.error.code,'unsupported_operation');
 assert.equal((await f.send('/admission-recovery',{...f.query(),token:f.token},f.headers)).body.error.code,'invalid_request');
 const after=await f.store.load();assert.deepEqual(after.actions,before.actions);assert.deepEqual(after.approvals,before.approvals);assert.equal(f.calls(),0);assert.equal(f.checks(),0);
});

test('lost admission reply recovers exact original proof using only information known before admission',async t=>{
 const f=await fixture(t);assert.ok(validRequest(f.query()),JSON.stringify(validRequest.errors));
 await admitted(f); // Deliberately discard the entire reply, including actionRef.
 const before=await f.store.load(),response=await recover(f);assert.equal(response.status,200,JSON.stringify(response.body));assert.ok(validResponse(response.body),JSON.stringify(validResponse.errors));
 const original=Object.values(before.actions)[0];assert.equal(response.body.actionRef,original.actionRef);assert.equal(response.body.admissionEvidence.admittedAt,original.createdAt);assert.equal(response.body.admissionEvidence.deadlineAt,original.deadlineAt);
 assert.equal(response.body.admissionEvidence.requestFingerprint,f.query().requestFingerprint);assert.equal(response.body.admissionEvidence.capabilitySnapshot.snapshotJson,original.capabilitySnapshot.snapshotJson);
 const again=await recover(f);assert.deepEqual(again.body.admissionEvidence,response.body.admissionEvidence);
 const after=await f.store.load();assert.deepEqual(after.actions,before.actions);assert.deepEqual(after.approvals,before.approvals);assert.equal(f.checks(),1);assert.equal(f.calls(),0);assert.equal(f.reconciles(),0);
});

test('absent and altered original tuples remain unknown without creating an action',async t=>{
 const f=await fixture(t);unknown(await recover(f));assert.equal(Object.keys((await f.store.load()).actions).length,0);await admitted(f);
 for(const change of [q=>q.idempotencyKey='missing',q=>q.requestFingerprint='{}',q=>q.originalSnapshotRef=randomUUID(),q=>q.approvalRequired=true,q=>q.approvalRef='different']){
  const query=f.query();change(query);unknown(await f.send('/admission-recovery',query,f.headers));
 }
 assert.equal(Object.keys((await f.store.load()).actions).length,1);assert.equal(f.checks(),1);assert.equal(f.calls(),0);
});

test('current foreign identity, participant order, environment and new contexts cannot recover an original record',async t=>{
 const f=await fixture(t);await admitted(f);
 for(const field of ['assistantRef','endpointRef','audienceRef']){
  const query=f.query();query[field]='foreign';assert.equal((await f.send('/admission-recovery',query,f.headers)).status,403);
  const identity={assistantRef:query.assistantRef,endpointRef:query.endpointRef,audienceRef:query.audienceRef,participantRefs:query.participantRefs};
  query.authorityContextRef=(await f.send('/authority',{...identity,siteRefs:['home.one']})).body.authorityContextRef;unknown(await f.send('/admission-recovery',query,f.headers));
 }
 const reordered=f.query();reordered.participantRefs.reverse();assert.equal((await f.send('/admission-recovery',reordered,f.headers)).status,403);
 unknown(await f.send('/admission-recovery',{...f.query(),executionEnvironmentRef:'simulation'},f.headers));
 const query=f.query(),newContext=(await f.send('/authority',{assistantRef:query.assistantRef,endpointRef:query.endpointRef,audienceRef:query.audienceRef,participantRefs:query.participantRefs,siteRefs:['home.one']})).body;
 unknown(await f.send('/admission-recovery',{...query,authorityContextRef:newContext.authorityContextRef},f.headers));
 assert.equal(f.calls(),0);assert.equal(f.checks(),1);
});

test('original deadline and discovery expiry do not renew or hide historical admission',async t=>{
 const f=await fixture(t),first=await admitted(f);f.advance(90000);
 const response=await recover(f);assert.equal(response.status,200,JSON.stringify(response.body));assert.equal(response.body.status,'known');assert.deepEqual(response.body.admissionEvidence,first.body.admissionEvidence);
 assert.ok(Date.parse(response.body.admissionEvidence.deadlineAt)<f.clock().valueOf());assert.equal(f.checks(),1);assert.equal(f.calls(),0);
 f.advance(300000);assert.equal((await recover(f)).status,401);
});

test('revocation before or during the read withholds original evidence',async t=>{
 for(const during of [false,true]){
  const f=await fixture(t);await admitted(f);const revoke=()=>f.actions.registerGrant({principalRef:'agent.fixture',siteRefs:[],capabilityRefs:[]});
  if(during){const find=f.actions.findAdmission.bind(f.actions);f.actions.findAdmission=async key=>{const result=await find(key);revoke();return result;};}else revoke();
  const result=await recover(f);assert.equal(result.status,401);assert.equal(result.body.error.code,'authority_context_invalidated');assert.equal(result.body.admissionEvidence,undefined);assert.equal(f.calls(),0);
 }
});

test('completed and uncertain invocation outcomes do not change recovered admission or trigger target reconciliation',async t=>{
 for(const uncertain of [false,true]){
  const f=await fixture(t,{unknown:uncertain}),first=await admitted(f);await f.send('/dispatch',{...f.request,operation:'capabilities.invoke',actionRef:first.body.actionRef},f.dispatchHeaders);
  const before=await f.store.load(),response=await recover(f);assert.equal(response.status,200,JSON.stringify(response.body));assert.deepEqual(response.body.admissionEvidence,first.body.admissionEvidence);assert.deepEqual((await f.store.load()).actions,before.actions);assert.equal(f.calls(),1);assert.equal(f.checks(),2);assert.equal(f.reconciles(),0);
 }
});

test('durable admission can be read from a newly opened owner without authorizing or dispatching',async t=>{
 const f=await fixture(t,{persistent:true});await admitted(f);const recovered=await recover(f);
 const reopened=new StateStore({path:f.path}),actions=new ActionService({store:reopened,target:f.target,clock:f.clock}),record=await actions.findAdmission(f.request.idempotencyKey);
 assert.equal(record.actionRef,recovered.body.actionRef);assert.equal(record.deadlineAt,f.request.deadline);record.parameters.level=1;assert.equal((await actions.findAdmission(f.request.idempotencyKey)).parameters.level,0.5);assert.equal(f.calls(),0);assert.equal(f.checks(),1);
});

test('corrupt qualified custody fails closed and legacy unqualified records do not acquire invented proof',async t=>{
 for(const change of [a=>a.capabilitySnapshot.sha256='0'.repeat(64),a=>a.preconditionChecks[0].sha256='0'.repeat(64),a=>a.parameters.level=0.9,a=>a.createdAt='invalid']){
  const f=await fixture(t),first=await admitted(f);await f.store.transaction(state=>change(state.actions[first.body.actionRef]));const response=await recover(f);assert.equal(response.status,400);assert.equal(response.body.error.code,'admission_evidence_invalid');assert.equal(f.calls(),0);
 }
 const f=await fixture(t),first=await admitted(f);await f.store.transaction(state=>{state.actions[first.body.actionRef].targetIdentity=null;});const result=await recover(f);unknown(result);assert.equal(result.body.reason,'original_evidence_unavailable');
});

test('duplicate original keys are corruption rather than selection of an arbitrary admission',async t=>{
 const f=await fixture(t),first=await admitted(f);await f.store.transaction(state=>{const id=randomUUID();state.actions[id]={...structuredClone(state.actions[first.body.actionRef]),actionRef:id};});
 assert.equal((await recover(f)).body.error.code,'admission_evidence_invalid');assert.equal(f.calls(),0);assert.equal(f.checks(),1);
});

test('malformed, oversized and expired queries are rejected before original custody lookup',async t=>{
 const f=await fixture(t);let reads=0;f.actions.findAdmission=async()=>{reads++;throw new Error('must not run');};
 for(const change of [q=>delete q.audienceRef,q=>q.requestFingerprint='x'.repeat(32769),q=>q.participantRefs=['duplicate','duplicate'],q=>q.approvalRequired='yes',q=>q.deadline='2026-02-30T00:00:00Z',q=>q.extra=true,q=>q.operation='capabilities.invoke',q=>q.recoveryProfileVersion='2.0.0']){const query=f.query();change(query);assert.throws(()=>validateAdmissionRecoveryRequest(query));assert.equal((await f.send('/admission-recovery',query,f.headers)).status,400);}
 assert.equal((await f.send('/admission-recovery',' '.repeat(65536)+JSON.stringify(f.query()),f.headers)).body.error.code,'limit_exceeded');
 for(const delta of [-1,30001])assert.equal((await f.send('/admission-recovery',{...f.query(),deadline:new Date(f.clock().valueOf()+delta).toISOString()},f.headers)).body.error.code,'deadline_exceeded');
 const original=f.query(),pending=f.gateway.recoverAdmissionAuthenticated({token:f.token,...original});await pending.catch(()=>{});assert.equal(reads,1);
});

test('foreign principal and reduced site authority cannot recover another owner admission',async t=>{
 const f=await fixture(t);await admitted(f);const query=f.query(),otherToken='synthetic-other-principal-token';
 f.gateway.registerPrincipal({principalRef:'agent.other',token:otherToken,siteRefs:['home.one']});
 const context=f.gateway.issueAuthorityContext({principalRef:'agent.other',token:otherToken,siteRefs:['home.one'],assistantRef:query.assistantRef,endpointRef:query.endpointRef,audienceRef:query.audienceRef,participantRefs:query.participantRefs});
 const result=await f.gateway.recoverAdmissionAuthenticated({...query,authorityContextRef:context.authorityContextRef,token:otherToken});assert.equal(result.status,'unknown');assert.equal(result.actionRef,null);
 f.gateway.registerPrincipal({principalRef:'agent.fixture',token:f.token,siteRefs:['home.other']});
 assert.equal((await recover(f)).body.error.code,'authority_context_invalidated');assert.equal(f.calls(),0);
});

test('deadline expiry during custody lookup and failed request audit release no evidence',async t=>{
 const expired=await fixture(t);await admitted(expired);const find=expired.actions.findAdmission.bind(expired.actions);
 expired.actions.findAdmission=async key=>{const original=await find(key);expired.advance(30001);return original;};
 const late=await recover(expired);assert.equal(late.body.error.code,'deadline_exceeded');assert.equal(late.body.admissionEvidence,undefined);assert.equal(expired.calls(),0);
 const f=await fixture(t);await admitted(f);const transaction=f.store.transaction.bind(f.store);f.store.transaction=async()=>{throw new Error('synthetic audit persistence unavailable');};
 const failed=await recover(f);assert.equal(failed.status,400);assert.equal(failed.body.admissionEvidence,undefined);assert.equal(f.calls(),0);f.store.transaction=transaction;
});
