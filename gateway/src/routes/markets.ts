import { Router, Request, Response } from 'express'
import { getMarkets, getMarket, getMarketStats } from '../services/polymarketClient.js'
import { queryLimiter } from '../middleware/rateLimiter.js'
import { logger } from '../utils/logger.js'

const router = Router()

/**
 * GET /api/markets
 * Get all markets with optional filters
 */
router.get('/', queryLimiter, async (req: Request, res: Response) => {
  try {
    const active = req.query.active === 'true' ? true : req.query.active === 'false' ? false : undefined
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined
    
    const markets = await getMarkets({ active, limit })
    res.json({ markets })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    logger.error(`Failed to get markets: ${errorMsg}`)
    res.status(500).json({ error: 'Failed to fetch markets' })
  }
})

/**
 * GET /api/markets/:id
 * Get single market by condition ID
 */
router.get('/:id', queryLimiter, async (req: Request, res: Response) => {
  try {
    const market = await getMarket(req.params.id)
    if (!market) {
      return res.status(404).json({ error: 'Market not found' })
    }
    res.json({ market })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    logger.error(`Failed to get market ${req.params.id}: ${errorMsg}`)
    res.status(500).json({ error: 'Failed to fetch market' })
  }
})

/**
 * GET /api/markets/:id/stats
 * Get market statistics (orderbook, prices)
 */
router.get('/:id/stats', queryLimiter, async (req: Request, res: Response) => {
  try {
    const tokenId = req.query.tokenId as string
    if (!tokenId) {
      return res.status(400).json({ error: 'tokenId query parameter required' })
    }
    
    const stats = await getMarketStats(tokenId)
    res.json({ stats })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    logger.error(`Failed to get market stats ${req.params.id}: ${errorMsg}`)
    res.status(500).json({ error: 'Failed to fetch market stats' })
  }
})

export default router
