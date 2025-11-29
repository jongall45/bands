// App constants
export const APP_NAME = 'bands.cash'
export const APP_DESCRIPTION = 'Self-custodial stablecoin neobank'

// Supported chains
export const SUPPORTED_CHAIN_IDS = [8453, 84532] as const // Base, Base Sepolia

// Token metadata
export const TOKENS = {
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    addresses: {
      8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base Mainnet
      84532: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // Base Sepolia
    },
    logo: '/tokens/usdc.svg',
  },
  USDT: {
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    addresses: {
      8453: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', // Base Mainnet
    },
    logo: '/tokens/usdt.svg',
  },
  DAI: {
    symbol: 'DAI',
    name: 'Dai Stablecoin',
    decimals: 18,
    addresses: {
      8453: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', // Base Mainnet
    },
    logo: '/tokens/dai.svg',
  },
} as const

// Format helpers
export function formatUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`
}

