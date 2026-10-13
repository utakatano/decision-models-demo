'use client';
import { useRef, useState } from 'react';
import { useDemoMode } from '../components/DemoShell.tsx';
import RelevanceDemo from '../components/RelevanceDemo.tsx';
import VideoDemo from '../components/VideoDemo.tsx';
import ImportScreen from '../components/ImportScreen.tsx';
const tabs = [{ id: 'relevance', label: 'スレッドの選別' }, { id: 'video', label: '録画の確認箇所抽出' }, { id: 'import', label: 'CSV取り込み' }] as const;
type Tab = typeof tabs[number]['id'];
export default function Home() {
  const { mode, config } = useDemoMode();
  const [tab, setTab] = useState<Tab>('relevance');
  const buttons = useRef(new Map<Tab, HTMLButtonElement>());
  return <><div className="demo-tabs" role="tablist" aria-label="デモを切り替える">{tabs.map((item, index) => <button key={item.id} ref={node => { if (node) buttons.current.set(item.id, node); else buttons.current.delete(item.id); }} role="tab" id={`tab-${item.id}`} aria-controls={`panel-${item.id}`} aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)} onKeyDown={event => {
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
    if (next >= 0) { event.preventDefault(); setTab(tabs[next].id); buttons.current.get(tabs[next].id)?.focus(); }
  }}>{item.label}</button>)}</div><div role="tabpanel" id="panel-relevance" aria-labelledby="tab-relevance" hidden={tab !== 'relevance'}><RelevanceDemo mode={mode} config={config} /></div><div role="tabpanel" id="panel-video" aria-labelledby="tab-video" hidden={tab !== 'video'}><VideoDemo mode={mode} config={config} /></div><div role="tabpanel" id="panel-import" aria-labelledby="tab-import" hidden={tab !== 'import'}><ImportScreen /></div></>;
}
