/**
 * Crossmint Configuration
 * 
 * All sensitive values come from environment variables.
 * Never expose CROSSMINT_SERVER_SIDE_API_KEY to the client.
 */

// Environment
export const CROSSMINT_ENV = process.env.CROSSMINT_ENV || 'staging'

// API Base URLs
export const CROSSMINT_BASE_URL = CROSSMINT_ENV === 'production'
  ? 'https://www.crossmint.com'
  : 'https://staging.crossmint.com'

// Orders API endpoint
export const CROSSMINT_ORDERS_API = `${CROSSMINT_BASE_URL}/api/2022-06-09/orders`

// Token locator for USDC on Base
export const CROSSMINT_TOKEN_LOCATOR = process.env.CROSSMINT_TOKEN_LOCATOR || 'base:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'

// Amount bounds (in USD)
export const MIN_AMOUNT_USD = 5
export const MAX_AMOUNT_USD = 2000

// Validate required environment variables
export function validateEnvVars(): { valid: boolean; missing: string[] } {
  const required = [
    'CROSSMINT_SERVER_SIDE_API_KEY',
  ]
  
  const missing = required.filter(key => !process.env[key])
  
  return {
    valid: missing.length === 0,
    missing,
  }
}

// Get API key (only call server-side)
export function getServerApiKey(): string {
  const key = process.env.CROSSMINT_SERVER_SIDE_API_KEY
  if (!key) {
    throw new Error('CROSSMINT_SERVER_SIDE_API_KEY is not configured')
  }
  return key
}

// Get webhook secret (only call server-side)
export function getWebhookSecret(): string {
  const secret = process.env.CROSSMINT_WEBHOOK_SECRET
  if (!secret) {
    throw new Error('CROSSMINT_WEBHOOK_SECRET is not configured')
  }
  return secret
}
