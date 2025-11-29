import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Webpack config for Privy/WalletConnect compatibility
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
  transpilePackages: [
    '@privy-io/react-auth',
    '@privy-io/wagmi',
  ],
};

export default nextConfig;
