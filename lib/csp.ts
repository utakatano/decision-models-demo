export function contentSecurityPolicy(nonce?: string, dev = false) {
  return [
    "default-src 'self'",
    nonce ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}` : "script-src 'self'" + (dev ? " 'unsafe-eval'" : ''),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "connect-src 'self'" + (dev ? ' ws://127.0.0.1:3000' : ''),
    "object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'", "form-action 'self'",
  ].join('; ');
}
