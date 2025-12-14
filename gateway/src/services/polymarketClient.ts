import crypto from 'crypto'
import { config } from '../../config/index.js'
import { logger, logPolymarketCall } from '../utils/logger.js'
import { getOrFetch } from './cache.js'
import { buildHmacSignature } from '@polymarket/builder-signing-sdk'

/**
 * Polymarket Client Service
 * 
 * Handles all communication with Polymarket APIs:
 * - CLOB API (orders, orderbook)
 * - Gamma API (market metadata)
 * 
 * Uses a single, stable connection pattern to avoid looking like a bot.
 */

const USER_AGENT = 'PolymarketGateway/1.0 (bands.cash)'

// Stable headers for all requests
function getBaseHeaders(): Record<string, string> {
  return {
    'User-Agent': USER_AGENT,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Connection': 'keep-alive',
  }
}

// Create HMAC signature for user API auth
function createUserSignature(
  secret: string,
  timestamp: string,
  method: string,
  path: string,
  body: string = ''
): string {
  let message = timestamp + method + path
  if (body) {
    message += body
  }
  const base64Secret = Buffer.from(secret, 'base64')
  const hmac = crypto.createHmac('sha256', base64Secret)
  const sig = hmac.update(message).digest('base64')
  return sig.split('+').join('-').split('/').join('_')
}

// Add builder headers for attribution
function getBuilderHeaders(method: string, path: string, body: string): Record<string, string> {
  if (!config.builderApiKey || !config.builderSecret || !config.builderPassphrase) {
    return {}
  }
  
  const timestamp = Date.now()
  const signature = buildHmacSignature(
    config.builderSecret,
    timestamp,
    method,
    path,
    body
  )
  
  return {
    'POLY_BUILDER_API_KEY': config.builderApiKey,
    'POLY_BUILDER_SIGNATURE': signature,
    'POLY_BUILDER_TIMESTAMP': timestamp.toString(),
    'POLY_BUILDER_PASSPHRASE': config.builderPassphrase,
  }
}

// Make a request to Polymarket with retry logic
async function makeRequest<T>(
  baseUrl: string,
  method: string,
  path: string,
  options?: {
    body?: any
    userCreds?: { apiKey: string; secret: string; passphrase: string }
    userAddress?: string
  }
): Promise<T> {
  const url = `${baseUrl}${path}`
  const bodyString = options?.body ? JSON.stringify(options.body) : ''
  
  const headers: Record<string, string> = {
    ...getBaseHeaders(),
    ...getBuilderHeaders(method, path, bodyString),
  }
  
  // Add user auth headers if provided
  if (options?.userCreds) {
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const signature = createUserSignature(
      options.userCreds.secret,
      timestamp,
      method,
      path,
      bodyString
    )
    headers['POLY_API_KEY'] = options.userCreds.apiKey
    headers['POLY_SIGNATURE'] = signature
    headers['POLY_TIMESTAMP'] = timestamp
    headers['POLY_PASSPHRASE'] = options.userCreds.passphrase
  }
  
  if (options?.userAddress) {
    headers['POLY_ADDRESS'] = options.userAddress
  }
  
  let lastError: Error | null = null
  
  for (let attempt = 0; attempt <= config.request.retries; attempt++) {
    const start = Date.now()
    
    try {
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, config.request.retryDelay * attempt))
        logger.debug({ attempt, path }, 'Retrying request')
      }
      
      const response = await fetch(url, {
        method,
        headers,
        body: bodyString || undefined,
        signal: AbortSignal.timeout(config.request.timeout),
      })
      
      const durationMs = Date.now() - start
      const responseText = await response.text()
      
      logPolymarketCall(path, method, durationMs, response.ok, { status: response.status })
      
      if (!response.ok) {
        // Check for Cloudflare block
        if (responseText.includes('Cloudflare') || responseText.includes('blocked')) {
          throw new Error('Request blocked by Cloudflare protection')
        }
        
        let errorMessage = `HTTP ${response.status}`
        try {
          const errorData = JSON.parse(responseText)
          errorMessage = errorData.message || errorData.error || errorMessage
        } catch {
          errorMessage = responseText || errorMessage
        }
        throw new Error(errorMessage)
      }
      
      // Parse response
      try {
        return JSON.parse(responseText) as T
      } catch {
        return responseText as unknown as T
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      logger.warn({ attempt, path, error: lastError.message }, 'Request failed')
      
      // Don't retry on auth errors
      if (lastError.message.includes('401') || lastError.message.includes('403')) {
        break
      }
    }
  }
  
  throw lastError || new Error('Request failed')
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Get all markets with caching
 */
export async function getMarkets(params?: { active?: boolean; limit?: number }): Promise<any[]> {
  const cacheKey = `markets:${JSON.stringify(params || {})}`
  
  return getOrFetch('markets', cacheKey, async () => {
    const query = new URLSearchParams()
    if (params?.active !== undefined) query.set('active', String(params.active))
    if (params?.limit) query.set('limit', String(params.limit))
    
    const path = `/markets?${query.toString()}`
    return makeRequest<any[]>(config.gammaApi, 'GET', path)
  })
}

/**
 * Get single market by ID with caching
 */
export async function getMarket(conditionId: string): Promise<any> {
  return getOrFetch('markets', `market:${conditionId}`, async () => {
    return makeRequest<any>(config.gammaApi, 'GET', `/markets/${conditionId}`)
  })
}

/**
 * Get market stats (prices, volume) with shorter cache
 */
export async function getMarketStats(tokenId: string): Promise<any> {
  return getOrFetch('stats', `stats:${tokenId}`, async () => {
    return makeRequest<any>(config.clobApi, 'GET', `/book?token_id=${tokenId}`)
  })
}

/**
 * Get user positions (requires wallet address)
 */
export async function getPositions(walletAddress: string): Promise<any[]> {
  return getOrFetch('positions', `positions:${walletAddress}`, async () => {
    return makeRequest<any[]>(
      config.gammaApi, 
      'GET', 
      `/positions?user=${walletAddress}`
    )
  })
}

/**
 * Get user orders (requires auth)
 */
export async function getOrders(
  walletAddress: string,
  userCreds: { apiKey: string; secret: string; passphrase: string }
): Promise<any[]> {
  return getOrFetch('orders', `orders:${walletAddress}`, async () => {
    return makeRequest<any[]>(
      config.clobApi,
      'GET',
      '/orders',
      { userCreds, userAddress: walletAddress }
    )
  })
}

/**
 * Submit a signed order
 * This is NOT cached - always submits to Polymarket
 */
export async function submitOrder(
  signedOrder: any,
  owner: string,
  orderType: string,
  userCreds: { apiKey: string; secret: string; passphrase: string }
): Promise<any> {
  logger.info({ owner, orderType }, 'Submitting order to Polymarket')
  
  const payload = {
    order: signedOrder,
    owner,
    orderType,
  }
  
  return makeRequest<any>(
    config.clobApi,
    'POST',
    '/order',
    { body: payload, userCreds, userAddress: owner }
  )
}

/**
 * Cancel an order
 */
export async function cancelOrder(
  orderId: string,
  userCreds: { apiKey: string; secret: string; passphrase: string }
): Promise<any> {
  logger.info({ orderId }, 'Cancelling order')
  
  return makeRequest<any>(
    config.clobApi,
    'DELETE',
    `/order/${orderId}`,
    { userCreds }
  )
}
