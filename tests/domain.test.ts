import test from 'node:test';
import assert from 'node:assert/strict';
import { validDuration, sampleTimes, videoError, aggregate, pool, parseContacts, sortedThreads } from '../lib/domain.ts';
import { mockFrame, mockRelevance, threads } from '../lib/fixtures.ts';
import { readFileSync } from 'node:fs';
import { isLocalSameOrigin } from '../lib/request-policy.ts';

test('origin checks reject external hosts, missing headers and mismatched ports', () => {
  assert.equal(isLocalSameOrigin('http://127.0.0.1:3000', '127.0.0.1:3000', 'same-origin'), true);
  assert.equal(isLocalSameOrigin('http://localhost:3000', 'localhost:3000', null), true);
  assert.equal(isLocalSameOrigin('https://example.com', 'example.com', 'same-origin'), false);
  assert.equal(isLocalSameOrigin('http://127.0.0.1:3001', '127.0.0.1:3000', null), false);
  assert.equal(isLocalSameOrigin(null, '127.0.0.1:3000', null), false);
  assert.equal(isLocalSameOrigin('http://127.0.0.1:3000', '127.0.0.1:3000', 'cross-site'), false);
});

test('duration boundaries and input rejection precede extraction', () => {
  assert.equal(validDuration(3), false); assert.equal(validDuration(3.0001), true);
  assert.equal(validDuration(30), true); assert.equal(validDuration(30.0001), false);
  assert.equal(validDuration(Infinity), false); assert.equal(validDuration(NaN), false);
  assert.deepEqual(sampleTimes(30), Array.from({ length: 30 }, (_, i) => i));
  assert.deepEqual(sampleTimes(3.1), [0,1,2,3]);
  assert.throws(() => sampleTimes(3));
  assert.ok(videoError(100_000_001, 'video/mp4', 24));
  assert.ok(videoError(10, 'application/octet-stream', 24));
  assert.equal(videoError(100_000_000, 'video/webm', 30), null);
});
test('tag intervals are independent, and unknown/failure breaks a run', () => {
  const intervals = aggregate([
    { time: 0, judgment: { エラー表示: 'あり', 確認ダイアログ: 'あり', 完了表示: 'なし' } },
    { time: 1, judgment: { エラー表示: 'あり', 確認ダイアログ: '判定不能', 完了表示: 'なし' } },
    { time: 2, failed: true },
    { time: 3, judgment: { エラー表示: 'あり', 確認ダイアログ: 'なし', 完了表示: 'あり' } },
  ]);
  assert.deepEqual(intervals, [
    { tag: 'エラー表示', start: 0, end: 1 }, { tag: '確認ダイアログ', start: 0, end: 0 },
    { tag: 'エラー表示', start: 3, end: 3 }, { tag: '完了表示', start: 3, end: 3 },
  ]);
});
test('pool caps work at two concurrent calls', async () => {
  let active = 0; let peak = 0; let count = 0;
  await pool(Array.from({ length: 30 }), 2, async () => {
    peak = Math.max(peak, ++active); await new Promise(resolve => setTimeout(resolve, 2)); active--; count++;
  });
  assert.equal(peak, 2); assert.equal(count, 30);
});
test('same thread differs by profile; resolved requests remain relevant', () => {
  assert.equal(threads.length, 50);
  const frontend = mockRelevance('frontend', 'jev', 3);
  assert.ok(frontend.relevance >= 70); assert.equal(frontend.action, '対応不要');
  assert.ok(mockRelevance('frontend','jev',0).relevance > mockRelevance('support','jev',0).relevance);
  assert.ok(mockRelevance('frontend','jev',1).relevance < 40);
  assert.ok(mockRelevance('frontend','jev',2).relevance < 40);
  const values = Object.fromEntries(threads.map(t => [t.id, mockRelevance('frontend','jev',t.caseIndex)]));
  const sorted = sortedThreads(threads, values);
  assert.equal(sorted[0].caseIndex, 6); assert.equal(sorted[0].id, 'thread-47');
});
test('video mock supports simultaneous tags and uncertainty', () => {
  const result = mockFrame('d1', 17); assert.equal(result.エラー表示, 'あり'); assert.equal(result.確認ダイアログ, 'あり');
  assert.equal(mockFrame('clef',20).完了表示, '判定不能');
  assert.equal(mockFrame('d1',20).完了表示, 'あり');
});
test('CSV validation and formula rejection', () => {
  assert.equal(parseContacts(readFileSync('public/samples/contacts-valid.csv','utf8')).length, 3);
  assert.throws(() => parseContacts(readFileSync('public/samples/contacts-invalid.csv','utf8')), /3行目/);
  const text = readFileSync('public/samples/contacts-valid.csv','utf8').replace('青空商事','=1+1');
  assert.throws(() => parseContacts(text), /数式/);
});
