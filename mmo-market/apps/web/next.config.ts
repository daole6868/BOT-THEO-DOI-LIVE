import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';
import path from 'node:path';

// Dùng chung file .env ở thư mục gốc monorepo
loadEnvConfig(path.resolve(__dirname, '../..'));

const api = process.env.API_INTERNAL_URL || 'http://localhost:4000';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.resolve(__dirname, '../..'),
  transpilePackages: ['@mmo/ui'],
  poweredByHeader: false,
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000',
    NEXT_PUBLIC_DEV_TOOLS: process.env.NEXT_PUBLIC_DEV_TOOLS || 'false',
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '',
  },
  async rewrites() {
    // Trình duyệt chỉ gọi cùng origin /api -> Next chuyển tiếp tới API (cookie & CSRF giữ nguyên)
    return [{ source: '/api/:path*', destination: `${api}/api/:path*` }];
  },
};

export default nextConfig;
