import { base, arbitrum, polygon } from 'viem/chains'

export const MORPHO_CHAIN_ID = base.id // 8453

// USDC addresses per chain
export const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const
export const USDC_ARBITRUM = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as const
export const USDC_POLYGON = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' as const

// Chain logo URLs
const CHAIN_LOGOS = {
  base: 'https://assets.coingecko.com/coins/images/34494/standard/base.png',
  arbitrum: 'https://assets.coingecko.com/coins/images/16547/standard/arb.png',
  polygon: 'https://assets.coingecko.com/coins/images/4713/standard/polygon.png',
} as const

// Supported chains for Morpho vaults
export const MORPHO_CHAINS = [
  {
    id: base.id,
    name: 'Base',
    icon: CHAIN_LOGOS.base,
    usdcAddress: USDC_BASE,
  },
  {
    id: arbitrum.id,
    name: 'Arbitrum',
    icon: CHAIN_LOGOS.arbitrum,
    usdcAddress: USDC_ARBITRUM,
  },
  {
    id: polygon.id,
    name: 'Polygon',
    icon: CHAIN_LOGOS.polygon,
    usdcAddress: USDC_POLYGON,
  },
] as const

export type MorphoChain = typeof MORPHO_CHAINS[number]

// Maximum realistic APY (filter out bad data)
export const MAX_REALISTIC_APY = 0.50 // 50% - anything higher is likely bad data

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

