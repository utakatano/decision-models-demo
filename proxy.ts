import { NextResponse, type NextRequest } from 'next/server';
import { contentSecurityPolicy } from './lib/csp.ts';
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = contentSecurityPolicy(nonce, process.env.NODE_ENV !== 'production');
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce); headers.set('Content-Security-Policy', csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
export const config = { matcher: ['/', '/import'] };
