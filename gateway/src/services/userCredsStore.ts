import NodeCache from 'node-cache'
import { logger } from '../utils/logger.js'

export interface UserCreds {
  apiKey: string
  secret: string
  passphrase: string
}

/**
 * In-memory credential store (long-lived process).
 *
 * Stores Polymarket L2 API credentials server-side so the browser never
 * sees apiKey/secret/passphrase.
 *
 * NOTE: Replace with Redis/DB for multi-replica deployments.
 */
const credsCache = new NodeCache({
  stdTTL: 12 * 60 * 60, // 12 hours
  checkperiod: 60,
  useClones: false,
})

/**
 * Get user credentials by checksum-lowercase address
 */
export function getUserCreds(address: string): UserCreds | undefined {
  const key = address.toLowerCase()
  logger.debug(`[Creds] Looking up creds: original=${address.slice(0, 10)}... normalized=${key.slice(0, 10)}...`)
  
  // Log all cache keys for debugging
  const allKeys = credsCache.keys()
  logger.debug(`[Creds] Cache has ${allKeys.length} entries: ${allKeys.slice(0, 5).map(k => k.slice(0, 10) + '...').join(', ')}${allKeys.length > 5 ? '...' : ''}`)
  
  const creds = credsCache.get<UserCreds>(key)
  if (creds) {
    logger.info(`[Creds] Retrieved cached creds for ${address.slice(0, 10)}... keyLen=${creds.apiKey.length} secretLen=${creds.secret.length} passLen=${creds.passphrase.length}`)
  } else {
    logger.warn(`[Creds] No cached creds found for ${address.slice(0, 10)}... normalized=${key.slice(0, 10)}...`)
  }
  return creds
}

/**
 * Store user credentials by checksum-lowercase address
 */
export function setUserCreds(address: string, creds: UserCreds): void {
  const key = address.toLowerCase()
  credsCache.set(key, creds)
  logger.info(`[Creds] Stored user creds for ${address.slice(0, 10)}... keyLen=${creds.apiKey.length} (TTL: 12h)`)
  
  // Verify storage immediately
  const verify = credsCache.get<UserCreds>(key)
  if (verify) {
    logger.info(`[Creds] Storage verified: key=${key.slice(0, 10)}... hasApiKey=${!!verify.apiKey} hasSecret=${!!verify.secret} hasPassphrase=${!!verify.passphrase} keyLen=${verify.apiKey?.length || 0}`)
  } else {
    logger.error(`[Creds] CRITICAL: Storage verification failed! key=${key.slice(0, 10)}... creds not found immediately after set!`)
  }
  
  // Log cache stats
  const stats = credsCache.keys().length
  logger.info(`[Creds] Cache now has ${stats} entries`)
}

export function clearUserCreds(address: string): void {
  credsCache.del(address.toLowerCase())
}

export function getCredsStats(): { entries: number } {
  return { entries: credsCache.keys().length }
}

