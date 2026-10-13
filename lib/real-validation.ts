import { profiles, threads, CRITERIA_VERSION, type Profile, type Thread } from './fixtures.ts';
export class DecisionError extends Error {
  status: number;
  constructor(message: string, status = 422) { super(message); this.status = status; }
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DecisionError('入力または応答の形式が不正です。');
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, empty = false): string {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) throw new DecisionError('プロフィールの項目・文字数を確認してください。');
  return value;
}
function strings(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 20) throw new DecisionError('プロフィールの項目数が上限を超えています。');
  return value.map(v => text(v, 500, true));
}
export function profileInput(value: unknown): Profile {
  const p = object(value);
  if (!profiles.some(preset => preset.id === p.id) || !Array.isArray(p.people) || p.people.length > 20) throw new DecisionError('プロフィールが不正です。');
  return { id: String(p.id), name: text(p.name, 100), userId: text(p.userId, 100), role: text(p.role, 2000), projects: strings(p.projects), themes: strings(p.themes), people: p.people.map(value => { const person = object(value); return { name: text(person.name, 100), userId: text(person.userId, 100), role: text(person.role, 500), project: text(person.project, 500) }; }) };
}
export function jpegInput(value: unknown): string {
  if (typeof value !== 'string' || value.length > 5_592_432 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new DecisionError('JPEG画像を1枚指定してください。');
  const encoded = value.slice('data:image/jpeg;base64,'.length);
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length > 4_194_304 || bytes.toString('base64') !== encoded || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) throw new DecisionError('画像の形式・サイズが不正です。');
  let dimensions = false;
  for (let offset = 2; offset + 4 < bytes.length;) {
    if (bytes[offset++] !== 0xff) break;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
    if (offset + 2 > bytes.length) break;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (length < 8) break;
      const height = bytes.readUInt16BE(offset + 3), width = bytes.readUInt16BE(offset + 5);
      dimensions = width > 0 && height > 0 && width <= 1280 && height <= 1280;
      break;
    }
    offset += length;
  }
  if (!dimensions) throw new DecisionError('画像は長辺1280px以下のJPEGにしてください。');
  return value;
}
export type RealInput = { kind: 'relevance'; model: 'jev' | 'decisions'; profile: Profile; thread: Thread } | { kind: 'video'; model: 'd1' | 'clef'; image: string };
export function validateReal(value: unknown): RealInput {
  const b = object(value);
  if (b.mode !== 'real' || b.criteria !== CRITERIA_VERSION) throw new DecisionError('モードまたは判定条件が不正です。');
  if (b.kind === 'relevance' && (b.model === 'jev' || b.model === 'decisions')) {
    const t = threads.find(t => t.id === object(b.thread).id);
    if (!t || JSON.stringify(t) !== JSON.stringify(b.thread)) throw new DecisionError('同梱スレッドを指定してください。');
    return { kind: 'relevance', model: b.model, profile: profileInput(b.profile), thread: t };
  }
  if (b.kind === 'video' && (b.model === 'd1' || b.model === 'clef')) {
    if (typeof b.duration !== 'number' || !Number.isFinite(b.duration) || b.duration <= 3 || b.duration > 30 || !Number.isInteger(b.total) || b.total !== Math.ceil(b.duration) || Number(b.total) > 30 || !Number.isInteger(b.time) || Number(b.time) < 0 || Number(b.time) >= Number(b.total) || b.frameId !== `frame-${b.time}`) throw new DecisionError('動画の長さ・フレーム数が不正です（最大30枚）。');
    return { kind: 'video', model: b.model, image: jpegInput(b.image) };
  }
  throw new DecisionError('判定対象またはモデルが不正です。');
}
export async function readJson(request: Request, limit: number): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new DecisionError('入力がありません。', 400);
  let expired = false, size = 0;
  const chunks: Uint8Array[] = [];
  const timer = setTimeout(() => { expired = true; void reader.cancel().catch(() => {}); }, 5000);
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); throw new DecisionError('入力サイズが上限を超えています。', 413); }
      chunks.push(value);
    }
    if (expired) throw new DecisionError('入力の受信がタイムアウトしました。', 408);
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new DecisionError('JSONを解析できませんでした。', 400); }
  } finally { clearTimeout(timer); reader.releaseLock(); }
}
