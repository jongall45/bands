/**
 * Polymarket CLOB Reverse Proxy
 * 
 * CRITICAL: This proxy forwards request bodies as RAW BYTES.
 * DO NOT parse or modify the body in any way.
 * 
 * Why? ClobClient signs the exact JSON bytes. If we:
 * - Parse with JSON.parse()
 * - Re-stringify with JSON.stringify()
 * The key order and whitespace may change, breaking the EIP-712 signature.
 * 
 * Architecture:
 * - Browser ClobClient signs orders using Privy wallet (client-side)
 * - ClobClient posts to THIS proxy
 * - Proxy forwards raw bytes to https://clob.polymarket.com
 * - Polymarket response returned to browser
 */

import { Router, Request, Response } from 'express'
import { logger } from '../utils/logger.js'
import { config } from '../config/index.js'

const router = Router()

// Upstream Polymarket CLOB API
const CLOB_UPSTREAM = config.clobApi || 'https://clob.polymarket.com'

// Headers NOT to forward (hop-by-hop headers)
const SKIP_REQUEST_HEADERS = new Set([
  'host',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length', // Let fetch recalculate
])

// Headers to forward from upstream to client
const FORWARD_RESPONSE_HEADERS = [
  'content-type',
  'x-request-id',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
]

// Headers that contain secrets (DO NOT LOG values)
const SECRET_HEADER_PATTERNS = [
  /poly_signature/i,
  /poly_passphrase/i,
  /poly_secret/i,
  /authorization/i,
]

function isSecretHeader(name: string): boolean {
  return SECRET_HEADER_PATTERNS.some(pattern => pattern.test(name))
}

/**
 * Build safe log of headers (redact secrets)
 */
function logHeaders(headers: Record<string, string>): string {
  const safe: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (isSecretHeader(key)) {
      safe[key] = `[REDACTED len=${value.length}]`
    } else {
      safe[key] = value
    }
  }
  return JSON.stringify(safe)
}

/**
 * Build upstream URL from request
 */
function buildUpstreamUrl(req: Request): string {
  const upstreamPath = req.path
  const queryString = Object.keys(req.query).length > 0 
    ? '?' + new URLSearchParams(req.query as Record<string, string>).toString()
    : ''
  return `${CLOB_UPSTREAM}${upstreamPath}${queryString}`
}

/**
 * Forward request to Polymarket CLOB
 * 
 * CRITICAL: Body is forwarded as RAW BYTES (Buffer).
 * We do NOT parse or modify the body in any way.
 */
async function forwardRequest(req: Request, res: Response): Promise<void> {
  const startTime = Date.now()
  const upstreamUrl = buildUpstreamUrl(req)
  
  // Build headers to forward - include ALL except hop-by-hop
  const forwardHeaders: Record<string, string> = {}
  const polyHeadersFound: string[] = []
  
  for (const [key, value] of Object.entries(req.headers)) {
    const lowerKey = key.toLowerCase()
    
    // Skip hop-by-hop headers
    if (SKIP_REQUEST_HEADERS.has(lowerKey)) continue
    
    // Only forward string values (not arrays)
    if (typeof value === 'string') {
      // Polymarket expects uppercase POLY_ headers
      // Express lowercases all headers, so restore original casing
      if (lowerKey.startsWith('poly_')) {
        const upperKey = key.toUpperCase()
        forwardHeaders[upperKey] = value
        polyHeadersFound.push(upperKey)
      } else {
        forwardHeaders[key] = value
      }
    }
  }
  
  // Get raw body as Buffer (set by express.raw() in index.ts)
  // CRITICAL: Do NOT modify this - it contains the signed payload
  const rawBody: Buffer | undefined = Buffer.isBuffer(req.body) ? req.body : undefined
  const hasBody = rawBody && rawBody.length > 0
  
  // Log request
  logger.info(`[Proxy] ${req.method} ${req.path} -> ${CLOB_UPSTREAM}${req.path}`)
  logger.info(`[Proxy] poly_* headers: ${polyHeadersFound.length > 0 ? polyHeadersFound.join(', ') : 'NONE'}`)
  
  if (hasBody) {
    logger.info(`[Proxy] Raw body: ${rawBody.length} bytes (forwarding unchanged)`)
    
    // Log body details for debugging signature issues
    const bodyString = rawBody.toString('utf8')
    
    // Try to parse and log key fields (not secrets)
    try {
      const bodyJson = JSON.parse(bodyString)
      if (bodyJson.order) {
        logger.info(`[Proxy] Order details: maker=${bodyJson.order.maker?.slice(0, 10)}... side=${bodyJson.order.side} signatureType=${bodyJson.order.signatureType}`)
        logger.info(`[Proxy] Order amounts: maker=${bodyJson.order.makerAmount} taker=${bodyJson.order.takerAmount}`)
        logger.info(`[Proxy] Signature length: ${bodyJson.order.signature?.length || 0}`)
      }
      if (bodyJson.owner) {
        logger.info(`[Proxy] Owner: ${bodyJson.owner?.slice(0, 10)}...`)
      }
    } catch {
      // Not JSON, just log preview
      const preview = bodyString.slice(0, 100)
      logger.debug(`[Proxy] Body preview: ${preview}...`)
    }
    
    // Log first 200 chars of raw body to verify exact format
    logger.debug(`[Proxy] Raw body start: ${bodyString.slice(0, 200)}`)
  }
  
  logger.debug(`[Proxy] Headers: ${logHeaders(forwardHeaders)}`)
  
  try {
    // Prepare fetch options
    const fetchOptions: RequestInit = {
      method: req.method,
      headers: forwardHeaders,
    }
    
    // Forward raw body for POST/PUT/PATCH
    // CRITICAL: Use the raw Buffer directly - do NOT convert or modify
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && hasBody) {
      fetchOptions.body = rawBody
      // Ensure content-type is set (should already be from client)
      if (!forwardHeaders['content-type']) {
        forwardHeaders['content-type'] = 'application/json'
      }
    }
    
    // Make upstream request with timeout
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), config.request.timeout)
    
    const upstreamResponse = await fetch(upstreamUrl, {
      ...fetchOptions,
      signal: controller.signal,
    })
    
    clearTimeout(timeout)
    
    const duration = Date.now() - startTime
    
    // Get response body
    const responseText = await upstreamResponse.text()
    let responseBody: unknown
    
    try {
      responseBody = JSON.parse(responseText)
    } catch {
      responseBody = responseText
    }
    
    // Log response
    const logLevel = upstreamResponse.ok ? 'info' : 'warn'
    logger[logLevel](`[Proxy] ${req.method} ${req.path} <- ${upstreamResponse.status} (${duration}ms)`)
    
    // Log error details for non-200 responses
    if (!upstreamResponse.ok) {
      logger.warn(`[Proxy] Upstream error: ${JSON.stringify(responseBody)}`)
    }
    
    // Forward response headers
    for (const headerName of FORWARD_RESPONSE_HEADERS) {
      const value = upstreamResponse.headers.get(headerName)
      if (value) {
        res.setHeader(headerName, value)
      }
    }
    
    // Return upstream response
    res.status(upstreamResponse.status)
    
    if (typeof responseBody === 'object') {
      res.json(responseBody)
    } else {
      res.send(responseBody)
    }
    
  } catch (error) {
    const duration = Date.now() - startTime
    const errorMsg = error instanceof Error ? error.message : String(error)
    
    logger.error(`[Proxy] ${req.method} ${req.path} FAILED (${duration}ms): ${errorMsg}`)
    
    // Handle specific errors with clear messages
    if (errorMsg.includes('abort')) {
      res.status(504).json({ 
        error: 'UPSTREAM_TIMEOUT',
        message: 'Polymarket API did not respond in time',
        path: req.path,
      })
    } else if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('ENOTFOUND')) {
      res.status(502).json({ 
        error: 'UPSTREAM_UNAVAILABLE',
        message: 'Polymarket API is unreachable',
        path: req.path,
      })
    } else {
      res.status(500).json({ 
        error: 'PROXY_ERROR',
        message: errorMsg,
        path: req.path,
      })
    }
  }
}

// ============================================
// PROXY ROUTES
// ============================================

// Handle all methods for any path
router.all('/*', forwardRequest)

export default router
