import { base } from 'viem/chains'

export const MORPHO_CHAIN_ID = base.id // 8453

// USDC on Base
export const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const

// Featured USDC vaults on Base (curated selection)
export const FEATURED_VAULTS = [
  {
    address: '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A' as const,
    name: 'Spark USDC Vault',
    curator: 'Spark',
    description: 'Spark-curated USDC vault with blue-chip collateral exposure',
    featured: true,
  },
  {
    address: '0x616a4E1db48e22028f6bbf20444Cd3b8e3273738' as const,
    name: 'Seamless USDC Vault',
    curator: 'Seamless',
    description: 'Seamless protocol USDC vault optimized for Base',
    featured: true,
  },
  {
    address: '0x8A034f069D59d62a4643ad42E49b846d036468D7' as const,
    name: 'Blue Chip USDC (Prime)',
    curator: 'Gauntlet',
    description: 'Gauntlet-curated vault with conservative risk profile',
    featured: false,
  },
] as const

// Default vault for quick deposit
export const DEFAULT_VAULT = FEATURED_VAULTS[0]

