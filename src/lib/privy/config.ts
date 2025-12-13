/**
 * Privy Configuration for "Fomo-Style" No-Prompt Experience
 * 
 * This configuration enables:
 * - Auto-created embedded wallets on login
 * - Smart wallets (Account Abstraction)
 * - Gas sponsorship
 * - No confirmation modals
 * 
 * IMPORTANT: The "no confirmation" setting is controlled in the Privy Dashboard,
 * NOT in code. The `noPromptOnSignature` option is DEPRECATED.
 */

import { arbitrum, base, polygon } from 'viem/chains'
import type { PrivyClientConfig } from '@privy-io/react-auth'

// Supported chains for your app
export const SUPPORTED_CHAINS = [arbitrum, base, polygon] as const

// Default chain (where most transactions happen)
export const DEFAULT_CHAIN = arbitrum

// Chain IDs for quick lookup
export const CHAIN_IDS = {
  ARBITRUM: arbitrum.id,
  BASE: base.id,
  POLYGON: polygon.id,
} as const

/**
 * Privy configuration object
 * 
 * Key settings:
 * - embeddedWallets.createOnLogin: 'all-users' - Auto-create wallet on login
 * - defaultChain: Your primary chain
 * - supportedChains: All chains your app supports
 * 
 * NOTE: `noPromptOnSignature` is DEPRECATED and removed.
 * Configure "Require user confirmation" in Privy Dashboard instead.
 */
export const privyConfig: PrivyClientConfig = {
  // Appearance
  appearance: {
    theme: 'dark',
    accentColor: '#22c55e', // Green to match your app
    logo: '/icons/logo.svg',
    // Hide Privy branding for cleaner UX
    showWalletLoginFirst: false,
  },
  
  // Login methods
  loginMethods: ['email', 'sms', 'google', 'apple'],
  
  // Embedded wallet configuration
  embeddedWallets: {
    // Auto-create wallet for ALL users on login
    createOnLogin: 'all-users',
    
    // DEPRECATED: noPromptOnSignature - use Dashboard setting instead
    // noPromptOnSignature: true, // ❌ DO NOT USE
    
    // Show wallet UI only when explicitly requested
    // This hides the default Privy wallet modal
    showWalletUIs: false,
  },
  
  // Chain configuration
  defaultChain: DEFAULT_CHAIN,
  supportedChains: SUPPORTED_CHAINS,
  
  // External wallets (we disable these for embedded-only flow)
  externalWallets: {
    coinbaseWallet: {
      connectionOptions: 'smartWalletOnly',
    },
  },
  
  // Legal
  legal: {
    termsAndConditionsUrl: 'https://bands.cash/terms',
    privacyPolicyUrl: 'https://bands.cash/privacy',
  },
}

/**
 * Smart Wallet Configuration
 * 
 * Privy's smart wallets use:
 * - Safe (Gnosis Safe) as the smart account implementation
 * - Pimlico as the default bundler
 * - Privy's paymaster for gas sponsorship (when enabled in Dashboard)
 */
export const smartWalletConfig = {
  // Chains where smart wallets are enabled
  // Must match Dashboard configuration
  enabledChains: [arbitrum.id, base.id, polygon.id],
}

/**
 * UI Options for silent transactions
 * 
 * Pass these options to embedded wallet methods to hide UI:
 * - signMessage
 * - signTypedData
 * - sendTransaction
 */
export const SILENT_UI_OPTIONS = {
  uiOptions: {
    showWalletUIs: false,
  },
}
