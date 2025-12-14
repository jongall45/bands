/**
 * Polymarket Client Module
 * 
 * Single configured client for all Polymarket API interactions.
 * Handles authentication, signing, and API calls.
 */

import Decimal from 'decimal.js'
import { ethers } from 'ethers'
import { ClobClient, Side, OrderType } from '@polymarket/clob-client'
import { RelayClient, RelayerTxType } from '@polymarket/builder-relayer-client'
import { BuilderConfig } from '@polymarket/builder-signing-sdk'

// Configure Decimal.js
Decimal.set({ precision: 20, rounding: Decimal.ROUND_DOWN })

// API Endpoints
export const CLOB_API = 'https://clob.polymarket.com'
export const GAMMA_API = 'https://gamma-api.polymarket.com'
export const BUILDER_RELAYER_API = 'https://relayer-v2.polymarket.com/'

// Chain configuration
export const POLYGON_CHAIN_ID = 137

// Signature types
export const SIGNATURE_TYPES = {
  EOA: 0,
  POLY_PROXY: 1,
  POLY_GNOSIS_SAFE: 2,  // Used for Privy + Safe wallet
} as const

/**
 * API credentials for CLOB authentication
 */
export interface ApiCredentials {
  key: string
  secret: string
  passphrase: string
}

/**
 * Client configuration
 */
export interface ClientConfig {
  chainId: number
  clobApiUrl: string
  relayerApiUrl: string
  signatureType: number
  safeAddress: string
  builderSigningUrl: string
}

/**
 * Create default client configuration
 */
export function createClientConfig(
  safeAddress: string,
  builderSigningUrl?: string
): ClientConfig {
  const baseUrl = typeof window !== 'undefined' 
    ? window.location.origin 
    : 'http://localhost:3000'
  
  return {
    chainId: POLYGON_CHAIN_ID,
    clobApiUrl: CLOB_API,
    relayerApiUrl: BUILDER_RELAYER_API,
    signatureType: SIGNATURE_TYPES.POLY_GNOSIS_SAFE,
    safeAddress,
    builderSigningUrl: builderSigningUrl || `${baseUrl}/api/polymarket/sign`,
  }
}

/**
 * Create authenticated ClobClient
 */
export function createClobClient(
  config: ClientConfig,
  signer: ethers.Signer,
  credentials?: ApiCredentials
): ClobClient {
  const builderConfig = new BuilderConfig({
    remoteBuilderConfig: {
      url: config.builderSigningUrl,
    },
  })
  
  return new ClobClient(
    config.clobApiUrl,
    config.chainId,
    signer,
    credentials,
    config.signatureType,
    config.safeAddress,
    undefined,
    false,
    builderConfig
  )
}

/**
 * Create RelayClient for gasless transactions
 */
export function createRelayClient(
  config: ClientConfig,
  signer: ethers.Signer
): RelayClient {
  const builderConfig = new BuilderConfig({
    remoteBuilderConfig: {
      url: config.builderSigningUrl,
    },
  })
  
  return new RelayClient(
    config.relayerApiUrl,
    config.chainId,
    signer,
    builderConfig,
    RelayerTxType.SAFE
  )
}

/**
 * Fetch orderbook from CLOB
 */
export async function fetchOrderbook(tokenId: string): Promise<{
  bids: Array<{ price: string; size: string }>
  asks: Array<{ price: string; size: string }>
  hash?: string
}> {
  const response = await fetch(`${CLOB_API}/book?token_id=${tokenId}`, {
    headers: { 'Accept': 'application/json' },
    cache: 'no-store',
  })
  
  if (!response.ok) {
    throw new Error(`Failed to fetch orderbook: ${response.status}`)
  }
  
  return response.json()
}

/**
 * Fetch market from CLOB
 */
export async function fetchMarket(conditionId: string): Promise<any> {
  const response = await fetch(`${CLOB_API}/markets/${conditionId}`, {
    headers: { 'Accept': 'application/json' },
    cache: 'no-store',
  })
  
  if (!response.ok) {
    throw new Error(`Failed to fetch market: ${response.status}`)
  }
  
  return response.json()
}

/**
 * Fetch markets from CLOB
 */
export async function fetchMarkets(nextCursor?: string): Promise<{
  data: any[]
  next_cursor?: string
}> {
  const url = nextCursor 
    ? `${CLOB_API}/markets?next_cursor=${nextCursor}`
    : `${CLOB_API}/markets`
  
  const response = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    cache: 'no-store',
  })
  
  if (!response.ok) {
    throw new Error(`Failed to fetch markets: ${response.status}`)
  }
  
  return response.json()
}

/**
 * Fetch user's open orders
 */
export async function fetchOpenOrders(
  clobClient: ClobClient
): Promise<any[]> {
  try {
    const orders = await clobClient.getOpenOrders()
    return orders || []
  } catch (error) {
    console.error('Failed to fetch open orders:', error)
    return []
  }
}

/**
 * Fetch user's positions (balances)
 */
export async function fetchPositions(address: string): Promise<any[]> {
  const response = await fetch(
    `${CLOB_API}/data/positions?user=${address}`,
    {
      headers: { 'Accept': 'application/json' },
      cache: 'no-store',
    }
  )
  
  if (!response.ok) {
    throw new Error(`Failed to fetch positions: ${response.status}`)
  }
  
  const data = await response.json()
  return data || []
}

/**
 * Order parameters for placing orders
 */
export interface OrderParams {
  tokenId: string
  side: 'BUY' | 'SELL'
  price: Decimal
  size: Decimal
  orderType?: 'GTC' | 'FOK' | 'GTD'
  expiration?: number  // Unix timestamp in seconds
}

/**
 * Order response from CLOB
 */
export interface OrderResponse {
  success: boolean
  orderID?: string
  transactionHash?: string
  errorMsg?: string
}

/**
 * Correlation ID generator for request tracing
 */
let correlationCounter = 0
export function generateCorrelationId(): string {
  return `poly-${Date.now()}-${++correlationCounter}`
}

/**
 * Structured log entry
 */
export interface LogEntry {
  correlationId: string
  timestamp: string
  event: string
  data: Record<string, unknown>
}

/**
 * Log structured data (development mode only)
 */
export function structuredLog(entry: LogEntry): void {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Polymarket] ${entry.event}`, {
      correlationId: entry.correlationId,
      timestamp: entry.timestamp,
      ...entry.data,
    })
  }
}

/**
 * Map order side to CLOB SDK Side enum
 */
export function mapSide(side: 'BUY' | 'SELL'): Side {
  return side === 'BUY' ? Side.BUY : Side.SELL
}

/**
 * Map order type to CLOB SDK OrderType enum
 */
export function mapOrderType(orderType: string = 'GTC'): OrderType {
  switch (orderType) {
    case 'FOK': return OrderType.FOK
    case 'GTD': return OrderType.GTD
    default: return OrderType.GTC
  }
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
}

/**
 * Retry with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  correlationId?: string
): Promise<T> {
  let lastError: Error | null = null
  
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error as Error
      
      // Check if error is retryable
      const errorMsg = lastError.message.toLowerCase()
      const isRetryable = 
        errorMsg.includes('timeout') ||
        errorMsg.includes('network') ||
        errorMsg.includes('429') ||
        errorMsg.includes('rate limit') ||
        errorMsg.includes('nonce')
      
      if (!isRetryable || attempt >= config.maxRetries) {
        throw lastError
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        config.baseDelayMs * Math.pow(2, attempt),
        config.maxDelayMs
      )
      
      structuredLog({
        correlationId: correlationId || 'unknown',
        timestamp: new Date().toISOString(),
        event: 'retry',
        data: {
          attempt: attempt + 1,
          maxRetries: config.maxRetries,
          delayMs: delay,
          error: lastError.message,
        },
      })
      
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  
  throw lastError
}
