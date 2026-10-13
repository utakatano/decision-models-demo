import type { Thread, Relevance, VideoJudgment, Tag } from './fixtures.ts';
import { tags } from './fixtures.ts';
export function validDuration(duration: number) { return Number.isFinite(duration) && duration > 3 && duration <= 30; }
export function videoError(size: number, type: string, duration: number): string | null {
  if (size > 100_000_000) return '容量は100 MB以下にしてください。';
  if (!['video/mp4', 'video/webm'].includes(type)) return '対応形式はMP4・WebMです。';
  if (!validDuration(duration)) return '3秒より長く、30秒以内の動画を選択してください。';
  return null;
}
export function sampleTimes(duration: number): number[] {
  if (!validDuration(duration)) throw new Error('動画の長さが受付条件を満たしません');
  return Array.from({ length: Math.ceil(duration) }, (_, i) => i);
}
export function sortedThreads(input: Thread[], values: Record<string, Relevance>) {
  return [...input].sort((a, b) => (values[b.id]?.relevance ?? -1) - (values[a.id]?.relevance ?? -1) || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
}
export type Frame = { id: string; time: number; jpeg: string; hash: string };
export type Observation = { time: number; judgment?: VideoJudgment; failed?: boolean };
export type Interval = { tag: Tag; start: number; end: number };
export function aggregate(observations: Observation[]): Interval[] {
  const sorted = [...observations].sort((a, b) => a.time - b.time);
  const intervals: Interval[] = [];
  for (const tag of tags) {
    let current: Interval | undefined;
    for (const item of sorted) {
      if (!item.failed && item.judgment?.[tag] === 'あり') {
        if (current && item.time === current.end + 1) current.end = item.time;
        else { current = { tag, start: item.time, end: item.time }; intervals.push(current); }
      } else current = undefined;
    }
  }
  return intervals.sort((a, b) => a.start - b.start || tags.indexOf(a.tag) - tags.indexOf(b.tag));
}
export async function digest(content: string | ArrayBuffer): Promise<string> {
  const buffer = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map(x => x.toString(16).padStart(2, '0')).join('');
}
export async function pool<T>(items: T[], parallel: number, work: (item: T) => Promise<void>) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(parallel, items.length) }, async () => {
    while (cursor < items.length) { const item = items[cursor++]; await work(item); }
  }));
}
export type Contact = { company: string; person: string; email: string };
export function parseContacts(text: string): Contact[] {
  if (text.length > 20_000) throw new Error('CSVは20 KB以下にしてください。');
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  if (lines[0] !== '取引先名,担当者,メールアドレス') throw new Error('ヘッダーは「取引先名,担当者,メールアドレス」にしてください。');
  if (lines.length !== 4) throw new Error('デモでは取引先3件のCSVを選択してください。');
  return lines.slice(1).map((line, i) => {
    const fields = line.split(',').map(x => x.trim());
    if (fields.length !== 3) throw new Error(`${i + 2}行目の列数が不正です。引用符や改行を含むCSVは非対応です。`);
    const [company, person, email] = fields;
    if (!email) throw new Error(`${i + 2}行目のメールアドレスが未入力です`);
    if (!company || !person) throw new Error(`${i + 2}行目の取引先名・担当者を入力してください。`);
    if (fields.some(x => /^[=+@-]/.test(x))) throw new Error('数式形式のCSV値は受け付けません。');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`${i + 2}行目のメールアドレスが不正です。`);
    return { company, person, email };
  });
}
