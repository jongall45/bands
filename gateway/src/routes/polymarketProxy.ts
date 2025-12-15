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

// Headers to forward from client to upstream
const FORWARD_REQUEST_HEADERS = [
  'content-type',
  'accept',
  'authorization',
  // Polymarket auth headers (L2 API key auth)
  'poly_api_key',
  'poly_signature',
  'poly_timestamp',
  'poly_nonce',
  'poly_passphrase',
  // Legacy header names (some versions use different casing)
  'POLY_API_KEY',
  'POLY_SIGNATURE', 
  'POLY_TIMESTAMP',
  'POLY_NONCE',
  'POLY_PASSPHRASE',
]

// Headers to forward from upstream to client
const FORWARD_RESPONSE_HEADERS = [
  'content-type',
  'x-request-id',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
]

// Headers that contain secrets (DO NOT LOG)
const SECRET_HEADERS = [
  'poly_signature',
  'poly_passphrase',
  'authorization',
  'POLY_SIGNATURE',
  'POLY_PASSPHRASE',
]

/**
 * Redact secret headers for logging
 */
function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const redacted: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (SECRET_HEADERS.some(s => key.toLowerCase() === s.toLowerCase())) {
      redacted[key] = '[REDACTED]'
    } else {
      redacted[key] = value
    }
  }
  return redacted
}

/**
 * Build upstream URL from request
 */
function buildUpstreamUrl(req: Request): string {
  // Get the path after /api/polymarket/proxy
  // req.path will be something like /order or /books
  const upstreamPath = req.path
  
  // Build query string
  const queryString = Object.keys(req.query).length > 0 
    ? '?' + new URLSearchParams(req.query as Record<string, string>).toString()
    : ''
  
  return `${CLOB_UPSTREAM}${upstreamPath}${queryString}`
}

/**
 * Forward request to Polymarket CLOB
 */
async function forwardRequest(req: Request, res: Response): Promise<void> {
  const startTime = Date.now()
  const upstreamUrl = buildUpstreamUrl(req)
  
  // Build headers to forward
  const forwardHeaders: Record<string, string> = {}
  for (const headerName of FORWARD_REQUEST_HEADERS) {
    const value = req.headers[headerName.toLowerCase()]
    if (value && typeof value === 'string') {
      forwardHeaders[headerName] = value
    }
  }
  
  // Log request (no secrets)
  logger.info(`[Proxy] ${req.method} ${req.path} -> ${CLOB_UPSTREAM}${req.path}`)
  if (process.env.NODE_ENV === 'development') {
    logger.debug(`[Proxy] Headers: ${JSON.stringify(redactHeaders(forwardHeaders))}`)
  }
  
  try {
    // Prepare fetch options
    const fetchOptions: RequestInit = {
      method: req.method,
      headers: forwardHeaders,
    }
    
    // Add body for POST/PUT/PATCH
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
      fetchOptions.body = JSON.stringify(req.body)
      forwardHeaders['content-type'] = 'application/json'
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
    
    // Log response (no secrets)
    logger.info(`[Proxy] ${req.method} ${req.path} <- ${upstreamResponse.status} (${duration}ms)`)
    
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
    
    // Handle specific errors
    if (errorMsg.includes('abort')) {
      res.status(504).json({ error: 'Upstream timeout' })
    } else if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('ENOTFOUND')) {
      res.status(502).json({ error: 'Upstream unavailable' })
    } else {
      res.status(500).json({ error: 'Proxy error', message: errorMsg })
    }
  }
}

// ============================================
// PROXY ROUTES
// ============================================

// Handle all methods for any path
router.all('/*', forwardRequest)

export default router
