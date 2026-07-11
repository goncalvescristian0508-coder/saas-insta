import type { NextConfig } from 'next';

// cache-bust: 2026-07-11T20:09
const nextConfig: NextConfig = {
  trailingSlash: false,
  skipTrailingSlashRedirect: true,
  allowedDevOrigins: ['luster-discuss-hurried.ngrok-free.dev'],
  serverExternalPackages: [
    'apify-client',
    'proxy-agent',
    'ffmpeg-static',
    'ffprobe-static',
    'instagram-private-api',
    '@prisma/client',
    'undici',
    'https-proxy-agent',
  ],
};

export default nextConfig;
