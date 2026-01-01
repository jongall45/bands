import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Webpack is the default in Next.js 16 - no need to disable Turbopack
  serverExternalPackages: ['pino', 'pino-pretty', 'thread-stream'],

  // Headers for Apple App Site Association (Universal Links)
  async headers() {
    return [
      {
        source: '/.well-known/apple-app-site-association',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/json',
          },
        ],
      },
    ]
  },

  images: {
    // Allow external images from these domains for asset icons
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'assets.coingecko.com',
        pathname: '/coins/images/**',
      },
      {
        protocol: 'https',
        hostname: 'logo.clearbit.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'flagcdn.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'upload.wikimedia.org',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'companiesmarketcap.com',
        pathname: '/**',
      },
    ],
  },
  webpack: (config, { isServer }) => {
    // Handle MetaMask SDK's react-native dependency (for both client and server)
    config.resolve.alias = {
      ...config.resolve.alias,
      '@react-native-async-storage/async-storage': false,
    };
    
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
    'porto',
    '@privy-io/react-auth',
  ],
};

export default nextConfig;
