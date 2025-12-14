import { getUserCreds, setUserCreds, type UserCreds } from './userCredsStore.js'
import { deriveOrCreateApiKey, type L1AuthPayload } from './polymarketClient.js'
import { logger } from '../utils/logger.js'
import { ethers } from 'ethers'

/**
 * Get or derive CLOB credentials for a user wallet
 * 
 * This function:
 * 1. Checks if we have cached credentials for this address
 * 2. If not, derives them using L1 auth signature
 * 3. Stores them for future use
 * 
 * @param userAddress - The wallet address (will be normalized to lowercase)
 * @param l1Auth - L1 authentication payload (signature, timestamp, nonce)
 * @returns UserCreds (L2 API credentials)
 */
export async function getOrDeriveClobCreds(
  userAddress: string,
  l1Auth: L1AuthPayload
): Promise<UserCreds> {
  // Normalize address to checksum-lowercase
  const normalizedAddress = userAddress.toLowerCase()
  
  // Check cache first
  let creds = getUserCreds(normalizedAddress)
  if (creds) {
    logger.info(`[Creds] Using cached derived creds for ${userAddress.slice(0, 10)}... keyLen=${creds.apiKey.length}`)
    return creds
  }
  
  // Verify L1 auth address matches userAddress
  if (l1Auth.address.toLowerCase() !== normalizedAddress) {
    throw new Error(`L1 auth address (${l1Auth.address}) does not match user address (${userAddress})`)
  }
  
  // Derive new credentials
  logger.info(`[Creds] Deriving new L2 API key for ${userAddress.slice(0, 10)}... (first time for this wallet)`)
  creds = await deriveOrCreateApiKey(l1Auth)
  
  // Store for future use
  setUserCreds(normalizedAddress, creds)
  
  logger.info(`[Creds] Successfully derived and cached creds for ${userAddress.slice(0, 10)}... keyLen=${creds.apiKey.length}`)
  return creds
}
