import type { NextConfig } from 'next';

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
