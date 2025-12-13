'use client'

/**
 * Privy Providers for "Fomo-Style" No-Prompt Experience
 * 
 * This is the ROOT provider setup for your Next.js app.
 * 
 * Configuration:
 * - PrivyProvider: Core authentication + embedded wallets
 * - SmartWalletsProvider: Account Abstraction support
 * - WagmiProvider: React hooks for blockchain queries
 * 
 * IMPORTANT DASHBOARD SETTINGS (do this first!):
 * 1. Embedded wallets → Customization → "Require user confirmation" = OFF
 * 2. Embedded wallets → Smart wallets → Enable
 * 3. Embedded wallets → Gas sponsorship → Enable + select chains
 */

import { ReactNode } from 'react'
import { PrivyProvider as BasePrivyProvider } from '@privy-io/react-auth'
import { SmartWalletsProvider } from '@privy-io/react-auth/smart-wallets'
import { WagmiProvider, createConfig, http } from '@privy-io/wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { arbitrum, base, polygon } from 'viem/chains'

// ============================================
// CONFIGURATION
// ============================================

// Your Privy App ID (from Dashboard)
const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || ''

// Supported chains
const SUPPORTED_CHAINS = [arbitrum, base, polygon] as const

// Default chain (where most txs happen)
const DEFAULT_CHAIN = arbitrum

// Query client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
      retry: 3,
    },
  },
})

// Wagmi config
const wagmiConfig = createConfig({
  chains: SUPPORTED_CHAINS,
  transports: {
    [arbitrum.id]: http(),
    [base.id]: http(),
    [polygon.id]: http(),
  },
})

// ============================================
// PRIVY CONFIG
// ============================================

/**
 * Privy configuration for fomo-style UX
 * 
 * KEY SETTINGS:
 * - embeddedWallets.createOnLogin: 'all-users' → Auto-create wallet
 * - embeddedWallets.showWalletUIs: false → Hide wallet modals by default
 * 
 * NOTE: `noPromptOnSignature` is DEPRECATED!
 * Use Dashboard setting "Require user confirmation" = OFF instead.
 */
const privyConfig = {
  // Appearance
  appearance: {
    theme: 'dark' as const,
    accentColor: '#22c55e', // Green
    logo: '/icons/logo.svg',
    showWalletLoginFirst: false,
  },

  // Login methods
  loginMethods: ['email', 'google', 'apple'] as const,

  // Embedded wallet configuration
  embeddedWallets: {
    // Auto-create embedded wallet for ALL users on login
    createOnLogin: 'all-users' as const,

    // Hide wallet UIs by default (key for no-prompt UX)
    // Individual methods can override with uiOptions
    showWalletUIs: false,

    // DEPRECATED - DO NOT USE:
    // noPromptOnSignature: true, // ❌ This does nothing
    // Use Dashboard setting instead!
  },

  // Chain configuration
  defaultChain: DEFAULT_CHAIN,
  supportedChains: SUPPORTED_CHAINS,

  // Disable external wallets (we only use embedded)
  // This simplifies UX - users always use embedded wallet
  externalWallets: {
    coinbaseWallet: {
      connectionOptions: 'smartWalletOnly' as const,
    },
  },

  // Legal links
  legal: {
    termsAndConditionsUrl: 'https://bands.cash/terms',
    privacyPolicyUrl: 'https://bands.cash/privacy',
  },
}

// ============================================
// PROVIDERS COMPONENT
// ============================================

interface PrivyProvidersProps {
  children: ReactNode
}

/**
 * Root providers for Privy + Smart Wallets + Wagmi
 * 
 * Wrap your app with this at the root level:
 * 
 * ```tsx
 * // app/layout.tsx
 * import { PrivyProviders } from '@/lib/privy/providers'
 * 
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         <PrivyProviders>
 *           {children}
 *         </PrivyProviders>
 *       </body>
 *     </html>
 *   )
 * }
 * ```
 */
export function PrivyProviders({ children }: PrivyProvidersProps) {
  if (!PRIVY_APP_ID) {
    console.error('❌ NEXT_PUBLIC_PRIVY_APP_ID is not set!')
    return <div>Missing Privy configuration</div>
  }

  return (
    <BasePrivyProvider
      appId={PRIVY_APP_ID}
      config={privyConfig}
    >
      {/* SmartWalletsProvider MUST be inside PrivyProvider */}
      <SmartWalletsProvider>
        {/* QueryClient for React Query (used by Wagmi) */}
        <QueryClientProvider client={queryClient}>
          {/* Wagmi for blockchain hooks */}
          <WagmiProvider config={wagmiConfig}>
            {children}
          </WagmiProvider>
        </QueryClientProvider>
      </SmartWalletsProvider>
    </BasePrivyProvider>
  )
}

// ============================================
// EXPORTS
// ============================================

export { SUPPORTED_CHAINS, DEFAULT_CHAIN, wagmiConfig }

/**
 * SETUP CHECKLIST:
 * 
 * 1. Set NEXT_PUBLIC_PRIVY_APP_ID in .env.local
 * 
 * 2. Configure Privy Dashboard:
 *    □ Embedded wallets → Configuration → Create on login = ON
 *    □ Embedded wallets → Customization → Require confirmation = OFF ⬅️ KEY!
 *    □ Embedded wallets → Smart wallets → Enable = ON
 *    □ Embedded wallets → Gas sponsorship → Enable = ON
 *    □ Embedded wallets → Gas sponsorship → Select chains
 * 
 * 3. Wrap your app with PrivyProviders (this file)
 * 
 * 4. Use useFomoTransaction() hook for transactions
 * 
 * 5. Test:
 *    - Login should auto-create embedded wallet
 *    - Transactions should NOT show wallet modal
 *    - Gas should be sponsored (user pays $0)
 * 
 * DEBUGGING:
 * - If modals still appear: Check Dashboard "Require confirmation" setting
 * - If gas not sponsored: Check Dashboard "Gas sponsorship" settings
 * - If wallet not created: Check Dashboard "Create on login" setting
 */
