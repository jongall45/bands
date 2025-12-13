'use client'

/**
 * Polymarket CLOB API Credential Management
 * 
 * Users must derive API credentials by signing a message with their wallet.
 * These credentials are then used for all CLOB API requests.
 */

export interface PolymarketApiCredentials {
  apiKey: string
  secret: string
  passphrase: string
}

// EIP-712 types for API key derivation
export const API_KEY_DERIVE_TYPES = {
  ClobAuth: [
    { name: 'address', type: 'address' },
    { name: 'timestamp', type: 'string' },
    { name: 'nonce', type: 'uint256' },
    { name: 'message', type: 'string' },
  ],
} as const

export const API_KEY_DOMAIN = {
  name: 'ClobAuthDomain',
  version: '1',
  chainId: 137,
}

/**
 * Build the EIP-712 message for API key derivation
 * Note: nonce is passed as string to avoid BigInt serialization issues
 */
export function buildApiKeyMessage(address: string, nonce: number = 0) {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  
  return {
    domain: API_KEY_DOMAIN,
    types: API_KEY_DERIVE_TYPES,
    primaryType: 'ClobAuth' as const,
    message: {
      address: address as `0x${string}`,
      timestamp,
      nonce: nonce.toString(), // Use string to avoid BigInt serialization issues
      message: 'This message attests that I control the given wallet',
    },
    // Store raw values for API call
    rawTimestamp: timestamp,
    rawNonce: nonce,
  }
}

// Local storage key for credentials
const CREDS_STORAGE_KEY = 'polymarket_api_creds'

/**
 * Store credentials securely (in localStorage for now)
 */
export function storeCredentials(address: string, creds: PolymarketApiCredentials): void {
  if (typeof window === 'undefined') return
  
  const stored = getStoredCredentialsMap()
  stored[address.toLowerCase()] = creds
  localStorage.setItem(CREDS_STORAGE_KEY, JSON.stringify(stored))
}

/**
 * Get stored credentials for an address
 */
export function getStoredCredentials(address: string): PolymarketApiCredentials | null {
  if (typeof window === 'undefined') return null
  
  const stored = getStoredCredentialsMap()
  return stored[address.toLowerCase()] || null
}

/**
 * Check if credentials exist for an address
 */
export function hasStoredCredentials(address: string): boolean {
  return getStoredCredentials(address) !== null
}

function getStoredCredentialsMap(): Record<string, PolymarketApiCredentials> {
  if (typeof window === 'undefined') return {}
  
  try {
    const stored = localStorage.getItem(CREDS_STORAGE_KEY)
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

/**
 * Clear credentials for an address
 */
export function clearCredentials(address: string): void {
  if (typeof window === 'undefined') return
  
  const stored = getStoredCredentialsMap()
  delete stored[address.toLowerCase()]
  localStorage.setItem(CREDS_STORAGE_KEY, JSON.stringify(stored))
}
