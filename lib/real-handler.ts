import { CRITERIA_VERSION } from './fixtures.ts';
import { isLocalSameOrigin } from './request-policy.ts';
import { DecisionError, readJson, validateReal } from './real-validation.ts';
import { callReal } from './real-adapters.ts';
let relevanceActive = 0, videoActive = 0;
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function handleReal(request: Request, env: Record<string, string | undefined>, fetcher: typeof fetch = fetch) {
  if (!isLocalSameOrigin(request.headers.get('origin'), request.headers.get('host'), request.headers.get('sec-fetch-site'))) return reply({ error: '同一オリジンの画面から実行してください。' }, 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return reply({ error: 'JSON形式で送信してください。' }, 415);
  try {
    const input = validateReal(await readJson(request, 5_650_000));
    const video = input.kind === 'video';
    if (video ? videoActive >= 2 : relevanceActive >= 4) return reply({ error: '判定が混雑しています。完了後に再実行してください。' }, 429);
    video ? videoActive++ : relevanceActive++;
    try { return reply({ ...await callReal(input, env, request.signal, fetcher), criteria: CRITERIA_VERSION }); }
    finally { video ? videoActive-- : relevanceActive--; }
  } catch (e) { return reply({ error: e instanceof DecisionError ? e.message : '判定を実行できませんでした。' }, e instanceof DecisionError ? e.status : 500); }
}
