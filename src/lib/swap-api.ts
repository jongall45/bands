import { type Hex } from 'viem'

interface SwapQuote {
  to: `0x${string}`
  data: Hex
  value: string
  buyAmount: string
  sellAmount: string
  estimatedGas: string
  price: string
}

const ZERO_X_API = 'https://api.0x.org'
const ZERO_X_API_KEY = process.env.NEXT_PUBLIC_ZERO_X_API_KEY || ''

export async function getSwapQuote({
  sellToken,
  buyToken,
  sellAmount,
  takerAddress,
  chainId = 8453, // Base
}: {
  sellToken: string
  buyToken: string
  sellAmount: string
  takerAddress: string
  chainId?: number
}): Promise<SwapQuote> {
  const params = new URLSearchParams({
    sellToken,
    buyToken,
    sellAmount,
    takerAddress,
    chainId: chainId.toString(),
  })

  const response = await fetch(`${ZERO_X_API}/swap/v1/quote?${params}`, {
    headers: {
      '0x-api-key': ZERO_X_API_KEY,
    },
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.reason || 'Failed to get swap quote')
  }

  return response.json()
}

export async function getSwapPrice({
  sellToken,
  buyToken,
  sellAmount,
  chainId = 8453,
}: {
  sellToken: string
  buyToken: string
  sellAmount: string
  chainId?: number
}): Promise<{ price: string; buyAmount: string }> {
  const params = new URLSearchParams({
    sellToken,
    buyToken,
    sellAmount,
    chainId: chainId.toString(),
  })

  const response = await fetch(`${ZERO_X_API}/swap/v1/price?${params}`, {
    headers: {
      '0x-api-key': ZERO_X_API_KEY,
    },
  })

  if (!response.ok) {
    throw new Error('Failed to get price')
  }

  return response.json()
}

