import { publicConfig } from '../../../lib/real-adapters.ts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try { return Response.json(publicConfig(process.env), { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return Response.json({ error: 'モデル設定を確認してください。' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
