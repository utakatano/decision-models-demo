import { NextResponse } from 'next/server';
import { profiles, threads, mockRelevance, mockFrame, CRITERIA_VERSION, relevanceModels, videoModels, SAMPLE_VIDEO_ID } from '../../../lib/fixtures.ts';
import { isLocalSameOrigin } from '../../../lib/request-policy.ts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (!isLocalSameOrigin(origin, request.headers.get('host'), request.headers.get('sec-fetch-site'))) return reply({ error: '同一オリジンの画面から実行してください。' }, 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return reply({ error: 'JSON形式で送信してください。' }, 415);
  try {
    // Stream-bound request; do not trust Content-Length alone.
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: '入力がありません。' }, 400);
    const chunks: Uint8Array[] = []; let size = 0;
    let expired = false;
    const deadline = setTimeout(() => { expired = true; void reader.cancel().catch(() => {}); }, 5_000);
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 32_768) { await reader.cancel(); return reply({ error: '入力サイズが上限を超えています。' }, 413); }
        chunks.push(value);
      }
    } finally { clearTimeout(deadline); }
    if (expired) return reply({ error: '入力の受信がタイムアウトしました。' }, 408);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || body.mode !== 'mock' || body.criteria !== CRITERIA_VERSION) return reply({ error: 'この版はモック専用です。判定条件を確認してください。' }, 400);
    if (body.kind === 'relevance') {
      const profile = profiles.find(p => p.id === body.profile?.id);
      const thread = threads.find(t => t.id === body.thread?.id);
      const model = relevanceModels.find(m => m.key === body.model);
      if (!profile || !thread || !model || JSON.stringify(profile) !== JSON.stringify(body.profile) || JSON.stringify(thread) !== JSON.stringify(body.thread)) return reply({ error: 'モックは未編集の同梱プロフィールとスレッドに限定しています。' }, 422);
      return reply({ result: mockRelevance(profile.id, model.key, thread.caseIndex), modelId: model.id, mode: 'mock', criteria: CRITERIA_VERSION });
    }
    if (body.kind === 'video') {
      const model = videoModels.find(m => m.key === body.model);
      if (!model || body.sampleId !== SAMPLE_VIDEO_ID || !Number.isInteger(body.time) || body.time < 0 || body.time >= 24 || body.frameId !== `frame-${body.time}` || !Number.isInteger(body.total) || body.total < 1 || body.total > 30) return reply({ error: '動画のモック入力が不正です。最大30枚の同梱サンプルに限定しています。' }, 422);
      return reply({ result: mockFrame(model.key, body.time), modelId: model.id, mode: 'mock', criteria: CRITERIA_VERSION });
    }
    return reply({ error: '判定対象が不正です。' }, 400);
  } catch { return reply({ error: '入力を解析できませんでした。' }, 400); }
}
