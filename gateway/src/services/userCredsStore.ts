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

export function getUserCreds(address: string): UserCreds | undefined {
  return credsCache.get<UserCreds>(address.toLowerCase())
}

export function setUserCreds(address: string, creds: UserCreds): void {
  credsCache.set(address.toLowerCase(), creds)
  logger.debug(`Stored user creds: ${address.slice(0, 10)}...`)
}

export function clearUserCreds(address: string): void {
  credsCache.del(address.toLowerCase())
}

export function getCredsStats(): { entries: number } {
  return { entries: credsCache.keys().length }
}

