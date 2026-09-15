import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { gatewayApprovalFixture } from './fixtures/gateway-approval.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const f = await gatewayApprovalFixture(); let browser;
try {
  const pending = (await f.prepare()).body.approval; assert.ok(pending);
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE_PATH ? { executablePath: process.env.BROWSER_EXECUTABLE_PATH } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(f.base); await page.locator('#auth-panel').waitFor({ state: 'visible' });
  await page.locator('#auth-username').fill(f.env.PWCE_STUDIO_USERNAME); await page.locator('#auth-password').fill(f.password);
  await page.locator('#auth-form button').click(); await page.locator('#gateway-approval-list article').waitFor();
  const capture = process.env.PWCE_REVIEW_CAPTURE_DIRECTORY;
  if (capture) { await mkdir(capture, { recursive: true }); await page.screenshot({ path: join(capture, 'inspect-local-context-01-studio-overview.png') }); }
  const panel = page.locator('#assistant-requests'), record = panel.locator('article').first();
  await record.locator('summary').focus(); await page.keyboard.press('Enter');
  const fields = await record.locator('dd').allTextContents();
  for (const expected of ['light.synthetic','home.one','0.4','agent.fixture','assistant.synthetic','audience.synthetic']) assert.ok(fields.includes(expected), expected);
  const approve = record.getByRole('button', { name: 'Approve this request' }); assert.equal(await approve.isEnabled(), false);
  if (capture) await panel.screenshot({ path: join(capture, 'gateway-review-02-scope-desktop.png') });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const overflowing = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(node => node.getBoundingClientRect().right > innerWidth + 1).map(node => ({ tag: node.tagName, id: node.id, class: node.className, right: node.getBoundingClientRect().right })));
    if (overflowing.length) console.error(JSON.stringify({ width, overflowing }));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `horizontal overflow at ${width}`);
    if (capture && width === 390) await panel.screenshot({ path: join(capture, 'gateway-review-03-scope-mobile.png') });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await record.locator('input[type=checkbox]').focus(); await page.keyboard.press('Space'); assert.equal(await approve.isEnabled(), true);
  await approve.focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#gateway-approval-list .status-pill')?.textContent === 'approved');
  assert.equal(f.calls(), 0); assert.equal(await record.locator('.review-feedback').evaluate(node => node === document.activeElement), true);
  if (capture) await panel.screenshot({ path: join(capture, 'gateway-review-04-approved.png') });
  assert.equal((await f.prepare({ approvalRef: pending.approvalRef })).body.status, 'completed'); assert.equal(f.calls(), 1);
  await page.reload(); await page.locator('#gateway-approval-list article').waitFor(); assert.equal(await page.locator('#auth-panel').isVisible(), false);
  await f.prepare({ idempotencyKey: 'synthetic-markup-target', targetEntityId: '<img src=x onerror=window.__pwceInjected=1>' });
  await page.locator('#gateway-approval-refresh').click(); await page.getByText(/Set brightness of <img/).waitFor();
  assert.equal(await panel.locator('img').count(), 0); assert.equal(await page.evaluate(() => window.__pwceInjected), undefined);
  for (let i = 0; i < 5; i++) await f.prepare({ idempotencyKey: `synthetic-page-${i}` });
  await page.locator('#gateway-approval-refresh').click(); await page.waitForFunction(() => !document.getElementById('gateway-approval-next').disabled);
  assert.equal(await panel.locator('article').count(), 5); await page.locator('#gateway-approval-next').click();
  await page.waitForFunction(() => !document.getElementById('gateway-approval-previous').disabled); assert.equal(await panel.locator('article').count(), 2);
  await page.locator('#logout').click(); await page.locator('#auth-panel').waitFor({ state: 'visible' }); assert.equal(await panel.locator('article').count(), 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'pass', synthetic: true, liveEffects: false, checks: ['real password sign-in','complete scope display','keyboard disclosure and confirmation','desktop and 390/320px overflow','Human approval without dispatch','explicit original request resumes once','reload preserves Human session','untrusted text remains text','bounded pagination','sign-out clears records'], targetCalls: f.calls(), captures: !!capture }));
} finally { await browser?.close(); await f.close(); }
