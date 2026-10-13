import { handleReal } from '../../../lib/real-handler.ts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) { return handleReal(request, process.env); }
