import { CRITERIA_VERSION } from './fixtures.ts';
export type Mode = 'mock' | 'real';
export type DecisionResponse<T> = { result: T; modelId: string; mode: Mode; criteria: string; elapsedMs?: number };
export type ModelConfig = { models: Record<'jev' | 'decisions' | 'd1' | 'clef', string>; available: Record<'jev' | 'decisions' | 'd1' | 'clef', boolean> };
export async function callDecision<T>(body: Record<string, unknown>, signal: AbortSignal): Promise<DecisionResponse<T>> {
  const real = body.mode === 'real';
  const response = await fetch(real ? '/api/decide' : '/api/mock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.any([signal, AbortSignal.timeout(real ? 40_000 : 15_000)]), cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : '判定に失敗しました。');
  if (data.mode !== body.mode || data.criteria !== CRITERIA_VERSION || typeof data.modelId !== 'string' || !data.result) throw new Error('判定応答が不正です。');
  return data as DecisionResponse<T>;
}
export type Result<T> = { status: 'done'; value: T; cached: boolean; modelId?: string; elapsedMs?: number; mode?: Mode } | { status: 'error'; error: string } | { status: 'running' };
export function errorMessage(error: unknown) { return error instanceof Error ? error.message : '判定に失敗しました。'; }
