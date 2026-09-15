import { randomBytes } from 'node:crypto';
import { StateStore, emptyState } from '../../src/runtime/state-store.js';
import { ActionService } from '../../src/actions/action-service.js';
import { ApprovalService } from '../../src/actions/approval-service.js';
import { createStudioHttpServer } from '../../src/http/dev-server.js';

export async function gatewayApprovalFixture({ target = null, liveEffectsEnabled = false, executionEnvironmentRef = 'test' } = {}) {
  const secret = () => randomBytes(24).toString('hex'); let calls = 0, clockOffset = 0;
  const clock = () => new Date(Date.now() + clockOffset), store = new StateStore({ state: emptyState() });
  const approvals = new ApprovalService({ store, clock });
  const actions = new ActionService({ store, approvalService: approvals, clock, liveEffectsEnabled, target: target ?? { identity: 'synthetic-human-review-target', async invoke() { calls++; return { status: 'succeeded', externalEffectOccurred: true }; } } });
  const password = secret(), recoveryCode = secret(), studioToken = secret(), gatewayToken = secret();
  const env = { PWCE_STUDIO_USERNAME: 'synthetic-reviewer', PWCE_STUDIO_PASSWORD: password, PWCE_STUDIO_RECOVERY_CODES: recoveryCode, PWCE_STUDIO_TOKEN: studioToken, PWCE_GATEWAY_TOKEN: gatewayToken, PWCE_GATEWAY_SITE_REFS: 'home.one,home.two' };
  const service = { siteRef: 'home.one', siteRefs: ['home.one'], entityId: 'light.synthetic', actionService: actions, approvalService: approvals, runtimeStatus: () => ({ status: 'offline', reason: 'synthetic_review_fixture' }), stop() {} };
  const { server } = await createStudioHttpServer({ env, store, service });
  actions.registerGrant({ principalRef: 'agent.fixture', siteRefs: ['home.one','home.two'], capabilityRefs: ['home.light.set_level'] });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}`; let cookie;
  const send = async (path, body, auth = 'human', extra = {}) => {
    const headers = { 'content-type': 'application/json', origin: base, ...(auth === 'human' && cookie ? { cookie } : {}), ...(auth === 'gateway' ? { authorization: `Bearer ${gatewayToken}` } : {}), ...(auth === 'studioToken' ? { authorization: `Bearer ${studioToken}` } : {}), ...extra };
    const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(5000) });
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
  const identity = { assistantRef: 'assistant.synthetic', endpointRef: 'endpoint.synthetic', participantRefs: ['participant.synthetic'], audienceRef: 'audience.synthetic' };
  const authority = await send('/gateway/v1/authority', { siteRefs: ['home.one'], ...identity }, 'gateway');
  const scope = { ...identity, authorityContextRef: authority.body.authorityContextRef, executionEnvironmentRef };
  const payload = { ...scope, operation: 'capabilities.invoke', capabilityRef: 'home.light.set_level', capabilityVersion: '1.0.0', capabilityOperation: 'light.set_level', siteRef: 'home.one', targetEntityId: 'light.synthetic', parameters: { level: 0.4 }, approvalRequired: true, idempotencyKey: 'synthetic-reviewed-action' };
  return { base, password, recoveryCode, env, store, actions, approvals, identity, payload, send, calls: () => calls,
    prepare: extra => send('/gateway/v1/request', { ...payload, ...extra }, 'gateway'),
    async login(recovery = false) { const result = await send('/api/session', recovery ? { recoveryCode } : { username: env.PWCE_STUDIO_USERNAME, password }, 'none'); cookie = result.cookie; return result; },
    setCookie(value) { cookie = value; }, advance(ms) { clockOffset += ms; },
    async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
