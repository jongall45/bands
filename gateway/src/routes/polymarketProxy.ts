/**
 * Polymarket CLOB Reverse Proxy
 * 
 * THIS IS THE CORRECT ARCHITECTURE:
 * - Browser ClobClient signs orders using Privy wallet (client-side)
 * - ClobClient posts to THIS proxy (same-origin, no CORS)
 * - Proxy forwards to https://clob.polymarket.com
 * - Polymarket response returned to browser
 * 
 * Why this works:
 * - Signing stays in browser (Privy embedded wallet)
 * - No CORS issues (browser talks to our origin)
 * - IP rate limiting uses Railway IP (not user IP)
 * - ClobClient handles payload/signature/decimals correctly
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
  'content-length', // Let fetch set this
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
 * IMPORTANT: We forward ALL headers except hop-by-hop ones.
 * This ensures we never miss a header that clob-client sends.
 */
async function forwardRequest(req: Request, res: Response): Promise<void> {
  const startTime = Date.now()
  const upstreamUrl = buildUpstreamUrl(req)
  
  // Build headers to forward - include ALL except hop-by-hop
  const forwardHeaders: Record<string, string> = {}
  let polyHeadersFound: string[] = []
  
  for (const [key, value] of Object.entries(req.headers)) {
    const lowerKey = key.toLowerCase()
    
    // Skip hop-by-hop headers
    if (SKIP_REQUEST_HEADERS.has(lowerKey)) continue
    
    // Only forward string values (not arrays)
    if (typeof value === 'string') {
      // Polymarket expects specific header casing for poly_ headers
      // The clob-client sends them as POLY_ADDRESS, etc.
      // Express lowercases all headers, so we need to restore the original casing
      if (lowerKey.startsWith('poly_')) {
        // Convert to uppercase format: poly_address -> POLY_ADDRESS
        const upperKey = key.toUpperCase()
        forwardHeaders[upperKey] = value
        polyHeadersFound.push(upperKey)
      } else {
        forwardHeaders[key] = value
      }
    }
  }
  
  // Log request (including which poly headers we found)
  logger.info(`[Proxy] ${req.method} ${req.path} -> ${CLOB_UPSTREAM}${req.path}`)
  logger.info(`[Proxy] poly_* headers found: ${polyHeadersFound.length > 0 ? polyHeadersFound.join(', ') : 'NONE'}`)
  
  // Debug log all headers (safe)
  logger.debug(`[Proxy] Forwarding headers: ${logHeaders(forwardHeaders)}`)
  
  try {
    // Prepare fetch options
    const fetchOptions: RequestInit = {
      method: req.method,
      headers: forwardHeaders,
    }
    
    // Add body for POST/PUT/PATCH
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body && Object.keys(req.body).length > 0) {
      fetchOptions.body = JSON.stringify(req.body)
      forwardHeaders['content-type'] = 'application/json'
      
      // Log body keys (not values) for debugging
      logger.debug(`[Proxy] Body keys: ${Object.keys(req.body).join(', ')}`)
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
      logger.warn(`[Proxy] Upstream error body: ${JSON.stringify(responseBody)}`)
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
