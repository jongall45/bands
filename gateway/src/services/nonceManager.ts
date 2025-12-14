import { logger } from '../utils/logger.js'

/**
 * Nonce Manager for Replay Protection
 * 
 * Tracks used nonces per wallet to prevent order replay attacks.
 * In production, this should use Redis or a database for persistence.
 */

interface NonceEntry {
  nonce: string
  timestamp: number
}

// In-memory store (replace with Redis in production)
const usedNonces = new Map<string, NonceEntry[]>()

// Nonce expiry time (1 hour)
const NONCE_EXPIRY_MS = 60 * 60 * 1000

/**
 * Check if a nonce has been used for a wallet
 */
export function isNonceUsed(wallet: string, nonce: string): boolean {
  const walletNonces = usedNonces.get(wallet.toLowerCase())
  if (!walletNonces) return false
  
  return walletNonces.some(entry => entry.nonce === nonce)
}

/**
 * Mark a nonce as used for a wallet
 */
export function markNonceUsed(wallet: string, nonce: string): void {
  const key = wallet.toLowerCase()
  const now = Date.now()
  
  // Get or create nonce list
  let walletNonces = usedNonces.get(key)
  if (!walletNonces) {
    walletNonces = []
    usedNonces.set(key, walletNonces)
  }
  
  // Add new nonce
  walletNonces.push({ nonce, timestamp: now })
  
  // Clean up expired nonces
  const cutoff = now - NONCE_EXPIRY_MS
  const before = walletNonces.length
  const filtered = walletNonces.filter(entry => entry.timestamp > cutoff)
  usedNonces.set(key, filtered)
  
  if (before !== filtered.length) {
    logger.debug({ wallet: key, cleaned: before - filtered.length }, 'Cleaned expired nonces')
  }
}

/**
 * Validate nonce (check if unused and well-formed)
 */
export function validateNonce(wallet: string, nonce: string): { valid: boolean; error?: string } {
  // Basic format check
  if (!nonce || typeof nonce !== 'string') {
    return { valid: false, error: 'Invalid nonce format' }
  }
  
  // Check for replay
  if (isNonceUsed(wallet, nonce)) {
    logger.warn({ wallet, nonce }, 'Nonce replay attempt detected')
    return { valid: false, error: 'Nonce already used (replay protection)' }
  }
  
  return { valid: true }
}

/**
 * Get nonce stats for monitoring
 */
export function getNonceStats(): { wallets: number; totalNonces: number } {
  let totalNonces = 0
  for (const nonces of usedNonces.values()) {
    totalNonces += nonces.length
  }
  return {
    wallets: usedNonces.size,
    totalNonces,
  }
}
