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

import { ReactNode, useState, useEffect } from 'react'
import { PrivyProvider as BasePrivyProvider } from '@privy-io/react-auth'
import { AppUrlListener } from '@/components/capacitor/AppUrlListener'
import { SmartWalletsProvider } from '@privy-io/react-auth/smart-wallets'
import { WagmiProvider, createConfig } from '@privy-io/wagmi'
import { http } from 'viem'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { arbitrum, base, polygon } from 'viem/chains'

// ============================================
// CONFIGURATION
// ============================================

// Your Privy App ID (from Dashboard)
const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || ''

/**
 * Detect if running in Capacitor native app
 * This check must happen on client-side only
 */
const isCapacitorNative = (): boolean => {
  if (typeof window === 'undefined') return false
  return !!(window as any).Capacitor?.isNativePlatform?.()
}

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
 * Privy configuration
 *
 * KEY SETTINGS:
 * - embeddedWallets.createOnLogin: 'all-users' → Auto-create wallet
 * - embeddedWallets.showWalletUIs: false → Hide wallet modals by default
 */
const getPrivyConfig = (isNative: boolean) => ({
  // Appearance
  appearance: {
    theme: 'dark' as const,
    accentColor: '#22c55e' as `#${string}`, // Green
    logo: '/icons/logo.svg',
    showWalletLoginFirst: false,
  },

  // Login methods - all methods on all platforms
  // Native OAuth is handled by ASWebAuthenticationSession via our NativeOAuth plugin
  loginMethods: ['email', 'google', 'apple'] as ('email' | 'google' | 'apple')[],

  // For native apps, set custom redirect URL for OAuth callback
  ...(isNative && { customOAuthRedirectUrl: 'https://www.bands.cash/redirect' }),

  // Embedded wallet configuration
  embeddedWallets: {
    ethereum: {
      // Auto-create embedded wallet for ALL users on login
      createOnLogin: 'all-users' as const,
    },

    // Hide wallet UIs by default (key for no-prompt UX)
    // Individual methods can override with uiOptions
    showWalletUIs: false,
  },

  // Chain configuration
  defaultChain: DEFAULT_CHAIN,
  supportedChains: [...SUPPORTED_CHAINS],

  // Disable external wallets (we only use embedded)
  // This simplifies UX - users always use embedded wallet
  externalWallets: {
    coinbaseWallet: {
      // Use smart wallet configuration
    },
  },

  // Legal links
  legal: {
    termsAndConditionsUrl: 'https://bands.cash/terms',
    privacyPolicyUrl: 'https://bands.cash/privacy',
  },
})

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
  // Use state to detect Capacitor environment after hydration
  // This ensures we don't have SSR/client mismatch issues
  const [isNative, setIsNative] = useState(false)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    // Check if we're in a Capacitor native app
    const native = isCapacitorNative()
    setIsNative(native)
    setIsReady(true)

    if (native) {
      console.log('[PrivyProviders] Running in Capacitor native app - enabling customOAuthRedirectUrl')
    }
  }, [])

  if (!PRIVY_APP_ID) {
    console.error('❌ NEXT_PUBLIC_PRIVY_APP_ID is not set!')
    return <div>Missing Privy configuration</div>
  }

  // Don't render until we've detected the environment
  // This prevents hydration mismatches and ensures correct OAuth config
  if (!isReady) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  // Get config based on platform
  // On mobile: email-only login (Google OAuth blocked in WebView)
  // On web: all login methods available
  const config = getPrivyConfig(isNative)

  return (
    <>
      {/* AppUrlListener handles OAuth interception and deep link callbacks for Capacitor */}
      <AppUrlListener />
      <BasePrivyProvider
        appId={PRIVY_APP_ID}
        config={config}
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
    </>
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
