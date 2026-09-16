import test from 'node:test';
import assert from 'node:assert/strict';
import {StateStore,emptyState} from '../src/runtime/state-store.js';
import {GatewayService} from '../src/gateway/gateway-service.js';
import {ActionService} from '../src/actions/action-service.js';

async function fixture(t){
 let now=Date.parse('2026-09-16T12:00:00Z');
 const store=new StateStore({state:emptyState()}),actions=new ActionService({store}),token='synthetic-grant-reader';
 const grant={principalRef:'agent.one',siteRefs:['home.one','home.two'],capabilityRefs:['home.light.set_level']};actions.registerGrant(grant);
 const gateway=new GatewayService({store,actionService:actions,clock:()=>new Date(now)});t.after(()=>gateway.close());
 const principal={principalRef:'agent.one',token,siteRefs:['home.one','home.two']};gateway.registerPrincipal(principal);
 const scope={assistantRef:'assistant.one',endpointRef:'endpoint.one',participantRefs:['human.one'],audienceRef:'audience.one'};
 const issue=(sites=['home.one'])=>gateway.issueAuthorityContext({...principal,...scope,siteRefs:sites,ttlMs:60000});
 let authority=issue();
 const read=(extra={})=>gateway.requestAuthenticated({token,...scope,operation:'authority.getGrants',authorityContextRef:authority.authorityContextRef,worldRef:'world.personal.v1',executionEnvironmentRef:'test',deadline:new Date(now+30000).toISOString(),...extra});
 await gateway.requestAuthenticated({token,...scope,operation:'health.get',authorityContextRef:authority.authorityContextRef});
 const hold=()=>{
  const original=store.load.bind(store);let entered,release,armed=true;
  const waiting=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);
  store.load=async()=>{const state=await original();if(armed&&state.audit.at(-1)?.operation==='authority.getGrants'){armed=false;entered();await gate;}return state;};
  t.after(release);return {waiting,release};
 };
 return {store,actions,gateway,grant,principal,scope,read,hold,advance:ms=>{now+=ms;},reissue:sites=>{authority=issue(sites);}};
}

test('grant view is scoped, read-only, stable across unrelated world updates and revised when permissions change',async t=>{
 const f=await fixture(t),first=await f.read();assert.deepEqual(first.siteRefs,['home.one']);assert.deepEqual(first.capabilityRefs,['home.light.set_level']);assert.match(first.sourceRevision,/^[a-f0-9]{64}$/);
 assert.equal((await f.read()).sourceRevision,first.sourceRevision);
 await f.store.transaction(state=>{state.observations.push({recordId:'synthetic-unrelated'});});
 assert.equal((await f.read()).sourceRevision,first.sourceRevision);
 f.actions.registerGrant({...f.grant,capabilityRefs:[]});f.reissue();const revoked=await f.read();assert.notEqual(revoked.sourceRevision,first.sourceRevision);assert.deepEqual(revoked.capabilityRefs,[]);assert.ok(revoked.limitations.length);
 f.actions.registerGrant(f.grant);f.reissue();assert.notEqual((await f.read()).sourceRevision,first.sourceRevision);
 f.reissue(['home.two']);assert.deepEqual((await f.read()).siteRefs,['home.two']);
 const state=await f.store.load();assert.deepEqual(state.actions,{});assert.deepEqual(state.approvals,{});
});
for(const [name,change,code] of [
 ['grant revocation',f=>f.actions.registerGrant({...f.grant,capabilityRefs:[]}),'authority_context_invalidated'],
 ['principal rotation',f=>f.gateway.registerPrincipal({...f.principal,token:'rotated-synthetic-token'}),'authority_context_invalidated'],
 ['authority expiry',f=>f.advance(60000),'authority_context_expired'],
 ['request deadline',f=>f.advance(30000),'deadline_exceeded'],
 ['World replacement',f=>f.store.transaction(state=>{state.worldRef='world.replaced';}),'scope_denied']
])test(`grant read withholds result after ${name} while storage is pending`,async t=>{
 const f=await fixture(t),gate=f.hold(),pending=f.read();await gate.waiting;await change(f);gate.release();await assert.rejects(pending,error=>error.code===code);
 const state=await f.store.load();assert.deepEqual(state.actions,{});assert.deepEqual(state.approvals,{});
});
