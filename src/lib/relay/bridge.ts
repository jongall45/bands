import { createClient, getClient } from '@relayprotocol/relay-sdk'
import { base, arbitrum } from 'viem/chains'
import type { WalletClient } from 'viem'

// Initialize Relay client
let isInitialized = false

export function initRelayClient() {
  if (isInitialized) return
  
  createClient({
    baseApiUrl: 'https://api.relay.link',
    source: 'bands.cash',
    chains: [
      { id: base.id, name: 'Base', displayName: 'Base' },
      { id: arbitrum.id, name: 'Arbitrum', displayName: 'Arbitrum' },
    ],
  })
  
  isInitialized = true
}

// USDC addresses on each chain
export const USDC_ADDRESSES = {
  [base.id]: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  [arbitrum.id]: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // Native USDC on Arbitrum
} as const

// Get bridge quote
export async function getBridgeQuote(params: {
  amount: string // In USDC units (e.g., "10" for $10)
  fromChainId: number
  toChainId: number
  userAddress: string
}) {
  initRelayClient()
  const client = getClient()
  
  // Convert to wei (USDC has 6 decimals)
  const amountWei = BigInt(Math.floor(parseFloat(params.amount) * 1e6)).toString()
  
  const quote = await client.actions.getQuote({
    chainId: params.fromChainId,
    toChainId: params.toChainId,
    currency: USDC_ADDRESSES[params.fromChainId as keyof typeof USDC_ADDRESSES],
    toCurrency: USDC_ADDRESSES[params.toChainId as keyof typeof USDC_ADDRESSES],
    amount: amountWei,
    recipient: params.userAddress,
    tradeType: 'EXACT_INPUT',
  })

  return quote
}

// Execute bridge transaction using a quote
export async function executeBridge(params: {
  amount: string
  fromChainId: number
  toChainId: number
  userAddress: string
  wallet: WalletClient
  onProgress?: (step: string, status: 'pending' | 'complete' | 'error') => void
}): Promise<{ success: boolean; txHash?: string; error?: string }> {
  initRelayClient()
  const client = getClient()

  return new Promise(async (resolve) => {
    try {
      // First get a quote
      params.onProgress?.('Getting quote...', 'pending')
      
      const quote = await getBridgeQuote({
        amount: params.amount,
        fromChainId: params.fromChainId,
        toChainId: params.toChainId,
        userAddress: params.userAddress,
      })

      params.onProgress?.('Preparing transaction...', 'pending')

      // Execute with the quote
      await client.actions.execute({
        quote: quote as any, // Quote from getQuote
        wallet: params.wallet as any,
        onProgress: (data) => {
          // Find current step
          const currentStep = data.steps?.find(s => 
            s.items?.some(item => item.status === 'incomplete')
          )
          if (currentStep) {
            params.onProgress?.(currentStep.action || currentStep.description || 'Processing', 'pending')
          }
          
          // Check if all complete
          const allComplete = data.steps?.every(s => 
            s.items?.every(item => item.status === 'complete')
          )
          if (allComplete) {
            params.onProgress?.('Bridge complete', 'complete')
          }
        },
      })
      
      resolve({ success: true })
    } catch (error) {
      console.error('Bridge error:', error)
      resolve({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Bridge failed' 
      })
    }
  })
}

