import {createServer} from 'node:http';
import {StateStore} from '../src/runtime/state-store.js';
import {createGatewayHttpBinding} from '../src/http/gateway-server.js';
import {registerSite,registerSource} from '../src/domain/identity.js';
import {ingestObservation} from '../src/domain/observation-service.js';

// Disposable transport fixture. No disk store, Home Assistant adapter, action
// service, live configuration, or provider credential is accepted by this host.
const token=process.env.PWCE_FIXTURE_TOKEN;
if(typeof token!=='string'||token.length<16)throw new Error('Set a synthetic PWCE_FIXTURE_TOKEN of at least 16 characters.');
const store=new StateStore({state:{schemaVersion:1,worldRef:'world.personal.v1',revision:0,sites:{},sources:{},entities:{},observations:[],idempotencyKeys:{},projections:{},actions:{},approvals:{},audit:[]}});
const scenario=process.env.PWCE_FIXTURE_SCENARIO??'empty';
if(!['empty','qualified-context'].includes(scenario))throw new Error('Unknown synthetic fixture scenario.');
let historicalBoundary;
if(scenario==='qualified-context'){
 const now=Date.now(),at=offset=>new Date(now+offset).toISOString();
 historicalBoundary=at(-7000);
 await store.transaction(state=>{
  for(const siteRef of ['home.one','home.two'])registerSite(state,{siteRef});
  registerSource(state,{siteRef:'home.one',sourceRef:'fixture.one'});
  registerSource(state,{siteRef:'home.one',sourceRef:'fixture.other'});
  registerSource(state,{siteRef:'home.two',sourceRef:'fixture.two'});
 });
 const observe=(externalEntityId,value,offset,extra={})=>ingestObservation(store,{siteRef:'home.one',sourceRef:'fixture.one',externalEntityId,property:'state',value,eventTime:at(offset),freshnessMs:60000,...extra});
 await observe('sensor.conflict',false,-2000);await observe('sensor.conflict',true,-2000,{sourceRef:'fixture.other'});
 await observe('sensor.stale',10,-120000,{freshnessMs:1000});
 await observe('sensor.history',0,-20000);await observe('sensor.history',1,-10000);await observe('sensor.history',2,-5000);
 await observe('sensor.foreign',999,-1000,{siteRef:'home.two',sourceRef:'fixture.two'});
}
const fixtureSites=scenario==='qualified-context'?['home.one','home.two']:['home.one'];
const binding=createGatewayHttpBinding({store,token,principalRef:'agent.fixture',siteRefs:fixtureSites});
const server=createServer(async(req,res)=>{
 try{if(!await binding.handle(req,res,new URL(req.url,'http://127.0.0.1').pathname)){res.writeHead(404);res.end();}}
 catch{if(!res.headersSent)res.writeHead(500);res.end();}
});
let stopped=false;let lifetime;
async function stop(){if(stopped)return;stopped=true;clearTimeout(lifetime);server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await binding.gateway.close();process.stdin.destroy();}
process.once('SIGTERM',()=>{void stop();});process.once('SIGINT',()=>{void stop();});
process.stdin.on('data',()=>{void stop();});process.stdin.on('end',()=>{void stop();});process.stdin.resume();
server.listen(0,'127.0.0.1',()=>{
 lifetime=setTimeout(()=>{void stop();},60000);
 process.stdout.write(JSON.stringify({url:`http://127.0.0.1:${server.address().port}`,fixture:true,worldRef:'world.personal.v1',siteRefs:fixtureSites,scenario,...(historicalBoundary?{historicalBoundary}:{}),liveEffects:false})+'\n');
});
