import type { NextConfig } from 'next';

import { contentSecurityPolicy } from './lib/csp.ts';
const csp = contentSecurityPolicy(undefined, process.env.NODE_ENV !== 'production');
const config: NextConfig = {
  poweredByHeader: false,
  images: { unoptimized: true, remotePatterns: [] },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'Content-Security-Policy', value: csp },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'X-Frame-Options', value: 'DENY' },
    ] }, { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] }];
  },
};
export default config;
