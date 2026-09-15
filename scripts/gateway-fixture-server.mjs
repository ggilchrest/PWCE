import {createServer} from 'node:http';
import {StateStore} from '../src/runtime/state-store.js';
import {createGatewayHttpBinding} from '../src/http/gateway-server.js';

// Disposable transport fixture. No disk store, Home Assistant adapter, action
// service, live configuration, or provider credential is accepted by this host.
const token=process.env.PWCE_FIXTURE_TOKEN;
if(typeof token!=='string'||token.length<16)throw new Error('Set a synthetic PWCE_FIXTURE_TOKEN of at least 16 characters.');
const store=new StateStore({state:{schemaVersion:1,worldRef:'world.personal.v1',revision:0,sites:{},sources:{},entities:{},observations:[],idempotencyKeys:{},projections:{},actions:{},approvals:{},audit:[]}});
const binding=createGatewayHttpBinding({store,token,principalRef:'agent.fixture',siteRefs:['home.one']});
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
 process.stdout.write(JSON.stringify({url:`http://127.0.0.1:${server.address().port}`,fixture:true,worldRef:'world.personal.v1',siteRefs:['home.one'],liveEffects:false})+'\n');
});
