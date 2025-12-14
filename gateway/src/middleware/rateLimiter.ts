import rateLimit from 'express-rate-limit'
import { Request, Response } from 'express'
import { config } from '../config/index.js'
import { logger } from '../utils/logger.js'

/**
 * Rate limiting middleware
 * 
 * Prevents abuse and ensures we don't overwhelm Polymarket's API
 */

// Global rate limit for all requests
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: config.rateLimit.globalPerMinute,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Global rate limit exceeded: ${req.ip}`)
    res.status(429).json({ error: 'Too many requests, please try again later' })
  },
})

// Per-wallet rate limit for orders (stricter)
export const orderLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.rateLimit.ordersPerMinute,
  keyGenerator: (req: Request) => {
    // Use wallet address from body as key
    return req.body?.owner || req.ip || 'unknown'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const wallet = req.body?.owner || 'unknown'
    logger.warn(`Order rate limit exceeded: ${wallet}`)
    res.status(429).json({ error: 'Order rate limit exceeded. Max 30 orders per minute.' })
  },
})

// Per-wallet rate limit for queries
export const queryLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.rateLimit.queriesPerMinute,
  keyGenerator: (req: Request) => {
    return req.query.address as string || req.ip || 'unknown'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Query rate limit exceeded: ${req.ip}`)
    res.status(429).json({ error: 'Query rate limit exceeded. Please slow down.' })
  },
})

// Rate limit for health/auth status endpoints (prevent enumeration)
export const healthLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Health endpoint rate limit exceeded: ${req.ip}`)
    res.status(429).json({ error: 'Rate limit exceeded' })
  },
})

// Stricter rate limit for auth challenge (prevent brute force)
export const authChallengeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 challenges per minute per wallet
  keyGenerator: (req: Request) => {
    return req.query.wallet as string || req.ip || 'unknown'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Auth challenge rate limit exceeded: ${req.query.wallet || req.ip}`)
    res.status(429).json({ error: 'Too many auth attempts. Please wait.' })
  },
})
