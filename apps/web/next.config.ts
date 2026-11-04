import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@protocol-z/shared', '@protocol-z/game-client'],
  reactStrictMode: true,
};

export default nextConfig;
