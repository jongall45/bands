import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable Turbopack for build (use webpack)
  // Handle external packages that cause issues with SSR
  serverExternalPackages: [
    '@solana/web3.js',
    '@solana-program/system',
    'pino-pretty',
    'lokijs',
    'encoding',
  ],
  // Empty turbopack config to allow webpack to be used
  turbopack: {},
};

export default nextConfig;
