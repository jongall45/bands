import crypto from 'crypto'
import { config } from '../config/index.js'
import { logger, logPolymarketCall } from '../utils/logger.js'
import { getOrFetch } from './cache.js'
import { buildHmacSignature } from '@polymarket/builder-signing-sdk'
import type { UserCreds } from './userCredsStore.js'
import { buildCanonicalOrder, logAndValidatePayload } from '../utils/orderBuilder.js'

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

// ============================================
// L1 AUTH (derive/create L2 API key)
// ============================================

export interface L1AuthPayload {
  address: string
  signature: string
  timestamp: string
  nonce?: string
}

/**
 * Derive (or create) Polymarket L2 API credentials using L1 auth.
 *
 * Browser supplies only the L1 signature payload; gateway stores the returned
 * apiKey/secret/passphrase server-side.
 */
/**
 * Derive or create L2 API credentials for a user wallet
 * Uses L1 signature (from browser) + builder credentials (for attribution)
 */
export async function deriveOrCreateApiKey(l1: L1AuthPayload): Promise<UserCreds> {
  const headers: Record<string, string> = {
    ...getBaseHeaders(),
    'Content-Type': 'application/json',
    'POLY_ADDRESS': l1.address,
    'POLY_SIGNATURE': l1.signature,
    'POLY_TIMESTAMP': l1.timestamp,
  }
  if (l1.nonce !== undefined) headers['POLY_NONCE'] = l1.nonce

  // Add builder headers for attribution (required for derive/create endpoints)
  // This is the ONLY place where we use builder headers with user auth
  const builderHeaders = getBuilderHeaders('GET', '/auth/derive-api-key', '')
  Object.assign(headers, builderHeaders)

  logger.info(`[Auth] Deriving L2 API key for wallet: ${l1.address.slice(0, 10)}... hasSignature=${!!l1.signature} timestamp=${l1.timestamp} hasBuilderAttribution=${!!builderHeaders['POLY_BUILDER_API_KEY']}`)

  // First try derive
  const deriveStart = Date.now()
  const deriveUrl = `${config.clobApi}/auth/derive-api-key`
  logger.debug(`[Auth] Attempting derive: ${deriveUrl}`)
  
  const deriveRes = await fetch(deriveUrl, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(config.request.timeout),
  })
  const deriveText = await deriveRes.text()
  logPolymarketCall('/auth/derive-api-key', 'GET', Date.now() - deriveStart, deriveRes.ok, { status: deriveRes.status })

  if (deriveRes.ok) {
    try {
      const data = JSON.parse(deriveText) as UserCreds
      logger.info(`[Auth] L2 API key derived successfully for ${l1.address.slice(0, 10)}... keyLen=${data.apiKey.length} secretLen=${data.secret.length}`)
      return data
    } catch (parseError) {
      logger.error(`[Auth] Failed to parse derive response: ${deriveText.substring(0, 200)}`)
      throw new Error('Invalid response from derive-api-key endpoint')
    }
  }

  // If derive fails, try create (with builder headers for POST)
  logger.warn(`[Auth] derive-api-key failed (${deriveRes.status}): ${deriveText.substring(0, 200)}; attempting api-key create`)
  const createStart = Date.now()
  const createUrl = `${config.clobApi}/auth/api-key`
  const createBody = ''
  // Update headers with POST builder sig (for attribution during create)
  const createBuilderHeaders = getBuilderHeaders('POST', '/auth/api-key', createBody)
  Object.assign(headers, createBuilderHeaders)
  
  logger.debug(`[Auth] Attempting create: ${createUrl}`)
  
  const createRes = await fetch(createUrl, {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(config.request.timeout),
  })
  const createText = await createRes.text()
  logPolymarketCall('/auth/api-key', 'POST', Date.now() - createStart, createRes.ok, { status: createRes.status })

  if (!createRes.ok) {
    let err = `HTTP ${createRes.status}`
    try {
      const parsed = JSON.parse(createText)
      err = parsed.message || parsed.error || err
    } catch {
      err = createText || err
    }
    logger.error(`[Auth] Failed to create L2 API key for ${l1.address.slice(0, 10)}...: ${err}`)
    throw new Error(err)
  }

  try {
    const data = JSON.parse(createText) as UserCreds
    logger.info(`[Auth] L2 API key created successfully for ${l1.address.slice(0, 10)}... keyLen=${data.apiKey.length} secretLen=${data.secret.length}`)
    return data
  } catch (parseError) {
    logger.error(`[Auth] Failed to parse create response: ${createText.substring(0, 200)}`)
    throw new Error('Invalid response from api-key endpoint')
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

// Add builder headers for attribution (used for derive/create endpoints and order attribution)
function getBuilderHeaders(method: string, path: string, body: string): Record<string, string> {
  const hasKey = !!config.builderApiKey
  const hasSecret = !!config.builderSecret
  const hasPass = !!config.builderPassphrase
  
  if (!hasKey || !hasSecret || !hasPass) {
    logger.debug(`[Auth] Builder headers skipped: hasKey=${hasKey} hasSecret=${hasSecret} hasPass=${hasPass}`)
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
export async function makeRequest<T>(
  baseUrl: string,
  method: string,
  path: string,
  options?: {
    body?: unknown
    userCreds?: UserCreds
    userAddress?: string
    useBuilderAttribution?: boolean // Only for derive/create endpoints
  }
): Promise<T> {
  const url = `${baseUrl}${path}`
  const bodyString = options?.body ? JSON.stringify(options.body) : ''
  
  const headers: Record<string, string> = {
    ...getBaseHeaders(),
  }
  
  // Builder headers should ONLY be used for:
  // 1. Attribution during derive/create API calls
  // 2. Public endpoints that don't require user auth
  // For authenticated user operations (orders), we should NOT send builder headers
  const shouldUseBuilderAttribution = options?.useBuilderAttribution || (!options?.userCreds)
  if (shouldUseBuilderAttribution) {
    Object.assign(headers, getBuilderHeaders(method, path, bodyString))
  }
  
  // Add user auth headers if provided
  // When user creds are present, we ONLY use user creds (not builder creds)
  if (options?.userCreds) {
    // Validate userCreds structure
    if (!options.userCreds.apiKey || !options.userCreds.secret || !options.userCreds.passphrase) {
      logger.error(`[Auth] CRITICAL: userCreds provided but incomplete! apiKey=${!!options.userCreds.apiKey} secret=${!!options.userCreds.secret} passphrase=${!!options.userCreds.passphrase}`)
      throw new Error('NO_DERIVED_CREDS: User credentials are incomplete')
    }
    
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
    
    logger.debug(`[Auth] Added user auth headers: keyLen=${options.userCreds.apiKey.length} hasSignature=${!!signature} timestamp=${timestamp}`)
  } else {
    logger.warn(`[Auth] No userCreds provided in options! options=${JSON.stringify({ hasUserCreds: !!options?.userCreds, hasBody: !!options?.body, hasUserAddress: !!options?.userAddress })}`)
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
        logger.debug(`Retrying request: attempt=${attempt} path=${path}`)
      }
      
      // Log outbound request with detailed credential info
      const urlObj = new URL(url)
      const hasUserCreds = !!options?.userCreds
      const hasUserCredsValid = hasUserCreds && !!options.userCreds?.apiKey && !!options.userCreds?.secret && !!options.userCreds?.passphrase
      const hasBuilderCreds = !!config.builderApiKey && !!config.builderSecret && !!config.builderPassphrase
      
      // Determine which credentials are being used
      const credType = hasUserCredsValid ? 'DERIVED_USER_CREDS_ONLY' : (hasBuilderCreds ? 'BUILDER_CREDS_ONLY' : 'NO_CREDS')
      const hasBoth = hasUserCredsValid && hasBuilderCreds && shouldUseBuilderAttribution
      
      logger.info(`[Polymarket] ${method} ${urlObj.host}${path} credType=${credType} hasUserCreds=${hasUserCreds} hasUserCredsValid=${hasUserCredsValid} hasBuilderCreds=${hasBuilderCreds && shouldUseBuilderAttribution} hasBoth=${hasBoth} shouldUseBuilderAttribution=${shouldUseBuilderAttribution}`)
      
      // Debug: Log what's actually in options
      if (hasUserCreds && !hasUserCredsValid) {
        logger.error(`[Auth] CRITICAL: userCreds object exists but is invalid! apiKey=${!!options.userCreds?.apiKey} secret=${!!options.userCreds?.secret} passphrase=${!!options.userCreds?.passphrase}`)
      }
      
      if (hasUserCredsValid && options.userCreds) {
        logger.info(`[Auth] Using DERIVED user creds ONLY (no builder headers): keyLen=${options.userCreds.apiKey.length} keyPrefix=${options.userCreds.apiKey.substring(0, 8)}...`)
      } else if (hasBuilderCreds && shouldUseBuilderAttribution) {
        logger.info(`[Auth] Using BUILDER creds only (for attribution/public endpoints): keyLen=${config.builderApiKey.length}`)
      } else {
        logger.warn(`[Auth] WARNING: No valid credentials! hasUserCreds=${hasUserCreds} hasUserCredsValid=${hasUserCredsValid} hasBuilderCreds=${hasBuilderCreds}`)
      }
      
      // Warn if we're sending both (shouldn't happen for orders)
      if (hasBoth) {
        logger.warn(`[Auth] WARNING: Sending both builder AND user creds - this may cause auth issues!`)
      }
      
      const response = await fetch(url, {
        method,
        headers,
        body: bodyString || undefined,
        signal: AbortSignal.timeout(config.request.timeout),
      })
      
      const durationMs = Date.now() - start
      const responseText = await response.text()
      
      // Log response
      logPolymarketCall(path, method, durationMs, response.ok, { status: response.status })
      
      if (!response.ok) {
        // Log error response body snippet (first 200 chars)
        const errorSnippet = responseText.substring(0, 200)
        logger.warn(`[Polymarket] Error response: ${errorSnippet} status=${response.status} path=${path}`)
        
        // Check for Cloudflare block
        if (responseText.includes('Cloudflare') || responseText.includes('blocked')) {
          throw new Error('Request blocked by Cloudflare protection')
        }
        
        // Parse error message
        let errorMessage = `HTTP ${response.status}`
        try {
          const errorData = JSON.parse(responseText)
          errorMessage = errorData.message || errorData.error || errorMessage
        } catch {
          errorMessage = responseText || errorMessage
        }
        
        // Preserve auth error status codes
        if (response.status === 401 || response.status === 403) {
          const authError = new Error(errorMessage) as Error & { statusCode?: number }
          authError.statusCode = response.status
          throw authError
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
      logger.warn(`Request failed: attempt=${attempt} path=${path} error=${lastError.message}`)
      
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
export async function getMarkets(params?: { active?: boolean; limit?: number }): Promise<unknown[]> {
  const cacheKey = `markets:${JSON.stringify(params || {})}`
  
  return getOrFetch('markets', cacheKey, async () => {
    const query = new URLSearchParams()
    if (params?.active !== undefined) query.set('active', String(params.active))
    if (params?.limit) query.set('limit', String(params.limit))
    
    const path = `/markets?${query.toString()}`
    return makeRequest<unknown[]>(config.gammaApi, 'GET', path)
  })
}

/**
 * Get single market by ID with caching
 */
export async function getMarket(conditionId: string): Promise<unknown> {
  return getOrFetch('markets', `market:${conditionId}`, async () => {
    return makeRequest<unknown>(config.gammaApi, 'GET', `/markets/${conditionId}`)
  })
}

/**
 * Get market stats (prices, volume) with shorter cache
 */
export async function getMarketStats(tokenId: string): Promise<unknown> {
  return getOrFetch('stats', `stats:${tokenId}`, async () => {
    return makeRequest<unknown>(config.clobApi, 'GET', `/book?token_id=${tokenId}`)
  })
}

/**
 * Get user positions (requires wallet address)
 */
export async function getPositions(walletAddress: string): Promise<unknown[]> {
  return getOrFetch('positions', `positions:${walletAddress}`, async () => {
    return makeRequest<unknown[]>(
      config.gammaApi, 
      'GET', 
      `/positions?user=${walletAddress}`
    )
  })
}

/**
 * Get user orders (requires auth)
 * Uses DERIVED user credentials (not builder credentials)
 */
export async function getOrders(
  walletAddress: string,
  userCreds: UserCreds
): Promise<unknown[]> {
  logger.debug(`[Orders] Getting orders for ${walletAddress.slice(0, 10)}... using DERIVED user creds`)
  return getOrFetch('orders', `orders:${walletAddress}`, async () => {
    return makeRequest<unknown[]>(
      config.clobApi,
      'GET',
      '/orders',
      { userCreds, userAddress: walletAddress }
    )
  })
}

/**
 * Submit a signed order to Polymarket CLOB
 * Uses DERIVED user credentials (not builder credentials)
 * 
 * CRITICAL: The signed order is passed through WITHOUT mutation.
 * - side: stays as number (0 = BUY, 1 = SELL) - same as EIP-712
 * - All amounts must be strings (already stringified before signing)
 * - The order wrapper adds owner and orderType
 */
export async function submitOrder(
  signedOrder: unknown,
  owner: string,
  orderType: string,
  userCreds: UserCreds
): Promise<unknown> {
  logger.info(`[Order] Submitting order: owner=${owner.slice(0, 10)}... orderType=${orderType} clobApi=${config.clobApi}`)
  
  // Validate userCreds before proceeding
  if (!userCreds) {
    logger.error(`[Order] CRITICAL: userCreds is null/undefined! Cannot submit order.`)
    throw new Error('NO_DERIVED_CREDS: User credentials are missing')
  }
  
  if (!userCreds.apiKey || !userCreds.secret || !userCreds.passphrase) {
    logger.error(`[Order] CRITICAL: userCreds missing required fields! apiKey=${!!userCreds.apiKey} secret=${!!userCreds.secret} passphrase=${!!userCreds.passphrase}`)
    throw new Error('NO_DERIVED_CREDS: User credentials are incomplete')
  }
  
  logger.info(`[Order] Using DERIVED user creds (NOT builder creds): keyLen=${userCreds.apiKey.length} secretLen=${userCreds.secret.length} passLen=${userCreds.passphrase.length} keyPrefix=${userCreds.apiKey.substring(0, 8)}...`)
  
  // Build canonical order payload - NO type conversions
  // side stays as number (0/1) to match the signed EIP-712 struct
  const validOrderType = (orderType === 'GTC' || orderType === 'FOK' || orderType === 'GTD') 
    ? orderType 
    : 'GTC'
  
  let canonicalPayload
  try {
    canonicalPayload = buildCanonicalOrder(
      signedOrder as Record<string, unknown>,
      owner,
      validOrderType
    )
    
    // Log and validate the final payload
    logAndValidatePayload(canonicalPayload, 'OrderSubmit')
  } catch (buildError) {
    const errorMsg = buildError instanceof Error ? buildError.message : String(buildError)
    logger.error(`[Order] Failed to build canonical order: ${errorMsg}`)
    throw new Error(`Invalid order payload: ${errorMsg}`)
  }
  
  // Log BEFORE calling makeRequest to confirm creds are passed
  logger.info(`[Order] About to call makeRequest with userCreds: hasCreds=${!!userCreds} keyLen=${userCreds?.apiKey?.length || 0} owner=${owner}`)
  
  try {
    const result = await makeRequest<unknown>(
      config.clobApi,
      'POST',
      '/order',
      { body: canonicalPayload, userCreds, userAddress: owner }
    )
    logger.info(`[Order] Order submitted successfully using derived user creds`)
    return result
  } catch (error) {
    // Log detailed error info
    const errorMsg = error instanceof Error ? error.message : String(error)
    const statusCode = (error && typeof error === 'object' && 'statusCode' in error) 
      ? (error.statusCode as number)
      : undefined
    
    // Check if creds were actually passed
    const hadCreds = !!userCreds && !!userCreds.apiKey
    logger.error(`[Order] Order submission failed: status=${statusCode || 'unknown'} error=${errorMsg} hadCreds=${hadCreds} keyLen=${userCreds?.apiKey?.length || 0}`)
    
    // Re-throw with status code preserved
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }
    throw error
  }
}

/**
 * Cancel an order
 * Uses DERIVED user credentials (not builder credentials)
 */
export async function cancelOrder(
  orderId: string,
  userCreds: UserCreds
): Promise<unknown> {
  logger.info(`[Order] Cancelling order: ${orderId} using DERIVED user creds (not builder creds)`)
  
  try {
    return await makeRequest<unknown>(
      config.clobApi,
      'DELETE',
      `/order/${orderId}`,
      { userCreds }
    )
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    const statusCode = (error && typeof error === 'object' && 'statusCode' in error) 
      ? (error.statusCode as number)
      : undefined
    logger.error(`[Order] Cancel failed: status=${statusCode || 'unknown'} error=${errorMsg}`)
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }
    throw error
  }
}
