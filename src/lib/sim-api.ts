/**
 * SIM API (Dune) - Token metadata fetching
 * Provides token icons, names, symbols, and chain information
 */

const SIM_API_BASE = 'https://api.sim.dune.com/v1/evm'
const SIM_API_KEY = 'sim_yJ9eK6Ch8pM6jzMcochVr9KNFePIRlRu'

// Native ETH address used by Relay
const NATIVE_ETH_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'

// Chain ID to chain info mapping
export const CHAIN_INFO: Record<number, ChainInfo> = {
  1: {
    id: 1,
    name: 'Ethereum',
    shortName: 'ETH',
    icon: 'https://icons.llamao.fi/icons/chains/rsz_ethereum.jpg',
    explorer: 'https://etherscan.io',
    nativeSymbol: 'ETH',
  },
  8453: {
    id: 8453,
    name: 'Base',
    shortName: 'Base',
    icon: 'https://icons.llamao.fi/icons/chains/rsz_base.jpg',
    explorer: 'https://basescan.org',
    nativeSymbol: 'ETH',
  },
  42161: {
    id: 42161,
    name: 'Arbitrum',
    shortName: 'Arb',
    icon: 'https://icons.llamao.fi/icons/chains/rsz_arbitrum.jpg',
    explorer: 'https://arbiscan.io',
    nativeSymbol: 'ETH',
  },
  10: {
    id: 10,
    name: 'Optimism',
    shortName: 'OP',
    icon: 'https://icons.llamao.fi/icons/chains/rsz_optimism.jpg',
    explorer: 'https://optimistic.etherscan.io',
    nativeSymbol: 'ETH',
  },
  137: {
    id: 137,
    name: 'Polygon',
    shortName: 'Poly',
    icon: 'https://icons.llamao.fi/icons/chains/rsz_polygon.jpg',
    explorer: 'https://polygonscan.com',
    nativeSymbol: 'MATIC',
  },
}

export interface ChainInfo {
  id: number
  name: string
  shortName: string
  icon: string
  explorer: string
  nativeSymbol: string
}

export interface TokenInfo {
  address: string
  chainId: number
  name: string
  symbol: string
  decimals: number
  logoURI: string | null
  priceUsd?: number
}

export interface SIMTokenResponse {
  address: string
  chain_id: number
  name: string
  symbol: string
  decimals: number
  logo_url: string | null
  price_usd?: number
}

// In-memory cache for token info
const tokenCache = new Map<string, { data: TokenInfo; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Get cache key for a token
 */
function getCacheKey(address: string, chainId: number): string {
  return `${chainId}:${address.toLowerCase()}`
}

/**
 * Get native ETH token info (doesn't require API call)
 */
function getNativeETHInfo(chainId: number): TokenInfo {
  const chain = CHAIN_INFO[chainId]
  return {
    address: NATIVE_ETH_ADDRESS,
    chainId,
    name: chain?.nativeSymbol === 'MATIC' ? 'Polygon' : 'Ethereum',
    symbol: chain?.nativeSymbol || 'ETH',
    decimals: 18,
    logoURI: 'https://icons.llamao.fi/icons/chains/rsz_ethereum.jpg',
  }
}

/**
 * Fetch token info from SIM API
 */
export async function getTokenInfo(
  address: string,
  chainId: number
): Promise<TokenInfo | null> {
  // Handle native ETH
  if (
    address.toLowerCase() === NATIVE_ETH_ADDRESS.toLowerCase() ||
    address === '0x0000000000000000000000000000000000000000'
  ) {
    return getNativeETHInfo(chainId)
  }

  // Check cache first
  const cacheKey = getCacheKey(address, chainId)
  const cached = tokenCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data
  }

  try {
    const response = await fetch(
      `${SIM_API_BASE}/token-info/${address}?chain_ids=${chainId}`,
      {
        headers: {
          'X-Sim-Api-Key': SIM_API_KEY,
        },
      }
    )

    if (!response.ok) {
      console.warn(`SIM API error for ${address}:`, response.status)
      return null
    }

    const data = await response.json()

    // Response is an array, find the token for our chain
    const tokenData = Array.isArray(data)
      ? data.find((t: SIMTokenResponse) => t.chain_id === chainId)
      : data

    if (!tokenData) {
      return null
    }

    const tokenInfo: TokenInfo = {
      address: tokenData.address,
      chainId: tokenData.chain_id,
      name: tokenData.name,
      symbol: tokenData.symbol,
      decimals: tokenData.decimals,
      logoURI: tokenData.logo_url,
      priceUsd: tokenData.price_usd,
    }

    // Cache the result
    tokenCache.set(cacheKey, { data: tokenInfo, timestamp: Date.now() })

    return tokenInfo
  } catch (error) {
    console.error('Failed to fetch token info:', error)
    return null
  }
}

/**
 * Fetch multiple tokens at once
 */
export async function getMultipleTokenInfo(
  tokens: Array<{ address: string; chainId: number }>
): Promise<Map<string, TokenInfo>> {
  const results = new Map<string, TokenInfo>()

  // Fetch all tokens in parallel
  const promises = tokens.map(async ({ address, chainId }) => {
    const info = await getTokenInfo(address, chainId)
    if (info) {
      results.set(getCacheKey(address, chainId), info)
    }
  })

  await Promise.all(promises)
  return results
}

/**
 * Get chain info by ID
 */
export function getChainInfo(chainId: number): ChainInfo | undefined {
  return CHAIN_INFO[chainId]
}

/**
 * Get explorer URL for a transaction
 */
export function getExplorerTxUrl(chainId: number, txHash: string): string {
  const chain = CHAIN_INFO[chainId]
  if (!chain) {
    return `https://etherscan.io/tx/${txHash}`
  }
  return `${chain.explorer}/tx/${txHash}`
}

/**
 * Get explorer URL for an address
 */
export function getExplorerAddressUrl(chainId: number, address: string): string {
  const chain = CHAIN_INFO[chainId]
  if (!chain) {
    return `https://etherscan.io/address/${address}`
  }
  return `${chain.explorer}/address/${address}`
}

/**
 * Popular tokens with fallback icons
 * Used when SIM API doesn't return an icon
 */
export const KNOWN_TOKENS: Record<string, Partial<TokenInfo>> = {
  // USDC
  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913': {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logoURI: 'https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png',
  },
  '0xaf88d065e77c8cC2239327C5EDb3A432268e5831': {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logoURI: 'https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png',
  },
  '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85': {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logoURI: 'https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png',
  },
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48': {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logoURI: 'https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png',
  },
  // USDT
  '0xdAC17F958D2ee523a2206206994597C13D831ec7': {
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    logoURI: 'https://assets.coingecko.com/coins/images/325/small/Tether.png',
  },
  // WETH
  '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2': {
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
    logoURI: 'https://assets.coingecko.com/coins/images/2518/small/weth.png',
  },
  '0x4200000000000000000000000000000000000006': {
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
    logoURI: 'https://assets.coingecko.com/coins/images/2518/small/weth.png',
  },
  // Native ETH
  '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE': {
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: 18,
    logoURI: 'https://icons.llamao.fi/icons/chains/rsz_ethereum.jpg',
  },
}

/**
 * Get token info with fallback to known tokens
 */
export async function getTokenInfoWithFallback(
  address: string,
  chainId: number
): Promise<TokenInfo> {
  // Try API first
  const apiInfo = await getTokenInfo(address, chainId)
  if (apiInfo?.logoURI) {
    return apiInfo
  }

  // Fallback to known tokens
  const knownToken = KNOWN_TOKENS[address]
  if (knownToken) {
    return {
      address,
      chainId,
      name: knownToken.name || 'Unknown Token',
      symbol: knownToken.symbol || '???',
      decimals: knownToken.decimals || 18,
      logoURI: knownToken.logoURI || null,
    }
  }

  // Return API info without logo or default
  return apiInfo || {
    address,
    chainId,
    name: 'Unknown Token',
    symbol: '???',
    decimals: 18,
    logoURI: null,
  }
}
