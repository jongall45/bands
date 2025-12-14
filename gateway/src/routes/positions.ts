import { Router, Request, Response } from 'express'
import { getPositions } from '../services/polymarketClient.js'
import { queryLimiter } from '../middleware/rateLimiter.js'
import { logger } from '../utils/logger.js'

const router = Router()

/**
 * GET /api/positions
 * Get user's positions
 */
router.get('/', queryLimiter, async (req: Request, res: Response) => {
  const { address } = req.query
  
  if (!address || typeof address !== 'string') {
    return res.status(400).json({ error: 'address query parameter is required' })
  }
  
  try {
    const positions = await getPositions(address)
    res.json({ positions })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    logger.error(`Failed to get positions for ${address}: ${errorMsg}`)
    res.status(500).json({ error: 'Failed to fetch positions' })
  }
})

export default router
