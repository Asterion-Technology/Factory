import path from 'node:path';
import type { NextConfig } from 'next';

// SEC-001 baseline headers; CSP hardening lands with Phase 1 routes.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Monorepo lives inside the Factory repo, which has its own lockfile —
  // pin tracing to this workspace so Next doesn't infer the wrong root.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;
