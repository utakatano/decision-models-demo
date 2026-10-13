'use client';
import { useEffect, useRef, useState } from 'react';
import { parseContacts, type Contact } from '../lib/domain.ts';
import { errorMessage } from '../lib/client.ts';
export default function ImportScreen() {
  const [rows, setRows] = useState<Contact[]>([]);
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);
  const [dialog, setDialog] = useState<'confirm' | 'retry' | null>(null);
  const [failedOnce, setFailedOnce] = useState(false);
  const [fileName, setFileName] = useState('未選択');
  const [loading, setLoading] = useState(false);
  const native = useRef<HTMLDialogElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const version = useRef(0);
  useEffect(() => { if (dialog) native.current?.showModal(); else native.current?.close(); }, [dialog]);
  async function load(sample: 'invalid' | 'valid') {
    const token = ++version.current; setLoading(true); setError('');
    try { const response = await fetch(`/samples/contacts-${sample}.csv`); if (!response.ok) throw new Error('サンプルを読み込めません。'); const text = await response.text(); if (token === version.current) read(text, `contacts-${sample}.csv`); }
    catch (e) { if (token === version.current) { setRows([]); setError(errorMessage(e)); } }
    finally { if (token === version.current) setLoading(false); }
  }
  function read(text: string, name: string) {
    setFileName(name); setRows([]); setComplete(false); setDialog(null); setError('');
    try { setRows(parseContacts(text)); } catch (e) { setError(errorMessage(e)); }
  }
  function reset() { version.current++; setLoading(false); setRows([]); setError(''); setComplete(false); setDialog(null); setFailedOnce(false); setFileName('未選択'); if (file.current) file.current.value = ''; }
  function execute() { if (!failedOnce) { setFailedOnce(true); setDialog('retry'); } else { setDialog(null); setComplete(true); } }
  return <section aria-labelledby="import-heading" className="import-screen">
    <h1 id="import-heading">取引先CSV取り込み</h1><p>架空の取引先3件を取り込むサンプル画面です。処理はこの画面内で完結します。</p>
    <div className="toolbar"><button disabled={loading} onClick={() => load('invalid')}>不備のあるCSVを選ぶ</button><button disabled={loading} onClick={() => load('valid')}>修正済みCSVを選ぶ</button><button onClick={reset}>リセット</button></div>
    <p><a href="/samples/contacts-invalid.csv" download>不備のあるCSVをダウンロード</a> / <a href="/samples/contacts-valid.csv" download>修正済みCSVをダウンロード</a></p>
    <label htmlFor="csv-file">CSVファイル（20 KB以下・3件・引用符なし）</label><input ref={file} id="csv-file" type="file" accept=".csv,text/csv" onChange={async e => {
      const chosen = e.target.files?.[0]; if (!chosen) return; const token = ++version.current;
      if (chosen.size > 20_000) { read('', chosen.name); setError('CSVは20 KB以下にしてください。'); return; }
      try { const text = await chosen.text(); if (token === version.current) read(text, chosen.name); } catch { if (token === version.current) { setRows([]); setError('CSVを読み込めません。'); } }
    }} />
    <p>選択ファイル：{fileName}</p>
    {error && <p className="error-message" role="alert">{error}</p>}
    {complete && <p className="success" role="status">3件の取り込みが完了しました</p>}
    <table><thead><tr><th scope="col">取引先名</th><th scope="col">担当者</th><th scope="col">メールアドレス</th></tr></thead><tbody>{rows.length ? rows.map(r => <tr key={r.email}><td>{r.company}</td><td>{r.person}</td><td>{r.email}</td></tr>) : <tr><td colSpan={3}>CSVを選択すると、取り込む取引先が表示されます。</td></tr>}</tbody></table>
    <p><button className="primary" disabled={rows.length !== 3 || complete || loading} onClick={() => setDialog('confirm')}>取り込む</button></p>
    <dialog ref={native} onCancel={e => { e.preventDefault(); setDialog(null); }} aria-labelledby="dialog-message">
      <p id="dialog-message" className={dialog === 'retry' ? 'error' : ''}>{dialog === 'retry' ? '取り込みに失敗しました。再試行しますか？' : '3件の取引先を取り込みます。実行しますか？'}</p>
      <div className="toolbar"><button onClick={() => setDialog(null)}>キャンセル</button><button className="primary" onClick={execute}>{dialog === 'retry' ? '再試行' : '実行'}</button></div>
    </dialog>
    <p className="muted">初回の取り込みはデモとして失敗し、再試行で成功します。リセットで最初から繰り返せます。</p>
  </section>;
}
