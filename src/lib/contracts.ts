import { parseAbi } from 'viem'

// Base Mainnet Addresses
export const CONTRACTS = {
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`,
  WETH: '0x4200000000000000000000000000000000000006' as `0x${string}`,
  
  // DeFi protocols on Base
  MOONWELL_USDC: '0xEdc817A28E8B93B03976FBd4a3dDBc9f7D176c22' as `0x${string}`, // mUSDC
  AAVE_POOL: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5' as `0x${string}`,
  
  // Swap routers
  UNISWAP_ROUTER: '0x2626664c2603336E57B271c5C0b26F421741e481' as `0x${string}`,
} as const

export const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
])

export const VAULT_ABI = parseAbi([
  'function deposit(uint256 assets, address receiver) returns (uint256 shares)',
  'function withdraw(uint256 assets, address receiver, address owner) returns (uint256 shares)',
  'function balanceOf(address account) view returns (uint256)',
  'function convertToAssets(uint256 shares) view returns (uint256)',
  'function convertToShares(uint256 assets) view returns (uint256)',
])

export const AAVE_POOL_ABI = parseAbi([
  'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)',
  'function withdraw(address asset, uint256 amount, address to) returns (uint256)',
])

