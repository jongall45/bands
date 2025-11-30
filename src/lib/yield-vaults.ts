// Yield vault configurations for Base
export interface YieldVault {
  id: string
  name: string
  protocol: string
  protocolLogo: string
  address: `0x${string}`
  underlyingToken: `0x${string}`
  underlyingSymbol: string
  underlyingDecimals: number
  apy: number // Current APY as percentage
  tvl: string // Total value locked
  risk: 'low' | 'medium' | 'high'
  description: string
}

// Base Mainnet Yield Vaults
export const YIELD_VAULTS: YieldVault[] = [
  {
    id: 'moonwell-usdc',
    name: 'Moonwell USDC',
    protocol: 'Moonwell',
    protocolLogo: '🌙',
    address: '0xEdc817A28E8B93B03976FBd4a3dDBc9f7D176c22',
    underlyingToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    underlyingSymbol: 'USDC',
    underlyingDecimals: 6,
    apy: 4.2,
    tvl: '$45M',
    risk: 'low',
    description: 'Earn yield by lending USDC on Moonwell',
  },
  {
    id: 'aave-usdc',
    name: 'Aave USDC',
    protocol: 'Aave',
    protocolLogo: '👻',
    address: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5', // Aave Pool
    underlyingToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    underlyingSymbol: 'USDC',
    underlyingDecimals: 6,
    apy: 3.8,
    tvl: '$120M',
    risk: 'low',
    description: 'Supply USDC to Aave V3 on Base',
  },
  {
    id: 'moonwell-weth',
    name: 'Moonwell WETH',
    protocol: 'Moonwell',
    protocolLogo: '🌙',
    address: '0x628ff693426583D9a7FB391E54366292F509D457',
    underlyingToken: '0x4200000000000000000000000000000000000006',
    underlyingSymbol: 'WETH',
    underlyingDecimals: 18,
    apy: 1.5,
    tvl: '$28M',
    risk: 'low',
    description: 'Earn yield by lending WETH on Moonwell',
  },
  {
    id: 'aerodrome-usdc-eth',
    name: 'USDC-ETH LP',
    protocol: 'Aerodrome',
    protocolLogo: '✈️',
    address: '0x6cDcb1C4A4D1C3C6d054b27AC5B77e89eAFb971d',
    underlyingToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    underlyingSymbol: 'USDC',
    underlyingDecimals: 6,
    apy: 12.5,
    tvl: '$85M',
    risk: 'medium',
    description: 'Provide liquidity to USDC-ETH pool',
  },
]

// Risk color mapping
export const RISK_COLORS = {
  low: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/20' },
  medium: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/20' },
  high: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
}

