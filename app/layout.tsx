import type { Metadata } from 'next';
import './globals.css';
import DemoShell from '../components/DemoShell.tsx';
export const metadata: Metadata = { title: '判断モデル講習デモ', description: '架空データと同梱動画で操作できる判断モデルのモックデモ' };
export const dynamic = 'force-dynamic';
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="ja"><body><DemoShell>{children}</DemoShell><footer>サンプルは架空データです。入力・動画原本を永続保存しません。結果はタブを閉じると消えます。</footer></body></html>;
}
