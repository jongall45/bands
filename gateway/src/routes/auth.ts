import { Router, Request, Response } from 'express'
import { getUserCreds } from '../services/userCredsStore.js'
import { logger } from '../utils/logger.js'

const router = Router()

/**
 * GET /api/auth/derived-status?wallet=0x...
 * Debug endpoint to check if derived credentials exist for a wallet
 */
router.get('/derived-status', async (req: Request, res: Response) => {
  const { wallet } = req.query
  
  if (!wallet || typeof wallet !== 'string') {
    return res.status(400).json({ 
      error: 'wallet query parameter is required',
      example: '/api/auth/derived-status?wallet=0x...'
    })
  }
  
  const normalizedAddress = wallet.toLowerCase()
  const creds = getUserCreds(normalizedAddress)
  
  const response: {
    wallet: string
    normalizedAddress: string
    hasUserCreds: boolean
    derivedKeyLen?: number
    derivedSecretLen?: number
    derivedPassLen?: number
  } = {
    wallet,
    normalizedAddress,
    hasUserCreds: !!creds,
  }
  
  if (creds) {
    response.derivedKeyLen = creds.apiKey?.length || 0
    response.derivedSecretLen = creds.secret?.length || 0
    response.derivedPassLen = creds.passphrase?.length || 0
  }
  
  logger.info(`[Auth] Derived status check: wallet=${wallet.slice(0, 10)}... hasUserCreds=${response.hasUserCreds} keyLen=${response.derivedKeyLen || 0}`)
  
  res.json(response)
})

export default router
