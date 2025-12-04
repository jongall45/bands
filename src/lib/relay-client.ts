import { 
  createClient, 
  convertViemChainToRelayChain, 
  MAINNET_RELAY_API 
} from '@reservoir0x/relay-sdk'
import { base, arbitrum } from 'viem/chains'

// Initialize Relay client once at app startup
let relayClientInitialized = false

export function initializeRelayClient() {
  if (relayClientInitialized) return
  
  createClient({
    baseApiUrl: MAINNET_RELAY_API,
    source: 'bands.cash',
    chains: [
      convertViemChainToRelayChain(base),
      convertViemChainToRelayChain(arbitrum),
    ],
  })
  
  relayClientInitialized = true
  console.log('✅ Relay client initialized')
}

