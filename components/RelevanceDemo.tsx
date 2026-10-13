'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { profiles, threads, relevanceModels, actions, CRITERIA_VERSION, type Profile, type Relevance, type RelevanceModel } from '../lib/fixtures.ts';
import { pool, sortedThreads } from '../lib/domain.ts';
import { callDecision, errorMessage, type Result, type Mode, type ModelConfig, type DecisionResponse } from '../lib/client.ts';
type Applied = { model: RelevanceModel; rows: Record<string, Result<Relevance>> };
type Results = Record<string, Partial<Record<RelevanceModel, Record<string, Result<Relevance>>>>>;
export default function RelevanceDemo({ mode = 'mock', config = null }: { mode?: Mode; config?: ModelConfig | null }) {
  const profileDialog = useRef<HTMLDialogElement>(null);
  const [profileId, setProfileId] = useState(profiles[0].id);
  const [profile, setProfile] = useState<Profile>(profiles[0]);
  const [model, setModel] = useState<RelevanceModel>('jev');
  const [results, setResults] = useState<Results>({});
  const [applied, setApplied] = useState<Record<string, Applied>>({});
  const rowNodes = useRef(new Map<string, HTMLLIElement>());
  const before = useRef(new Map<string, number>());
  const animations = useRef<Animation[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [band, setBand] = useState('all');
  const [action, setAction] = useState('all');
  const abort = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const lock = useRef(false);
  const cache = useRef(new Map<string, DecisionResponse<Relevance>>());
  useEffect(() => () => { abort.current?.abort(); generation.current++; }, []);
  const preset = profiles.find(p => p.id === profileId)!;
  const unchanged = JSON.stringify(profile) === JSON.stringify(preset);
  const inputKey = JSON.stringify({ profile, threads, criteria: CRITERIA_VERSION, mode });
  const canRun = (mode === 'real' || unchanged) && (mode === 'mock' || !!config?.available[model]);
  const current = results[inputKey] || {};
  const selected = current[model] || {};
  const active = applied[inputKey];
  const visibleResults = active?.rows || {};
  const values = Object.fromEntries(Object.entries(visibleResults).flatMap(([id, r]) => r.status === 'done' ? [[id, r.value]] : []));
  const ordered = active ? sortedThreads(threads, values) : threads;
  const filtered = ordered.filter(t => {
      const r = values[t.id];
      return (band === 'all' || r && (band === 'high' ? r.relevance >= 70 : band === 'mid' ? r.relevance >= 40 && r.relevance < 70 : r.relevance < 40)) && (action === 'all' || r?.action === action);
    });
  const ranks = Object.fromEntries(ordered.filter(t => values[t.id]).map((t, i) => [t.id, i + 1]));
  useLayoutEffect(() => {
    if (!before.current.size) return;
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      rowNodes.current.forEach((node, id) => {
        const oldY = before.current.get(id);
        if (oldY === undefined) return;
        const delta = oldY - node.getBoundingClientRect().top;
        if (Math.abs(delta) > 1) animations.current.push(node.animate(
          [{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }],
          { duration: 700, easing: 'cubic-bezier(.2,.75,.25,1)' },
        ));
      });
    }
    before.current.clear();
  }, [applied]);
  useEffect(() => () => animations.current.forEach(animation => animation.cancel()), []);
  const done = Object.values(selected).filter(r => r.status === 'done').length;
  const failed = Object.values(selected).filter(r => r.status === 'error').length;
  function cancel() { animations.current.forEach(animation => animation.cancel()); animations.current = []; before.current.clear(); generation.current++; abort.current?.abort(); lock.current = false; setBusy(false); setError(''); }
  function selectProfile(id: string) { cancel(); setProfileId(id); setProfile(profiles.find(p => p.id === id)!); }
  function edit(update: Partial<Profile>) { cancel(); setProfile(previous => ({ ...previous, ...update })); }
  function update(id: string, value: Result<Relevance>, key: string, chosen: RelevanceModel) {
    setResults(previous => ({ ...previous, [key]: { ...previous[key], [chosen]: { ...previous[key]?.[chosen], [id]: value } } }));
  }
  useLayoutEffect(() => { cancel(); }, [mode]);
  async function run() {
    if (lock.current || !canRun || !profile) return;
    lock.current = true; setBusy(true); setError('');
    const token = ++generation.current; const controller = new AbortController(); abort.current = controller;
    const chosen = model; const key = inputKey; const input = profile;
    const finished: Record<string, Result<Relevance>> = {};
    const finish = (id: string, result: Result<Relevance>) => { finished[id] = result; update(id, result, key, chosen); };
    try {
      await pool(threads, 4, async thread => {
        if (token !== generation.current) return;
        const cacheKey = JSON.stringify({ input, thread, modelId: mode === 'real' ? config?.models[chosen] : relevanceModels.find(m => m.key === chosen)!.id, mode, criteria: CRITERIA_VERSION });
        const cached = cache.current.get(cacheKey);
        if (cached) { finish(thread.id, { status: 'done', value: cached.result, cached: true, modelId: cached.modelId, mode: cached.mode }); return; }
        update(thread.id, { status: 'running' }, key, chosen);
        try {
          const result = await callDecision<Relevance>({ kind: 'relevance', profile: input, thread, model: chosen, mode, criteria: CRITERIA_VERSION }, controller.signal);
          if (token !== generation.current) return;
          cache.current.set(cacheKey, result); finish(thread.id, { status: 'done', value: result.result, cached: false, modelId: result.modelId, mode: result.mode, elapsedMs: result.elapsedMs });
        } catch (e) { if (token === generation.current) finish(thread.id, { status: 'error', error: errorMessage(e) }); }
      });
      if (token === generation.current) {
        animations.current.forEach(animation => animation.cancel()); animations.current = [];
        before.current = new Map([...rowNodes.current].map(([id, node]) => [id, node.getBoundingClientRect().top]));
        setApplied(previous => ({ ...previous, [key]: { model: chosen, rows: finished } }));
      }
    } catch (e) { if (token === generation.current) setError(errorMessage(e)); }
    finally { if (token === generation.current) { lock.current = false; setBusy(false); } }
  }
  function judgment(id: string) {
    const result = visibleResults[id];
    if (!result) return <span className="muted">未判定</span>;
    if (result.status === 'running') return '処理中';
    if (result.status === 'error') return <span className="error">判定失敗：{result.error}</span>;
    return <><strong>関連度 {result.value.relevance}</strong><span>{result.value.action}</span><span>関連理由：{result.value.reason}</span><small>{result.modelId}{result.cached ? ' / キャッシュ' : result.elapsedMs !== undefined ? ` / ${result.elapsedMs} ms` : ''}</small></>;
  }
  return <section aria-label="スレッドの選別">
    <div className="profile-summary"><span><strong>{profile.name}</strong> / {profile.role.split('：')[0]}</span><button onClick={() => profileDialog.current?.showModal()}>プロフィールを確認・変更</button></div>
    <div className="relevance-controls"><label className="sr-only" htmlFor="relevance-model">モデル</label><select id="relevance-model" value={model} disabled={busy} onChange={e => setModel(e.target.value as RelevanceModel)}>{relevanceModels.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}</select>
      <button className="primary" disabled={busy || !canRun} onClick={run}>{busy ? '判定中…' : '判定する'}</button>
      <p role="status" aria-live="polite">{busy ? '処理中' : done + failed === threads.length ? '完了' : '未判定'}：処理済み {done + failed} / {threads.length}件、失敗 {failed}件</p>
      {Object.keys(results).length > 0 && !results[inputKey] && <p>プロフィール変更後は再判定が必要です。</p>}

      {error && <p className="error" role="alert">{error}</p>}</div>
    {mode === 'real' && !config?.available[model] && <p className="error" role="alert">選択サービスのキー・設定を確認してください。</p>}
    <dialog ref={profileDialog} className="profile-panel" aria-labelledby="profile-panel-title" onClick={e => { if (e.target === e.currentTarget) profileDialog.current?.close(); }}>
      <div className="profile-panel-heading"><h2 id="profile-panel-title">プロフィール設定</h2><button onClick={() => profileDialog.current?.close()} aria-label="プロフィール設定を閉じる">閉じる</button></div>
      <div><label htmlFor="profile">本人プロフィール</label><select id="profile" value={profileId} onChange={e => selectProfile(e.target.value)}>{profiles.map(p => <option key={p.id} value={p.id}>{p.name} / {p.role.split('：')[0]}</option>)}</select>
      <div className="profile-identities"><div><label htmlFor="profile-name">氏名</label><input id="profile-name" value={profile.name} onChange={e => edit({ name: e.target.value })} /></div><div><label htmlFor="profile-user">ユーザーID</label><input id="profile-user" value={profile.userId} onChange={e => edit({ userId: e.target.value })} /></div></div>
      <label htmlFor="profile-role">役割・担当業務</label><textarea id="profile-role" rows={2} value={profile.role} onChange={e => edit({ role: e.target.value })} />
      <label htmlFor="profile-projects">担当プロジェクト（1行に1件）</label><textarea id="profile-projects" rows={2} value={profile.projects.join('\n')} onChange={e => edit({ projects: e.target.value.split('\n') })} />
      <label htmlFor="profile-themes">注目しているテーマ（1行に1件）</label><textarea id="profile-themes" rows={2} value={profile.themes.join('\n')} onChange={e => edit({ themes: e.target.value.split('\n') })} />
      <details className="people"><summary>関係者の氏名・役割・案件を確認、編集する</summary>{profile.people.map((person, i) => <fieldset key={i}><legend>関係者 {i + 1}</legend>{(['name', 'userId', 'role', 'project'] as const).map((field, j) => <label key={field}>{['氏名', 'ユーザーID', '役割', '案件'][j]}<input value={person[field]} onChange={e => edit({ people: profile.people.map((p, index) => index === i ? { ...p, [field]: e.target.value } : p) })} /></label>)}</fieldset>)}</details>
      {mode === 'mock' && !unchanged && <p className="error">プロフィールが変更されています。再判定が必要ですが、自由入力の判定はモック版では利用できません。</p>}
      <button onClick={() => selectProfile(profileId)}>プリセットに戻す</button></div>
    </dialog>
    <div className="toolbar thread-filters"><label>関連度<select value={band} onChange={e => setBand(e.target.value)}><option value="all">すべて</option><option value="high">高：70以上</option><option value="mid">中：40〜69</option><option value="low">低：39以下</option></select></label><label>対応要否<select value={action} onChange={e => setAction(e.target.value)}><option value="all">すべて</option>{actions.map(a => <option key={a}>{a}</option>)}</select></label></div>
    <ol data-applied-model={active?.model} className="thread-list" aria-label="スレッド一覧">{filtered.map(t => <li key={t.id} data-thread-id={t.id} ref={node => { if (node) rowNodes.current.set(t.id, node); else rowNodes.current.delete(t.id); }}>
      <span className="thread-rank" aria-label={ranks[t.id] ? `${ranks[t.id]}位` : '未判定'}>{ranks[t.id] || '—'}</span>
      <div className="thread-body"><h3>{t.title}</h3><p className="thread-meta">{t.id} / {t.channel} / {new Date(t.updatedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</p>
      <div className="thread-judgment">{judgment(t.id)}</div><p>{t.posts[0].text}</p><details><summary>親投稿と返信を開く</summary>{t.posts.map((p, i) => <div className="post" key={i}><strong>{p.author} ({p.userId})</strong><small> / {p.at}</small><p>{p.text}</p><small>メンション：{p.mentions.join(', ') || 'なし'}</small></div>)}</details></div>
    </li>)}</ol>
    {filtered.length === 0 && <p>現在の条件に該当するスレッドはありません。</p>}
  </section>;
}
