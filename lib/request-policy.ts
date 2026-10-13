// The demo is local-only. Do not trust Next.js's internally reconstructed URL
// or forwarded headers when checking the browser's Origin.
export function isLocalSameOrigin(origin: string | null, host: string | null, site: string | null): boolean {
  if (!origin || !host || site === 'cross-site') return false;
  try {
    const parsed = new URL(origin);
    return ['127.0.0.1', 'localhost'].includes(parsed.hostname)
      && parsed.protocol === 'http:' && parsed.origin === origin
      && parsed.host === host;
  } catch { return false; }
}
