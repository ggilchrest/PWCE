import { createServer } from 'node:http';
import { StateStore, emptyState } from '../src/runtime/state-store.js';
import { ActionService } from '../src/actions/action-service.js';
import { createGatewayHttpBinding } from '../src/http/gateway-server.js';
const token = process.env.PWCE_FIXTURE_TOKEN, dispatcherToken = process.env.PWCE_FIXTURE_DISPATCHER_TOKEN;
if (!token || !dispatcherToken) throw new Error('synthetic fixture credentials are required');
const store = new StateStore({ state: emptyState() }); let calls = 0;
const actions = new ActionService({ store, target: { identity: 'synthetic.dispatch-process', async invoke(action) {
  calls++;
  return action.targetEntityId === 'light.unknown' ? { status: 'outcome_unknown', externalEffectOccurred: 'unknown', reasonCode: 'synthetic_lost_reply' } : { status: 'succeeded', externalEffectOccurred: true };
} } });
actions.registerGrant({ principalRef: 'agent.fixture', siteRefs: ['home.one'], capabilityRefs: ['home.light.set_level'] });
const binding = createGatewayHttpBinding({ store, token, dispatcherToken, actionService: actions });
const server = createServer(async (req,res) => { await binding.handle(req,res,new URL(req.url,'http://127.0.0.1').pathname); });
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
process.stdout.write(JSON.stringify({ fixture:true, scenario:'trusted-dispatch', liveEffects:false, url:`http://127.0.0.1:${server.address().port}` })+'\n');
let input = '', stopping = false;
async function stop() { if (stopping) return; stopping = true; server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); binding.gateway.close(); process.stdin.pause(); }
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  input += chunk;
  if (input.length > 4096) { void stop(); return; }
  while (input.includes('\n')) {
    const end=input.indexOf('\n'), command=input.slice(0,end); input=input.slice(end+1);
    if (command === 'stats') process.stdout.write(JSON.stringify({ fixtureStats:true, calls })+'\n');
    else if (command === 'revoke') { actions.registerGrant({ principalRef:'agent.fixture',siteRefs:[],capabilityRefs:[] }); process.stdout.write(JSON.stringify({ revoked:true })+'\n'); }
    else if (command === 'stop') void stop();
  }
});
process.stdin.on('end',()=>void stop());
process.on('SIGTERM',()=>void stop());
