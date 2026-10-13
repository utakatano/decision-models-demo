// Server-only: imported exclusively by API routes, never by client components.
import { actions, reasons, tags, choices, type Relevance, type VideoJudgment } from './fixtures.ts';
import { videoQuestionIds } from './decision-policy.ts';
import { buildModelRequest } from './model-requests.ts';
import { DecisionError, object, type RealInput } from './real-validation.ts';
type Env = Record<string, string | undefined>;
export function modelSettings(env: Env) {
  const jev = env.JEV_MODEL || 'jev-1.13.0';
  const decisions = env.OPENAI_DECISIONS_MODEL || 'gpt-6-luna';
  if (!/^jev-[a-zA-Z0-9.\-]+$/.test(jev) || !/^gpt-[a-zA-Z0-9.\-]+$/.test(decisions)) throw new DecisionError('モデル設定が不正です。', 503);
  return { jev, decisions, d1: 'd1', clef: 'clef-flash' };
}
export function publicConfig(env: Env) {
  return { models: modelSettings(env), available: { jev: !!env.TYPESAFE_API_KEY, decisions: !!env.OPENAI_API_KEY, d1: !!env.LIQUID_API_KEY, clef: !!env.CLOUDFLARE_API_TOKEN && /^[a-fA-F0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID || '') } };
}
// モデル別のURL・認証設定・JSON構造は model-requests.ts にまとめています。
export function adapterRequest(input: RealInput, env: Env) {
  return buildModelRequest(input, env, modelSettings(env));
}
export function parseAnswers(input: RealInput, payload: unknown): Relevance | VideoJudgment {
  try { return parseProviderAnswers(input, payload); }
  catch (e) { if (e instanceof DecisionError && e.status === 422) throw new DecisionError('API応答の形式が不正です。', 502); throw e; }
}
function parseProviderAnswers(input: RealInput, payload: unknown): Relevance | VideoJudgment {
  let data = object(payload);
  if (input.model === 'clef') {
    if (data.success !== true) throw new DecisionError('Cloudflareが判定を完了できませんでした。', 502);
    data = object(data.result);
  }
  let answers: Record<string, unknown>;
  if (input.model === 'decisions') {
    if (!Array.isArray(data.answers)) throw new DecisionError('API応答の回答配列が不正です。', 502);
    answers = Object.create(null);
    for (const value of data.answers) {
      const a = object(value);
      if (a.type === 'refusal') throw new DecisionError('OpenAIが判定を拒否しました。', 502);
      if (typeof a.name !== 'string' || Object.hasOwn(answers, a.name)) throw new DecisionError('API応答の質問IDが不正です。', 502);
      answers[a.name] = a;
    }
  } else answers = object(data.answers);
  function choice<T extends string>(name: string, allowed: readonly T[]): T {
    const a = object(answers[name]);
    if (a.type !== 'choice' || typeof a.choice !== 'string' || !allowed.includes(a.choice as T)) throw new DecisionError('API応答の選択肢が不正です。', 502);
    return a.choice as T;
  }
  if (input.kind === 'video') return Object.fromEntries(tags.map((tag, i) => [tag, choice(videoQuestionIds[i], choices)])) as VideoJudgment;
  const a = object(answers.relevance);
  if (a.type !== 'score' || typeof a.score !== 'number' || !Number.isFinite(a.score) || a.score < 0 || a.score > 4) throw new DecisionError('API応答の関連度が不正です。', 502);
  return { relevance: Math.round(100 * a.score / 4), action: choice('action', actions), reason: choice('reason', reasons) };
}
export async function callReal(input: RealInput, env: Env, signal: AbortSignal, fetcher: typeof fetch = fetch) {
  const request = adapterRequest(input, env);
  const started = performance.now();
  const controller = new AbortController();
  const combined = AbortSignal.any([signal, controller.signal, AbortSignal.timeout(30_000)]);
  try {
    // 4サービスともBearer認証のPOST。URLとbodyはモデル別の生成関数から受け取る。
    const response = await fetcher(request.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${request.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request.body),
      redirect: 'error',
      cache: 'no-store',
      signal: combined,
    });
    if (!response.ok) {
      await response.body?.cancel();
      const hint = response.status === 401 || response.status === 403 ? 'キー・権限・モデル利用可否を確認してください。' : response.status === 429 ? '利用上限または混雑のため実行できません。' : '接続先が判定を完了できませんでした。';
      throw new DecisionError(`実APIエラー（HTTP ${response.status}）：${hint}`, 502);
    }
    // Keep the deadline active through response reading; never expose raw provider errors.
    const reader = response.body?.getReader();
    if (!reader) throw new DecisionError('API応答が空です。', 502);
    const stop = () => { void reader.cancel().catch(() => {}); };
    combined.addEventListener('abort', stop, { once: true });
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) { if (combined.aborted) throw new Error('aborted'); const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 262_144) { await reader.cancel(); throw new DecisionError('API応答が上限を超えています。', 502); } chunks.push(value); }
      if (combined.aborted) throw new Error('aborted');
    } finally { combined.removeEventListener('abort', stop); reader.releaseLock(); }
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const result = parseAnswers(input, parsed);
    return { result, modelId: request.model, mode: 'real' as const, elapsedMs: Math.round(performance.now() - started) };
  } catch (e) {
    if (e instanceof DecisionError) throw e;
    throw new DecisionError(combined.aborted ? '実APIの処理を中止、またはタイムアウトしました。' : '実APIへの接続または応答の解析に失敗しました。', 502);
  } finally { controller.abort(); }
}
