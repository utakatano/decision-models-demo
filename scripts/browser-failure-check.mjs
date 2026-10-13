// Local failure/stale-response checks using a preinstalled Playwright runtime.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
const base = process.env.DEMO_BASE_URL || 'http://127.0.0.1:3000';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname) || new URL(base).protocol !== 'http:') throw new Error('Browser checks are local-only');
try {
  const page = await browser.newPage();
  let calls = 0; let failures = 0;
  await page.route('**/api/mock', async route => {
    const body = route.request().postDataJSON(); calls++;
    if (body.model === 'decisions' && body.thread.id === 'thread-01' && failures === 0) {
      failures++; await route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: '検証用の通信失敗' }) });
    } else await route.continue();
  });
  await page.goto(base);
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '処理済み 50 / 50件、失敗 0件' }).waitFor();
  await page.locator('#relevance-model').selectOption('decisions');
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '処理済み 50 / 50件、失敗 1件' }).waitFor();
  const row = page.locator('[data-thread-id="thread-01"]');
  assert.ok((await row.innerText()).includes('判定失敗：検証用の通信失敗'));
  await page.locator('#relevance-model').selectOption('jev');
  assert.ok((await row.innerText()).includes('判定失敗：検証用の通信失敗'));
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.thread-list').dataset.appliedModel === 'jev');
  assert.ok((await row.innerText()).includes('キャッシュ'));
  await page.locator('#relevance-model').selectOption('decisions');
  assert.equal(calls, 100);
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '処理済み 50 / 50件、失敗 0件' }).waitFor();
  assert.equal(calls, 101); // Only failed result retried; successes remain cached.
  await page.close();
  const stale = await browser.newPage(); let received = 0;
  let release; const pending = new Promise(resolve => { release = resolve; });
  await stale.route('**/api/mock', async route => { received++; await pending; try { await route.continue(); } catch { /* request deliberately aborted */ } });
  await stale.goto(base);
  await stale.getByRole('button', { name: '判定する', exact: true }).click();
  await stale.getByRole('button', { name: '判定中…', exact: true }).waitFor();
  await stale.getByRole('button', { name: 'プロフィールを確認・変更' }).click();
  await stale.locator('#profile').selectOption('pm'); release();
  await stale.waitForTimeout(300);
  assert.ok(received <= 4);
  assert.ok((await stale.getByRole('status').innerText()).includes('処理済み 0 / 50件'));
  assert.equal(await stale.locator('.thread-list').getAttribute('data-applied-model'), null);
  assert.equal(await stale.getByRole('button', { name: '判定する', exact: true }).isEnabled(), true);
  await stale.close();
  console.log('Failure checks passed: failed result remains an error, other model survives, no automatic retries, failures are not cached, old input requests are aborted and not mixed.');
} finally { await browser.close(); }
