import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {approvalRecoveryContracts as bundle,approvalRecoverySchemas} from '../src/gateway/approval-recovery-contracts.js';
import {StateStore,emptyState} from '../src/runtime/state-store.js';
import {ActionService} from '../src/actions/action-service.js';
import {ApprovalService,actionFingerprint} from '../src/actions/approval-service.js';
import {GatewayService} from '../src/gateway/gateway-service.js';
import {createGatewayHttpBinding} from '../src/http/gateway-server.js';
import {dispatchBundle} from '../src/gateway/dispatch-bundle.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
const [validRequest,validResponse,validEvidence]=approvalRecoverySchemas.map(item=>{const ajv=new Ajv2020({strict:true,strictRequired:false});addFormats(ajv);return ajv.compile(JSON.parse(item.schemaJson));});
async function fixture(t,{persistent=false,unknown=false}={}){
 let now=Date.now(),calls=0,checks=0,reconciles=0;
 const clock=()=>new Date(now),token='synthetic-recovery-agent',dispatcherToken='synthetic-recovery-trusted-dispatcher-token';
 const dir=persistent?await mkdtemp(join(tmpdir(),'pwce-admission-recovery-')):null,path=dir?join(dir,'state.json'):null;
 if(dir)t.after(()=>rm(dir,{recursive:true,force:true}));
 const store=new StateStore(path?{path}:{state:emptyState()});
 const target={identity:'synthetic.recovery-proof',async checkPreconditions(){checks++;return {allowed:true,observed:{synthetic:true},reasonCode:'synthetic_ready'};},async invoke(){calls++;return {status:unknown?'outcome_unknown':'succeeded',externalEffectOccurred:unknown?'unknown':true};},async getInvocation(){reconciles++;return {status:'succeeded',externalEffectOccurred:true};}};
 const approvals=new ApprovalService({store,clock});const actions=new ActionService({store,target,clock,approvalService:approvals});actions.registerGrant({principalRef:'agent.fixture',siteRefs:['home.one'],capabilityRefs:['home.light.set_level']});
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
 const request={...scope,profileId:'pwce-agent-gateway.v1',profileVersion:'1.0.0',dispatchProfileId:dispatchBundle.dispatchProfileId,dispatchProfileVersion:dispatchBundle.dispatchProfileVersion,operation:'authority.authorizeDispatch',requestId:'synthetic-admission',correlationId:'synthetic-correlation',deadline:new Date(now+30000).toISOString(),snapshotRef:snapshot.snapshotRef,capabilityRef:'home.light.set_level',capabilityVersion:'1.0.0',capabilityOperation:'light.set_level',siteRef:'home.one',targetEntityId:'light.synthetic',parameters:{level:0.5},idempotencyKey:'synthetic-original-admission',approvalRequired:true,approvalRef:null};
 const dispatchHeaders={'x-pwce-dispatcher-token':dispatcherToken,'x-pwce-dispatch-contract':dispatchBundle.bundleDigest},headers={'x-pwce-approval-recovery-contract':bundle.bundleDigest};
 const fingerprint=actionFingerprint({...request,operation:request.capabilityOperation,principalRef:'agent.fixture',gatewayScope:{worldRef:request.worldRef,...identity}});
 const query=()=>({...structuredClone(scope),profileId:'pwce-agent-gateway.v1',profileVersion:'1.0.0',approvalProfileId:bundle.profileId,approvalProfileVersion:bundle.profileVersion,operation:'authority.recoverApproval',requestId:randomUUID(),correlationId:request.correlationId,deadline:new Date(now+30000).toISOString(),idempotencyKey:request.idempotencyKey,requestFingerprint:fingerprint,originalSnapshotRef:request.snapshotRef});
 return {approvals,token,path,target,store,actions,gateway,send,request,query,headers,dispatchHeaders,clock,advance:ms=>{now+=ms;},calls:()=>calls,checks:()=>checks,reconciles:()=>reconciles};
}
const recover=f=>f.send('/approval-recovery',f.query(),f.headers);
const requestApproval=f=>f.send('/dispatch',f.request,f.dispatchHeaders);
function known(result){assert.equal(result.status,200,JSON.stringify(result.body));assert.ok(validResponse(result.body),JSON.stringify(validResponse.errors));assert.equal(result.body.status,'known');assert.ok(validEvidence(result.body.approvalEvidence),JSON.stringify(validEvidence.errors));return result.body.approvalEvidence;}
function unknown(result){assert.equal(result.status,200,JSON.stringify(result.body));assert.ok(validResponse(result.body),JSON.stringify(validResponse.errors));assert.equal(result.body.status,'unknown');assert.equal(result.body.approvalEvidence,null);}

test('approval recovery publishes a deterministic separate bundle and exact schemas',async t=>{
 const f=await fixture(t),result=await f.send('/approval-recovery/bundle');assert.deepEqual(result.body,bundle);const aggregate=createHash('sha256');
 for(const artifact of bundle.artifacts){const bytes=await readFile(artifact.path);assert.equal(hash(bytes),artifact.sha256);aggregate.update(artifact.path).update('\0').update(bytes);}assert.equal(aggregate.digest('hex'),bundle.bundleDigest);
 assert.ok(validRequest(f.query()),JSON.stringify(validRequest.errors));assert.equal((await f.send('/approval-recovery/bundle',undefined,{authorization:'Bearer wrong'})).status,401);
});

test('pending approval recovery preserves exact review and snapshot without another request or effect',async t=>{
 const f=await fixture(t),created=await requestApproval(f);assert.equal(created.status,200,JSON.stringify(created.body));assert.equal(created.body.status,'approval_required');
 const before=await f.store.load(),evidence=known(await recover(f));assert.equal(evidence.approvalRef,created.body.approvalRef);assert.equal(evidence.status,'pending');assert.equal(evidence.requestKey,f.request.idempotencyKey);assert.equal(evidence.humanProof,null);assert.equal(hash(evidence.snapshot.snapshotJson),evidence.snapshot.sha256);
 const after=await f.store.load();assert.deepEqual(after.approvals,before.approvals);assert.deepEqual(after.actions,before.actions);assert.equal(f.calls(),0);assert.equal(f.checks(),0);assert.equal(f.reconciles(),0);
});

test('approved and expired original records remain historical evidence without renewed dates',async t=>{
 const f=await fixture(t),created=await requestApproval(f),approval=created.body.approval,proof={principalRef:'human.synthetic',authenticationMethod:'password',authenticatedAt:f.clock().toISOString(),verifiedAt:f.clock().toISOString()};
 await f.approvals.approve({approvalRef:approval.approvalRef,approvedBy:proof.principalRef,confirmationDigest:approval.confirmationDigest,humanProof:proof});const first=known(await recover(f));assert.equal(first.status,'approved');assert.deepEqual(first.humanProof,proof);
 f.advance(130000);const later=known(await recover(f));assert.deepEqual(later,first);assert.ok(Date.parse(later.expiresAt)<f.clock().valueOf());assert.equal(f.calls(),0);assert.equal(f.checks(),0);
});

test('expired pending approval recovery does not mutate expiry state',async t=>{
 const f=await fixture(t);await requestApproval(f);const before=await f.store.load();f.advance(130000);const evidence=known(await recover(f));assert.equal(evidence.status,'pending');assert.ok(Date.parse(evidence.expiresAt)<f.clock().valueOf());assert.deepEqual((await f.store.load()).approvals,before.approvals);
});

test('unknown or changed original approval terms never disclose an identifier',async t=>{
 const f=await fixture(t);unknown(await recover(f));await requestApproval(f);
 for(const change of [{idempotencyKey:'other'},{requestFingerprint:'{}'},{originalSnapshotRef:randomUUID()},{executionEnvironmentRef:'live'}])unknown(await f.send('/approval-recovery',{...f.query(),...change},f.headers));
 const foreign=await f.send('/authority',{assistantRef:'foreign',endpointRef:'endpoint.synthetic',participantRefs:['participant.one','participant.two'],audienceRef:'audience.synthetic',siteRefs:['home.one']});
 unknown(await f.send('/approval-recovery',{...f.query(),assistantRef:'foreign',authorityContextRef:foreign.body.authorityContextRef},f.headers));assert.equal(f.calls(),0);
});

test('approval recovery rejects credentials, contract mismatch, malformed requests and scope changes',async t=>{
 const f=await fixture(t);await requestApproval(f);
 assert.equal((await f.send('/approval-recovery',f.query(),{...f.headers,authorization:'Bearer wrong'})).status,401);
 assert.equal((await f.send('/approval-recovery',f.query(),{'x-pwce-approval-recovery-contract':'wrong'})).status,409);
 for(const change of [{approvalRef:'injected'},{approved:true},{token:f.token},{approvalProfileVersion:'2.0.0'},{deadline:'2026-02-30T00:00:00Z'}])assert.ok((await f.send('/approval-recovery',{...f.query(),...change},f.headers)).status>=400);
 assert.ok((await f.send('/request',f.query())).status>=400);assert.ok((await f.send('/approval-recovery',{...f.query(),participantRefs:['participant.two','participant.one']},f.headers)).status>=400);
 assert.equal(f.calls(),0);
});

test('revocation after approval lookup withholds late evidence',async t=>{
 const f=await fixture(t);await requestApproval(f);const read=f.approvals.readGatewayEvidence.bind(f.approvals);f.approvals.readGatewayEvidence=async input=>{const value=await read(input);f.actions.registerGrant({principalRef:'agent.fixture',siteRefs:[],capabilityRefs:[]});return value;};assert.ok((await recover(f)).status>=400);assert.equal(f.calls(),0);
});

test('corrupt qualified approval bytes fail closed without a fallback record',async t=>{
 const f=await fixture(t);await requestApproval(f);await f.store.transaction(state=>{Object.values(state.approvals)[0].gatewaySnapshot.sha256='0'.repeat(64);});const result=await recover(f);assert.ok(result.status>=400);assert.equal(result.body.error.code,'approval_evidence_corrupt');assert.equal(result.body.approvalEvidence,undefined);assert.equal(f.calls(),0);
});


test('duplicate original approval keys fail closed rather than selecting a record',async t=>{
 const f=await fixture(t);await requestApproval(f);await f.store.transaction(state=>{const original=Object.values(state.approvals)[0],id=randomUUID();state.approvals[id]={...structuredClone(original),approvalRef:id};});const result=await recover(f);assert.equal(result.body.error.code,'approval_evidence_corrupt');assert.equal(f.calls(),0);
});

test('approval recovery enforces byte and current-deadline bounds',async t=>{
 const f=await fixture(t);await requestApproval(f);assert.equal((await f.send('/approval-recovery',' '.repeat(65536)+JSON.stringify(f.query()),f.headers)).body.error.code,'limit_exceeded');
 for(const delta of [-1,30001])assert.equal((await f.send('/approval-recovery',{...f.query(),deadline:new Date(f.clock().valueOf()+delta).toISOString()},f.headers)).body.error.code,'deadline_exceeded');
 assert.equal(f.calls(),0);assert.equal(f.checks(),0);
});

test('original approval evidence survives reopening durable producer storage',async t=>{
 const f=await fixture(t,{persistent:true});await requestApproval(f);const first=known(await recover(f)),reopened=new ApprovalService({store:new StateStore({path:f.path}),clock:f.clock});
 f.approvals.readGatewayEvidence=input=>reopened.readGatewayEvidence(input);assert.deepEqual(known(await recover(f)),first);assert.equal(f.calls(),0);
});
