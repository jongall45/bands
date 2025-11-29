# 🏦 bands.cash

Self-custodial stablecoin neobank built with Next.js 14, Privy, Wagmi, and Framer Motion.

![bands.cash](https://img.shields.io/badge/Base-Network-blue) ![Next.js](https://img.shields.io/badge/Next.js-14-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)

## Features

- 🔐 **Self-Custodial Wallets** - Users own their keys via Privy embedded wallets
- 🌐 **Social Login** - Sign in with Email, Google, Apple, or Twitter
- 💸 **Send & Receive USDC** - Native stablecoin transfers on Base
- ⚡ **Low Fees** - Built on Base for minimal transaction costs
- 🎨 **Beautiful UI** - Dark theme with smooth Framer Motion animations
- 📱 **Mobile Responsive** - Works seamlessly on all devices

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Auth & Wallets**: Privy
- **Blockchain**: Wagmi v2 + Viem
- **Chain**: Base (Ethereum L2)
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion
- **Fonts**: Outfit + Space Mono

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Privy account ([console.privy.io](https://console.privy.io))

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd bands
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
# Create .env.local file
cp .env.example .env.local

# Add your Privy App ID
NEXT_PUBLIC_PRIVY_APP_ID=your-privy-app-id
```

4. Start the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000)

## Privy Setup

1. Go to [console.privy.io](https://console.privy.io)
2. Create a new app
3. Copy the App ID
4. Enable the following login methods:
   - Email
   - Google
   - Apple
   - Twitter
5. Configure embedded wallets:
   - Enable "Create wallet on login"
6. Add your domain to allowed origins

### Optional: Smart Wallet & Gas Sponsorship

To enable gas sponsorship (users don't need ETH):

1. In Privy Dashboard → Smart Wallets
2. Enable Smart Wallets
3. Configure a Paymaster (Pimlico, Alchemy, etc.)
4. Set sponsorship policies for USDC transfers on Base

## Project Structure

```
src/
├── app/
│   ├── layout.tsx          # Root layout with providers
│   ├── page.tsx            # Landing page
│   ├── globals.css         # Global styles
│   └── dashboard/
│       └── page.tsx        # Main dashboard
├── components/
│   ├── providers/
│   │   └── Providers.tsx   # Privy + Wagmi providers
│   └── ui/
│       ├── Button.tsx      # Reusable button component
│       └── Card.tsx        # Reusable card component
├── lib/
│   ├── wagmi.ts            # Wagmi config & ABIs
│   └── constants.ts        # App constants
└── hooks/
    └── useStablecoinBalance.ts  # Balance hook
```

## Key Files

- **`Providers.tsx`** - Sets up Privy auth, Wagmi, and React Query
- **`wagmi.ts`** - Chain configuration and ERC20 ABI
- **`page.tsx` (landing)** - Auth flow and feature showcase
- **`page.tsx` (dashboard)** - Balance display, send/receive modals

## Customization

### Change Primary Color

Edit the emerald color values in:
- `tailwind.config.ts`
- `globals.css` (CSS variables)
- `Providers.tsx` (Privy accent color)

### Add More Tokens

Edit `src/lib/constants.ts` to add more stablecoin addresses.

### Change Supported Chains

Edit `src/lib/wagmi.ts` and `src/components/providers/Providers.tsx`.

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import in Vercel
3. Add environment variable: `NEXT_PUBLIC_PRIVY_APP_ID`
4. Deploy

### Other Platforms

Build the production bundle:
```bash
npm run build
npm start
```

## Security Notes

- Never commit `.env.local` to version control
- Configure allowed domains in Privy Dashboard
- Review Privy's [security best practices](https://docs.privy.io/guide/security)

## License

MIT

---

Built with 💚 on Base
