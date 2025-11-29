import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Handle external packages that cause issues with SSR
  serverExternalPackages: [
    '@solana/web3.js',
    '@solana-program/system',
  ],
  webpack: (config) => {
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    return config;
  },
};

export default nextConfig;
