/**
 * Polymarket Test Routes
 * 
 * Diagnostic endpoints to test order submission using @polymarket/clob-client directly.
 * This helps us understand the exact payload format Polymarket expects.
 */

import { Router, Request, Response } from 'express'
import { ClobClient, Side, OrderType } from '@polymarket/clob-client'
import { SignatureType } from '@polymarket/order-utils'
import { Wallet } from '@ethersproject/wallet'
import { logger } from '../utils/logger.js'
import { getUserCreds } from '../services/userCredsStore.js'

const router = Router()

const CLOB_HOST = 'https://clob.polymarket.com'
const CHAIN_ID = 137

/**
 * GET /api/polymarket/test/signature-types
 * 
 * Returns the signature type definitions for debugging
 */
router.get('/signature-types', (_req: Request, res: Response) => {
  res.json({
    signatureTypes: {
      EOA: SignatureType.EOA,                    // 0 - Simple EOA signing
      POLY_PROXY: SignatureType.POLY_PROXY,      // 1 - Magic/Proxy pattern
      POLY_GNOSIS_SAFE: SignatureType.POLY_GNOSIS_SAFE, // 2 - Safe wallet
    },
    explanation: {
      0: 'EOA - Use for standard browser wallets (Metamask) or TRUE embedded EOAs (Privy EOA)',
      1: 'POLY_PROXY - Use for Magic/email login wallets',
      2: 'POLY_GNOSIS_SAFE - Use for Safe/AA wallets or injected providers with proxy',
    },
    recommendation: 'For Privy embedded EOA (true EOA), use signatureType=0'
  })
})

/**
 * POST /api/polymarket/test/build-order
 * 
 * Test building an order using clob-client WITHOUT submitting
 * This helps verify the payload format
 */
router.post('/build-order', async (req: Request, res: Response) => {
  const { 
    tokenId, 
    price, 
    side, 
    size, 
    privateKey,  // For testing only - in prod we'd use a signer
    signatureType = 0,  // Default to EOA for Privy
    funderAddress,      // Optional - Polymarket profile address
    tickSize = '0.01',
    negRisk = false 
  } = req.body

  logger.info(`[Test] build-order request:`)
  logger.info(`  tokenId: ${tokenId?.slice(0, 30)}...`)
  logger.info(`  price: ${price}`)
  logger.info(`  side: ${side}`)
  logger.info(`  size: ${size}`)
  logger.info(`  signatureType: ${signatureType}`)
  logger.info(`  funderAddress: ${funderAddress?.slice(0, 10) || 'not set'}...`)

  if (!tokenId || price === undefined || !side || size === undefined) {
    return res.status(400).json({ error: 'Missing required fields: tokenId, price, side, size' })
  }

  if (!privateKey) {
    return res.status(400).json({ error: 'privateKey required for test endpoint' })
  }

  try {
    const signer = new Wallet(privateKey)
    const signerAddress = await signer.getAddress()
    
    logger.info(`  signer address: ${signerAddress.slice(0, 10)}...`)
    
    // Import OrderBuilder to build without posting
    const { OrderBuilder } = await import('@polymarket/clob-client')
    
    const orderBuilder = new OrderBuilder(
      signer,
      CHAIN_ID,
      signatureType,
      funderAddress || undefined
    )
    
    const sideEnum = side === 'BUY' ? Side.BUY : Side.SELL
    
    // Build the order (this signs it but doesn't submit)
    const signedOrder = await orderBuilder.buildOrder({
      tokenID: tokenId,
      price: price,
      side: sideEnum,
      size: size,
    }, {
      tickSize: tickSize as any,
      negRisk: negRisk,
    })
    
    logger.info(`[Test] Order built successfully`)
    logger.info(`  order.maker: ${signedOrder.maker}`)
    logger.info(`  order.signer: ${signedOrder.signer}`)
    logger.info(`  order.side: ${signedOrder.side}`)
    logger.info(`  order.signatureType: ${signedOrder.signatureType}`)
    
    // Return the signed order for inspection
    res.json({
      success: true,
      signedOrder: {
        ...signedOrder,
        signature: signedOrder.signature?.slice(0, 20) + '...' // Truncate signature
      },
      debug: {
        signerAddress,
        funderAddress: funderAddress || signerAddress,
        signatureType,
        signatureTypeName: SignatureType[signatureType],
      }
    })
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    logger.error(`[Test] build-order failed: ${errorMsg}`)
    res.status(500).json({ 
      error: errorMsg,
      stack: error instanceof Error ? error.stack : undefined
    })
  }
})

/**
 * POST /api/polymarket/test/submit-order
 * 
 * Test submitting an order using clob-client directly
 * Requires user creds to be already derived
 */
router.post('/submit-order', async (req: Request, res: Response) => {
  const { 
    tokenId, 
    price, 
    side, 
    size, 
    wallet,           // The wallet address with derived creds
    privateKey,       // For signing
    signatureType = 0,
    funderAddress,
    tickSize = '0.01',
    negRisk = false 
  } = req.body

  logger.info(`[Test] submit-order request:`)
  logger.info(`  wallet: ${wallet?.slice(0, 10)}...`)
  logger.info(`  tokenId: ${tokenId?.slice(0, 30)}...`)
  logger.info(`  signatureType: ${signatureType}`)

  if (!wallet || !tokenId || price === undefined || !side || size === undefined || !privateKey) {
    return res.status(400).json({ 
      error: 'Missing required fields: wallet, tokenId, price, side, size, privateKey' 
    })
  }

  // Get user creds
  const userCreds = getUserCreds(wallet)
  if (!userCreds) {
    return res.status(401).json({ 
      error: 'No credentials found for wallet. Complete L1 auth first.',
      hint: 'POST /api/polymarket/auth/complete with signed challenge'
    })
  }

  try {
    const signer = new Wallet(privateKey)
    const signerAddress = await signer.getAddress()
    
    // Verify signer matches wallet
    if (signerAddress.toLowerCase() !== wallet.toLowerCase()) {
      return res.status(400).json({ 
        error: 'Signer address does not match wallet',
        signerAddress,
        wallet
      })
    }
    
    const apiCreds = {
      key: userCreds.apiKey,
      secret: userCreds.secret,
      passphrase: userCreds.passphrase,
    }
    
    logger.info(`[Test] Creating ClobClient with:`)
    logger.info(`  host: ${CLOB_HOST}`)
    logger.info(`  chainId: ${CHAIN_ID}`)
    logger.info(`  signatureType: ${signatureType} (${SignatureType[signatureType]})`)
    logger.info(`  funderAddress: ${funderAddress || 'same as signer'}`)
    logger.info(`  signer: ${signerAddress.slice(0, 10)}...`)
    
    // Create ClobClient with all parameters
    const clobClient = new ClobClient(
      CLOB_HOST,
      CHAIN_ID,
      signer,
      apiCreds,
      signatureType,
      funderAddress || undefined
    )
    
    const sideEnum = side === 'BUY' ? Side.BUY : Side.SELL
    
    logger.info(`[Test] Calling createAndPostOrder...`)
    logger.info(`  tokenID: ${tokenId}`)
    logger.info(`  price: ${price}`)
    logger.info(`  side: ${sideEnum}`)
    logger.info(`  size: ${size}`)
    logger.info(`  tickSize: ${tickSize}`)
    logger.info(`  negRisk: ${negRisk}`)
    
    // Use the official createAndPostOrder method
    const result = await clobClient.createAndPostOrder(
      {
        tokenID: tokenId,
        price: Number(price),
        side: sideEnum,
        size: Number(size),
      },
      {
        tickSize: tickSize as any,
        negRisk: negRisk,
      },
      OrderType.GTC
    )
    
    logger.info(`[Test] Order result: ${JSON.stringify(result)}`)
    
    res.json({
      success: true,
      result,
      debug: {
        signatureType,
        signatureTypeName: SignatureType[signatureType],
        signerAddress,
        funderAddress: funderAddress || signerAddress,
      }
    })
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    logger.error(`[Test] submit-order failed: ${errorMsg}`)
    
    // Try to extract more details from Axios errors
    let details: any = {}
    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as any
      details = {
        status: axiosError.response?.status,
        statusText: axiosError.response?.statusText,
        data: axiosError.response?.data,
        headers: axiosError.response?.headers,
      }
      logger.error(`[Test] Response details: ${JSON.stringify(details)}`)
    }
    
    res.status(500).json({ 
      error: errorMsg,
      details,
      hint: 'Check signatureType, funderAddress, and credential validity'
    })
  }
})

/**
 * GET /api/polymarket/test/check-profile
 * 
 * Check if a wallet has a Polymarket profile/funder address
 */
router.get('/check-profile', async (req: Request, res: Response) => {
  const { wallet } = req.query as { wallet?: string }
  
  if (!wallet) {
    return res.status(400).json({ error: 'wallet query param required' })
  }
  
  try {
    // Try to get balance/allowance info which might reveal the profile
    const clobClient = new ClobClient(CLOB_HOST, CHAIN_ID)
    
    // Get tick sizes (public endpoint test)
    const tickSizes = await clobClient.getTickSize('21742633143463906290569050155826241533067272736897614950488156847949938836455')
    
    res.json({
      wallet,
      clobConnected: true,
      tickSizeTest: tickSizes,
      note: 'To check profile, try submitting an order and inspect the error for funder address requirements'
    })
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    res.status(500).json({ 
      error: errorMsg,
      wallet
    })
  }
})

export default router
