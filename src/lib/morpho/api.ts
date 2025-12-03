import { GraphQLClient, gql } from 'graphql-request'

const MORPHO_API = 'https://blue-api.morpho.org/graphql'

const client = new GraphQLClient(MORPHO_API)

// Types
export interface MorphoVault {
  address: string
  name: string
  symbol: string
  asset: {
    address: string
    symbol: string
    decimals: number
  }
  state: {
    totalAssets: string
    totalAssetsUsd: number
    totalSupply: string
    apy: number
    netApy: number
    fee: number
  }
  metadata?: {
    description?: string
    image?: string
  }
}

export interface UserVaultPosition {
  vault: {
    address: string
    symbol: string
    name: string
  }
  shares: string
  assets: string
  assetsUsd: number
}

// Fetch USDC vaults on Base
export async function fetchBaseUSDCVaults(): Promise<MorphoVault[]> {
  const query = gql`
    query GetBaseUSDCVaults {
      vaults(
        first: 20
        where: { 
          chainId_in: [8453]
          assetSymbol_in: ["USDC"]
        }
        orderBy: TotalAssetsUsd
        orderDirection: Desc
      ) {
        items {
          address
          name
          symbol
          asset {
            address
            symbol
            decimals
          }
          state {
            totalAssets
            totalAssetsUsd
            totalSupply
            apy
            netApy
            fee
          }
          metadata {
            description
            image
          }
        }
      }
    }
  `

  try {
    const data = await client.request<{ vaults: { items: MorphoVault[] } }>(query)
    return data.vaults.items || []
  } catch (error) {
    console.error('Error fetching Morpho vaults:', error)
    // Return fallback data if API fails
    return getFallbackVaults()
  }
}

// Fetch specific vault details
export async function fetchVaultDetails(vaultAddress: string): Promise<MorphoVault | null> {
  const query = gql`
    query GetVaultDetails($address: String!) {
      vaultByAddress(address: $address, chainId: 8453) {
        address
        name
        symbol
        asset {
          address
          symbol
          decimals
        }
        state {
          totalAssets
          totalAssetsUsd
          totalSupply
          apy
          netApy
          fee
        }
        metadata {
          description
          image
        }
      }
    }
  `

  try {
    const data = await client.request<{ vaultByAddress: MorphoVault }>(query, {
      address: vaultAddress,
    })
    return data.vaultByAddress
  } catch (error) {
    console.error('Error fetching vault details:', error)
    return null
  }
}

// Fetch user's vault positions
export async function fetchUserVaultPositions(
  userAddress: string
): Promise<UserVaultPosition[]> {
  const query = gql`
    query GetUserPositions($address: String!) {
      userByAddress(address: $address, chainId: 8453) {
        vaultPositions {
          vault {
            address
            symbol
            name
          }
          shares
          assets
          assetsUsd
        }
      }
    }
  `

  try {
    const data = await client.request<{
      userByAddress: { vaultPositions: UserVaultPosition[] }
    }>(query, { address: userAddress })

    return data.userByAddress?.vaultPositions || []
  } catch (error) {
    console.error('Error fetching user positions:', error)
    return []
  }
}

// Calculate projected earnings
export function calculateProjectedEarnings(
  principal: number,
  apyPercent: number,
  days: number
): number {
  const dailyRate = apyPercent / 100 / 365
  const earnings = principal * dailyRate * days
  return earnings
}

// Fallback vault data if API is unavailable
function getFallbackVaults(): MorphoVault[] {
  return [
    {
      address: '0x7BfA7C4f149E7415b73bdeDfe609237e29CBF34A',
      name: 'Spark USDC Vault',
      symbol: 'spkUSDC',
      asset: {
        address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        symbol: 'USDC',
        decimals: 6,
      },
      state: {
        totalAssets: '10000000000000',
        totalAssetsUsd: 10000000,
        totalSupply: '10000000000000',
        apy: 0.05,
        netApy: 0.048,
        fee: 0.04,
      },
      metadata: {
        description: 'Spark-curated USDC vault with blue-chip collateral exposure',
      },
    },
    {
      address: '0x616a4E1db48e22028f6bbf20444Cd3b8e3273738',
      name: 'Seamless USDC Vault',
      symbol: 'smUSDC',
      asset: {
        address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        symbol: 'USDC',
        decimals: 6,
      },
      state: {
        totalAssets: '5000000000000',
        totalAssetsUsd: 5000000,
        totalSupply: '5000000000000',
        apy: 0.045,
        netApy: 0.043,
        fee: 0.04,
      },
      metadata: {
        description: 'Seamless protocol USDC vault optimized for Base',
      },
    },
  ]
}

