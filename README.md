# bands.cash

Self-custodial stablecoin neobank built with Next.js 14, Privy, and Relay Protocol.

![bands.cash](https://img.shields.io/badge/Base-Network-blue) ![Next.js](https://img.shields.io/badge/Next.js-14-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)

## Features

- **Self-Custodial Wallets** - Users own their keys via Privy embedded wallets
- **Smart Wallets** - ERC-4337 account abstraction with gas sponsorship
- **Social Login** - Sign in with Email, Google, or Apple
- **Cross-Chain Swaps** - Bridge and swap across chains via Relay Protocol
- **Multi-Chain Support** - Base, Arbitrum, Polygon, Optimism, Solana
- **Fiat Onramp** - Buy crypto with card via Moonpay
- **DeFi Yields** - Earn yield on stablecoins via Morpho
- **Mobile App** - iOS app via Capacitor

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Auth & Wallets**: Privy (embedded wallets + smart wallets)
- **Blockchain**: Wagmi v2 + Viem
- **Cross-Chain**: Relay Protocol
- **Chains**: Base, Arbitrum, Polygon, Optimism, Solana
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Privy account ([console.privy.io](https://console.privy.io))

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/bands.git
cd bands
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env.local
```

Required environment variables:
```bash
# Privy (required)
NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id

# Solana RPC (optional - for Solana support)
NEXT_PUBLIC_HELIUS_RPC_KEY=your-helius-api-key

# Block explorer APIs (optional)
BASESCAN_API_KEY=your-basescan-key
```

4. Start the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000)

## Privy Setup

1. Go to [console.privy.io](https://console.privy.io)
2. Create a new app
3. Copy the App ID to `NEXT_PUBLIC_PRIVY_APP_ID`
4. Enable login methods: Email, Google, Apple
5. Enable embedded wallets with "Create wallet on login"
6. Enable Smart Wallets for gas sponsorship
7. Add your domain to allowed origins

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── page.tsx           # Landing page
│   ├── dashboard/         # Main dashboard
│   └── api/               # API routes
├── components/
│   ├── providers/         # Privy + Wagmi providers
│   ├── relay/             # Cross-chain swap components
│   ├── auth/              # Authentication components
│   └── layout/            # Layout components
├── hooks/
│   ├── useAuth.ts         # Main auth hook
│   └── useSolanaAuth.ts   # Solana wallet hook
└── lib/
    ├── privy/             # Privy configuration
    └── relay/             # Relay SDK adapters
```

## Key Components

- **`useAuth`** - Main authentication hook with wallet state
- **`useRelaySwap`** - Cross-chain swap hook using Relay Protocol
- **`Providers`** - Root provider setup (Privy, Wagmi, Smart Wallets)

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import in Vercel
3. Add environment variables
4. Deploy

### Environment Variables for Production

```bash
NEXT_PUBLIC_PRIVY_APP_ID=xxx
NEXT_PUBLIC_HELIUS_RPC_KEY=xxx
BASESCAN_API_KEY=xxx
```

## Security Notes

- Never commit `.env.local` to version control
- API keys should only be in environment variables
- Configure allowed domains in Privy Dashboard
- Review Privy's [security best practices](https://docs.privy.io/guide/security)

## License

MIT
