import test from 'node:test';
import assert from 'node:assert/strict';
import { gatewayApprovalFixture } from '../scripts/fixtures/gateway-approval.mjs';
async function setup(t) { const f = await gatewayApprovalFixture(); t.after(() => f.close()); return f; }
const review = async f => { const pending = await f.prepare(); assert.equal(pending.body.status, 'approval_required', JSON.stringify(pending)); return pending.body.approval; };
const approve = (f, a, auth = 'human', extra = {}) => f.send(`/api/approvals/${a.approvalRef}/approve`, { confirmationDigest: a.confirmationDigest, ...extra }, auth);

test('Gateway request reaches authenticated Human review and resumes exactly one original action', async t => {
  const f = await setup(t);
  await f.send('/gateway/v1/request', { ...f.payload, operation: 'authority.evaluate' }, 'gateway'); assert.deepEqual((await f.store.load()).approvals, {});
  const a = await review(f); assert.equal(f.calls(), 0); assert.deepEqual((await f.store.load()).actions, {});
  assert.equal((await review(f)).approvalRef, a.approvalRef); assert.equal(Object.keys((await f.store.load()).approvals).length, 1);
  assert.equal((await f.send('/api/approvals')).status, 401); await f.login();
  const listing = await f.send('/api/approvals'); assert.equal(listing.status, 200); assert.equal(listing.body.approvals[0].gatewayReview.request.gatewayScope.audienceRef, f.identity.audienceRef);
  assert.equal(listing.body.approvals[0].gatewaySnapshot, undefined);
  const accepted = await approve(f, a); assert.equal(accepted.status, 200, JSON.stringify(accepted)); assert.equal(accepted.body.approvedBy, 'principal.studio'); assert.equal(f.calls(), 0);
  const stored = (await f.store.load()).approvals[a.approvalRef]; assert.equal(stored.humanProof.authenticationMethod, 'password');
  assert.ok(!JSON.stringify(stored).includes(f.password)); assert.ok(!JSON.stringify(stored).includes(f.env.PWCE_GATEWAY_TOKEN));
  const resumed = await f.prepare({ approvalRef: a.approvalRef }); assert.equal(resumed.body.status, 'completed', JSON.stringify(resumed));
  assert.equal((await f.prepare({ approvalRef: a.approvalRef })).body.actionRef, resumed.body.actionRef); assert.equal(f.calls(), 1);
});

test('workload, Studio bearer and bearer-bootstrap sessions cannot approve Gateway requests', async t => {
  const f = await setup(t), a = await review(f);
  assert.equal((await approve(f, a, 'gateway')).status, 401);
  assert.equal((await approve(f, a, 'studioToken')).status, 403);
  const bootstrap = await f.send('/api/session', undefined, 'studioToken'); f.setCookie(bootstrap.cookie);
  assert.equal((await approve(f, a)).status, 403); assert.equal((await f.store.load()).approvals[a.approvalRef].status, 'pending'); assert.equal(f.calls(), 0);
});

test('reloading a real Human session retains its authentication method and expiry without reissue', async t => {
  const f = await setup(t), a = await review(f), login = await f.login();
  const current = await f.send('/api/session'); assert.equal(current.status, 200); assert.equal(current.body.authenticationMethod, 'password');
  assert.equal(current.body.expiresAt, login.body.expiresAt); assert.equal(current.cookie, undefined);
  assert.equal((await approve(f, a)).status, 200);
});

test('stale confirmation and browser-authored approver or scope fields cannot approve', async t => {
  const f = await setup(t), a = await review(f); await f.login();
  assert.equal((await approve(f, { ...a, confirmationDigest: '0'.repeat(64) })).status, 409);
  assert.equal((await approve(f, a, 'human', { approvedBy: 'human.forged' })).status, 422);
  assert.equal((await approve(f, a, 'human', { gatewayScope: {} })).status, 422);
  assert.equal((await f.store.load()).approvals[a.approvalRef].status, 'pending'); assert.equal(f.calls(), 0);
});

test('an approval binds the original request key, exact arguments and audience', async t => {
  const f = await setup(t), a = await review(f); await f.login(); assert.equal((await approve(f, a)).status, 200);
  for (const extra of [{ idempotencyKey: 'changed-key' }, { parameters: { level: 0.8 } }]) {
    const changed = await f.prepare({ approvalRef: a.approvalRef, ...extra }); assert.equal(changed.body.outcome, 'denied');
  }
  const other = await f.send('/gateway/v1/authority', { ...f.identity, audienceRef: 'audience.other', siteRefs: ['home.one'] }, 'gateway');
  const changed = await f.prepare({ approvalRef: a.approvalRef, authorityContextRef: other.body.authorityContextRef, audienceRef: 'audience.other' }); assert.equal(changed.body.outcome, 'denied'); assert.equal(f.calls(), 0);
});

test('invalid capability arguments never create a pending approval', async t => {
  const f = await setup(t);
  for (const parameters of [{ level: 2 }, { level: 0.4, extra: true }, {}, null]) assert.equal((await f.prepare({ parameters })).body.outcome, 'denied');
  assert.deepEqual((await f.store.load()).approvals, {}); assert.equal(f.calls(), 0);
});

test('changed grant authority or provider source stops review without issuing approval', async t => {
  const f = await setup(t), a = await review(f); await f.login();
  const original = f.actions.snapshot.bind(f.actions); f.actions.snapshot = () => ({ ...original(), bindingRef: 'replacement-source' });
  assert.notEqual((await approve(f, a)).status, 200);
  f.actions.registerGrant({ principalRef: 'agent.fixture', siteRefs: [], capabilityRefs: [] });
  assert.notEqual((await approve(f, a)).status, 200); assert.equal((await f.store.load()).approvals[a.approvalRef].status, 'pending'); assert.equal(f.calls(), 0);
});

test('expired approval stays non-authorizing even while Gateway authority remains current', async t => {
  const f = await setup(t), a = await review(f); await f.login(); f.advance(120_001);
  assert.notEqual((await approve(f, a)).status, 200); assert.equal((await f.store.load()).approvals[a.approvalRef].status, 'expired');
  assert.equal((await f.prepare({ approvalRef: a.approvalRef })).body.outcome, 'denied'); assert.equal(f.calls(), 0);
});

test('two concurrent requests and approvals preserve one pending record and one Human decision', async t => {
  const f = await setup(t); const [left, right] = await Promise.all([review(f), review(f)]); assert.equal(left.approvalRef, right.approvalRef);
  await f.login(); const accepted = await Promise.all([approve(f, left), approve(f, right)]); assert.ok(accepted.every(item => item.status === 200), JSON.stringify(accepted));
  const state = await f.store.load(); assert.equal(state.audit.filter(item => item.type === 'approval.approved').length, 1); assert.equal(f.calls(), 0);
});

test('a foreign site is hidden from listing and cannot be read, expired or approved through Studio', async t => {
  const f = await setup(t); const other = await f.send('/gateway/v1/authority', { ...f.identity, siteRefs: ['home.two'] }, 'gateway');
  const pending = await f.prepare({ authorityContextRef: other.body.authorityContextRef, siteRef: 'home.two' }); const a = pending.body.approval; assert.ok(a);
  await f.login(); f.advance(120_001);
  assert.deepEqual((await f.send('/api/approvals')).body.approvals, []);
  assert.equal((await f.send(`/api/approvals/${a.approvalRef}`)).status, 403); assert.equal((await approve(f, a)).status, 403);
  assert.equal((await f.store.load()).approvals[a.approvalRef].status, 'pending');
});

test('logout while approval waits rejects the decision at its transaction guard', async t => {
  const f = await setup(t), a = await review(f); await f.login(); let enter, release;
  const entered = new Promise(resolve => { enter = resolve; }), gate = new Promise(resolve => { release = resolve; });
  const original = f.approvals.approve.bind(f.approvals); f.approvals.approve = async input => { enter(); await gate; return original(input); };
  const pending = approve(f, a); await entered; await f.send('/api/session/logout', {}); release();
  assert.equal((await pending).status, 403); assert.equal((await f.store.load()).approvals[a.approvalRef].status, 'pending'); assert.equal(f.calls(), 0);
});

test('recovery-code Human sign-in can approve, but missing or corrupt evidence cannot authorize dispatch', async t => {
  const f = await setup(t), a = await review(f); assert.equal((await f.login(true)).status, 200); assert.equal((await approve(f, a)).status, 200);
  await f.store.transaction(state => { delete state.approvals[a.approvalRef].humanProof; });
  assert.notEqual((await f.prepare({ approvalRef: a.approvalRef })).body.status, 'completed'); assert.equal(f.calls(), 0);
  assert.notEqual((await f.send(`/api/approvals/${a.approvalRef}`)).status, 200);
});

test('approved requests cannot dispatch after expiry or with corrupt review evidence', async t => {
  const f = await setup(t), a = await review(f); await f.login(); assert.equal((await approve(f, a)).status, 200);
  const original = structuredClone((await f.store.load()).approvals[a.approvalRef]);
  for (const corrupt of [record => { record.approvedAt = 'invalid'; }, record => { delete record.gatewaySnapshot.snapshotJson; }]) {
    await f.store.transaction(state => { state.approvals[a.approvalRef] = structuredClone(original); corrupt(state.approvals[a.approvalRef]); });
    const read = await f.send(`/api/approvals/${a.approvalRef}`); assert.equal(read.body.code, 'approval_evidence_corrupt');
    assert.notEqual((await f.prepare({ approvalRef: a.approvalRef })).body.status, 'completed'); assert.equal(f.calls(), 0);
  }
  await f.store.transaction(state => { state.approvals[a.approvalRef] = structuredClone(original); }); f.advance(120_001);
  assert.equal((await f.prepare({ approvalRef: a.approvalRef })).body.outcome, 'denied'); assert.equal(f.calls(), 0);
});
