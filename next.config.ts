import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Empty turbopack config to silence the warning
  turbopack: {},
  // Webpack config for Privy/WalletConnect compatibility (used in production build)
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        // Fix MetaMask SDK / Coinbase Wallet SDK dependency
        '@react-native-async-storage/async-storage': false,
      };
    }
    // Ignore the async-storage module entirely
    config.resolve.alias = {
      ...config.resolve.alias,
      '@react-native-async-storage/async-storage': false,
    };
    return config;
  },
  transpilePackages: [
    '@privy-io/react-auth',
    '@privy-io/wagmi',
  ],
};

export default nextConfig;
