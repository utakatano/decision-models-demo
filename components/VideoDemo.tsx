'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CRITERIA_VERSION, SAMPLE_VIDEO_ID, videoModels, tags, type VideoModel, type VideoJudgment } from '../lib/fixtures.ts';
import { aggregate, digest, pool, videoError, type Frame } from '../lib/domain.ts';
import { extractFrames } from '../lib/video.ts';
import { callDecision, errorMessage, type Result, type Mode, type ModelConfig, type DecisionResponse } from '../lib/client.ts';
import manifest from '../public/samples/video-manifest.json';
type Results = Record<string, Record<string, Result<VideoJudgment>>>;
export default function VideoDemo({ mode = 'mock', config = null }: { mode?: Mode; config?: ModelConfig | null }) {
  const [src, setSrc] = useState('');
  const [name, setName] = useState('未選択');
  const [bytes, setBytes] = useState(0);
  const [mime, setMime] = useState('');
  const [duration, setDuration] = useState(NaN);
  const [isSample, setIsSample] = useState(false);
  const [model, setModel] = useState<VideoModel>('d1');
  const [frames, setFrames] = useState<Frame[]>([]);
  const [results, setResults] = useState<Results>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [filter, setFilter] = useState('all');
  const [position, setPosition] = useState(0);
  const [selectedDetection, setSelectedDetection] = useState<string | null>(null);
  const detectionPanel = useRef<HTMLDivElement>(null);
  const player = useRef<HTMLVideoElement>(null);
  const version = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const cache = useRef(new Map<string, DecisionResponse<VideoJudgment>>());
  useEffect(() => () => { version.current++; abort.current?.abort(); }, []);
  useEffect(() => () => { if (src.startsWith('blob:')) URL.revokeObjectURL(src); }, [src]);
  useEffect(() => {
    if (!loading || !src) return;
    const timer = setTimeout(() => { setLoading(false); setDuration(NaN); setError('動画の長さを取得できませんでした。'); }, 10_000);
    return () => clearTimeout(timer);
  }, [loading, src]);
  useLayoutEffect(() => { version.current++; abort.current?.abort(); lock.current = false; setBusy(false); setProgress(''); setSelectedDetection(null); setError(''); }, [mode]);
  const validation = src ? videoError(bytes, mime, duration) : null;
  const valid = !!src && !validation && !loading;
  const resultKey = `${mode}:${model}`;
  const canRun = valid && (mode === 'real' ? !!config?.available[model] : isSample);
  const selected = results[resultKey] || {};
  const done = Object.values(selected).filter(r => r.status === 'done').length;
  const failed = Object.values(selected).filter(r => r.status === 'error').length;
  const unknown = Object.values(selected).filter(r => r.status === 'done' && Object.values(r.value).includes('判定不能')).length;
  const observations = frames.map(f => { const r = selected[f.id]; return { time: f.time, judgment: r?.status === 'done' ? r.value : undefined, failed: r?.status === 'error' }; });
  const intervals = aggregate(observations).filter(i => filter === 'all' || i.tag === filter);
  const highlighted = intervals.filter(i => position >= i.start && position < Math.min(i.end + 1, duration)).map(i => `${i.tag}-${i.start}`).join('|');
  useLayoutEffect(() => {
    const panel = detectionPanel.current;
    if (!panel || !highlighted) return;
    const active = [...panel.querySelectorAll<HTMLButtonElement>('.detection.is-current')];
    if (!active.length) return;
    const bounds = panel.getBoundingClientRect();
    const rects = active.map(node => node.getBoundingClientRect());
    let top = Math.min(...rects.map(rect => rect.top));
    let bottom = Math.max(...rects.map(rect => rect.bottom));
    if (bottom - top > panel.clientHeight - 16) {
      const target = active.find(node => node.getAttribute('aria-pressed') === 'true') || active[0];
      const rect = target.getBoundingClientRect(); top = rect.top; bottom = rect.bottom;
    }
    const viewTop = bounds.top + panel.clientTop + 8;
    const viewBottom = bounds.top + panel.clientTop + panel.clientHeight - 8;
    // Scroll only the list container; never scroll its ancestors or the player.
    if (top < viewTop) panel.scrollTop += top - viewTop;
    else if (bottom > viewBottom) panel.scrollTop += bottom - viewBottom;
  }, [highlighted, selectedDetection, model]);
  async function choose(file: File) {
    const token = ++version.current; abort.current?.abort(); lock.current = false;
    setBusy(false); setLoading(true); setError(''); setProgress(''); setFrames([]); setResults({}); setSelectedDetection(null); setPosition(0); setDuration(NaN); setSrc(''); setIsSample(false); setName(file.name); setBytes(file.size); setMime(file.type);
    if (file.size > 100_000_000 || !['video/mp4','video/webm'].includes(file.type)) { setLoading(false); setError(file.size > 100_000_000 ? '容量は100 MB以下にしてください。' : '対応形式はMP4・WebMです。'); return; }
    try {
      const hash = await digest(await file.arrayBuffer());
      if (token !== version.current) return;
      setIsSample(hash === manifest.sha256); setSrc(URL.createObjectURL(file));
    } catch (e) { if (token === version.current) { setError(errorMessage(e)); setLoading(false); } }
  }
  async function loadSample() {
    if (loading) return; setLoading(true); setError('');
    const token = ++version.current; abort.current?.abort(); lock.current = false; setBusy(false); setFrames([]); setResults({}); setSelectedDetection(null); setPosition(0); setSrc(''); setProgress('');
    try {
      const response = await fetch('/samples/csv-import.webm', { cache: 'no-store' });
      if (!response.ok) throw new Error('サンプル動画を読み込めませんでした。');
      const blob = await response.blob();
      if (token !== version.current) return;
      await choose(new File([blob], 'csv-import.webm', { type: 'video/webm' }));
    } catch (e) { if (token === version.current) { setLoading(false); setError(errorMessage(e)); } }
  }
  function update(chosen: string, id: string, result: Result<VideoJudgment>) { setResults(previous => ({ ...previous, [chosen]: { ...previous[chosen], [id]: result } })); }
  async function run() {
    if (lock.current || !canRun) return;
    const token = version.current; const chosen = model; const keyForResults = resultKey; const controller = new AbortController(); abort.current = controller; lock.current = true; setBusy(true); setError('');
    try {
      let input = frames;
      if (!input.length) {
        setProgress('画像を抽出中…');
        input = await extractFrames(src, duration, controller.signal, n => { if (token === version.current) setProgress(`画像抽出 ${n} / ${Math.ceil(duration)}枚`); });
        if (token !== version.current) return;
        setFrames(input);
      }
      setProgress(mode === 'real' ? '実APIで解析中（最大2並列）' : '固定モック結果を読み込み中（最大2並列）');
      await pool(input, 2, async frame => {
        if (token !== version.current) return;
        const key = JSON.stringify({ video: src, image: frame.hash, frameId: frame.id, time: frame.time, modelId: mode === 'real' ? config?.models[chosen] : videoModels.find(m => m.key === chosen)!.id, criteria: CRITERIA_VERSION, mode });
        const cached = cache.current.get(key);
        if (cached) { update(keyForResults, frame.id, { status: 'done', value: cached.result, cached: true, modelId: cached.modelId, mode: cached.mode }); return; }
        update(keyForResults, frame.id, { status: 'running' });
        try {
          // Real mode sends one extracted JPEG; the original video stays in the browser.
          const value = await callDecision<VideoJudgment>({ kind: 'video', mode, sampleId: SAMPLE_VIDEO_ID, frameId: frame.id, time: frame.time, total: input.length, ...(mode === 'real' ? { image: frame.jpeg, duration } : {}), model: chosen, criteria: CRITERIA_VERSION }, controller.signal);
          if (token !== version.current) return;
          cache.current.set(key, value); update(keyForResults, frame.id, { status: 'done', value: value.result, cached: false, modelId: value.modelId, mode: value.mode, elapsedMs: value.elapsedMs });
        } catch (e) { if (token === version.current) update(keyForResults, frame.id, { status: 'error', error: errorMessage(e) }); }
      });
      if (token === version.current) setProgress('完了');
    } catch (e) { if (token === version.current) { setError(errorMessage(e)); setProgress('判定失敗'); } }
    finally { if (token === version.current) { lock.current = false; setBusy(false); } }
  }
  function selectDetection(time: number, id: string) {
    if (!player.current) return;
    player.current.pause();
    player.current.currentTime = time;
    setSelectedDetection(id); setPosition(time);
  }

  return <section aria-label="録画の確認箇所抽出">
    <div className="toolbar"><button disabled={loading} onClick={loadSample}>サンプル動画を読み込む</button><label className="file-label">自分の動画を選ぶ<input aria-label="自分の動画を選ぶ" type="file" accept="video/mp4,video/webm" onChange={e => { const file = e.target.files?.[0]; if (file) void choose(file); e.target.value = ''; }} /></label></div>
    <p className="video-file-info" role="status"><span>MP4・WebM / 3秒超〜30秒 / 100 MB以下</span><span aria-hidden="true">｜</span><span>{loading ? '動画を読み込み中…' : `${name} / ${Number.isFinite(duration) ? duration.toFixed(3) + '秒' : '長さ未取得'} / ${(bytes / 1_000_000).toFixed(2)} MB`}</span></p>
    {error && <p className="error-message" role="alert">{error}</p>}
    {src && !loading && validation && <p className="error" role="alert">{validation}</p>}
    {mode === 'mock' && valid && !isSample && <p>判定できるのはサンプル動画のみです。</p>}
    {mode === 'real' && !config?.available[model] && <p className="error" role="alert">選択サービスのキー・設定を確認してください。</p>}
    <div className="toolbar"><label>モデル<select value={model} disabled={busy} onChange={e => { setModel(e.target.value as VideoModel); setSelectedDetection(null); }}>{videoModels.map(m => <option key={m.key} value={m.key}>{m.label} ({mode === 'real' ? config?.models[m.key] : m.id})</option>)}</select></label><button className="primary" disabled={!canRun || busy} onClick={run}>{busy ? '解析中…' : '解析する'}</button></div>
    <p aria-live="polite" role="status">{busy ? progress : done + failed === frames.length && frames.length > 0 ? '完了' : '未判定'}：処理済み {done + failed} / {frames.length || (valid ? Math.ceil(duration) : 0)}枚、判定不能を含む {unknown}枚、失敗 {failed}枚</p>
    
    <div className="video-workspace"><div className="video-preview">
    <video key={src} ref={player} src={src || undefined} controls preload="metadata" onTimeUpdate={e => setPosition(e.currentTarget.currentTime)} onSeeked={e => setPosition(e.currentTarget.currentTime)} onEnded={e => setPosition(e.currentTarget.currentTime)} onLoadedMetadata={e => { setDuration(e.currentTarget.duration); setLoading(false); }} onError={() => { setLoading(false); setDuration(NaN); setError('動画の再生情報を取得できませんでした。'); }} />
    </div><div ref={detectionPanel} className="video-detections">
    <div className="toolbar"><label>タグ<select aria-label="タグ" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">すべて</option>{tags.map(tag => <option key={tag}>{tag}</option>)}</select></label></div>
    <ul className="detection-list" aria-label="検出箇所" data-model={model}>{intervals.map(i => {
      const id = `${i.tag}-${i.start}`;
      // A detected frame represents its one-second sampling window.
      const current = position >= i.start && position < Math.min(i.end + 1, duration);
      const selected = selectedDetection === id;
      const result = results[resultKey]?.[`frame-${i.start}`];
      return <li key={id}><button className={`detection${current ? ' is-current' : ''}`} aria-pressed={selected} aria-current={current ? 'true' : undefined} onClick={() => selectDetection(i.start, id)} aria-label={`${i.tag}：${i.start}秒を表示`}><img src={frames.find(f => f.time === i.start)?.jpeg} alt={`${i.start}秒の操作画面`} /><span><strong>{i.tag}</strong><span>{i.start === i.end ? `${i.start}秒` : `${i.start}〜${i.end}秒`}</span>{result?.status === 'done' && <small>{result.modelId}{result.cached ? ' / キャッシュ' : result.elapsedMs !== undefined ? ` / ${result.elapsedMs} ms` : ''}</small>}</span></button></li>;
    })}</ul>
    {!intervals.length && <p className="muted">{busy ? '解析中…' : done ? '該当する検出箇所はありません。' : '解析後に検出箇所を表示します。'}</p>}
    {(unknown > 0 || failed > 0) && <details><summary>判定不能 {unknown}枚 / 失敗 {failed}枚</summary>{frames.map(f => { const r = selected[f.id]; return r?.status === 'error' ? <p className="error" key={f.id}>{f.time}秒：{r.error}</p> : r?.status === 'done' && Object.values(r.value).includes('判定不能') ? <p key={f.id}>{f.time}秒：{tags.filter(tag => r.value[tag] === '判定不能').join('、')}が判定不能</p> : null; })}</details>}
    </div></div>
  </section>;
}
