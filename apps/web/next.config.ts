import type { NextConfig } from 'next';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Skip Next.js's default trailing-slash redirect so the /socket.io/ rewrite
  // reaches the upstream without the browser being bounced through a 308.
  // Socket.IO's default path IS "/socket.io/" with trailing slash — the
  // redirect happens before rewrites and strips it, breaking the match.
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_URL}/api/:path*`,
      },
      // WebSocket handshakes must ride the same origin as the auth cookie
      // (localhost:3000 in dev) so Better Auth's session cookie reaches the
      // NestJS gateways' handleConnection. Socket.IO's server is mounted at
      // `/socket.io/` *with trailing slash* — Next.js 15's `:path*` rewrite
      // collapses the trailing slash when the capture is empty, so we need
      // TWO explicit rules: one for the base path (empty capture) that
      // preserves the trailing slash, and one for sub-paths (non-empty).
      // See debug/resolved/notifications-srs-log-gateways-reject-browser-cookies.md
      {
        source: '/socket.io/',
        destination: `${API_URL}/socket.io/`,
      },
      {
        source: '/socket.io/:path+',
        destination: `${API_URL}/socket.io/:path+`,
      },
    ];
  },
};

export default nextConfig;
