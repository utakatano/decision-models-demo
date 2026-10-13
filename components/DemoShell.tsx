'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import type { Mode, ModelConfig } from '../lib/client.ts';
const DemoContext = createContext<{ mode: Mode; config: ModelConfig | null }>({ mode: 'mock', config: null });
export const useDemoMode = () => useContext(DemoContext);
export default function DemoShell({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>('mock');
  const [config, setConfig] = useState<ModelConfig | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/config', { signal: controller.signal, cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(value => { if (!controller.signal.aborted) setConfig(value); }).catch(() => {});
    return () => controller.abort();
  }, []);
  return <DemoContext.Provider value={{ mode, config }}><header className="demo-header"><a href="/" className="brand">判断モデル講習デモ</a><div className="mode-control"><label><span>モード</span><select aria-label="モード" value={mode} onChange={e => setMode(e.target.value as Mode)}><option value="mock">モック</option><option value="real" disabled={!config}>実API</option></select></label></div></header><main>{children}</main></DemoContext.Provider>;
}
