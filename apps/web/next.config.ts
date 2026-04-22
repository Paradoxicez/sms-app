import type { NextConfig } from 'next';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_URL}/api/:path*`,
      },
      // WebSocket handshakes must ride the same origin as the auth cookie
      // (localhost:3000 in dev) so Better Auth's session cookie reaches the
      // NestJS gateways' handleConnection. Next.js rewrites support the WS
      // upgrade dance, so this transparently proxies ws://localhost:3000/socket.io/*
      // to the API port. See debug/resolved/notifications-srs-log-gateways-reject-browser-cookies.md
      {
        source: '/socket.io/:path*',
        destination: `${API_URL}/socket.io/:path*`,
      },
    ];
  },
};

export default nextConfig;
