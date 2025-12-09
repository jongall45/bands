import {
  createClient,
  convertViemChainToRelayChain,
  MAINNET_RELAY_API,
  getClient,
  type RelayClient
} from '@relayprotocol/relay-sdk'
import { base, arbitrum, optimism, mainnet } from 'viem/chains'

// Initialize Relay client once at app startup
let relayClientInitialized = false

// Supported chains for bands.cash
export const SUPPORTED_CHAINS = [base, arbitrum, optimism, mainnet]

export function initializeRelayClient(): RelayClient | null {
  if (relayClientInitialized) {
    return getClient()
  }

  try {
    const client = createClient({
      baseApiUrl: MAINNET_RELAY_API,
      source: 'bands.cash',
      chains: SUPPORTED_CHAINS.map(chain => convertViemChainToRelayChain(chain)),
    })

    relayClientInitialized = true
    console.log('[Relay] Client initialized with chains:', SUPPORTED_CHAINS.map(c => c.name).join(', '))

    return client
  } catch (error) {
    console.error('[Relay] Failed to initialize client:', error)
    return null
  }
}

export function getRelayClient(): RelayClient | null {
  if (!relayClientInitialized) {
    return initializeRelayClient()
  }
  return getClient()
}

// Re-export useful types and constants
export { MAINNET_RELAY_API, getClient, convertViemChainToRelayChain }
