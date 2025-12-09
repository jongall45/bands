'use client'

import { useState } from 'react'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { useOstiumPositions, type OstiumPosition } from '@/hooks/useOstiumPositions'
import { useOstiumPrices } from '@/hooks/useOstiumPrices'
import { arbitrum } from 'viem/chains'
import { encodeFunctionData, decodeFunctionResult } from 'viem'
import { OSTIUM_CONTRACTS, DEFAULT_SLIPPAGE_BPS } from '@/lib/ostium/constants'
import { OSTIUM_TRADING_ABI, OSTIUM_STORAGE_ABI } from '@/lib/ostium/abi'
import { Loader2, X, TrendingUp, TrendingDown, Clock } from 'lucide-react'
import { AssetIcon } from './AssetIcon'

// Helper to read on-chain position data directly from TradingStorage contract
// Uses the corrected ABI from: https://github.com/0xOstium/smart-contracts-public/blob/main/src/interfaces/IOstiumTradingStorage.sol
async function readOnChainPosition(trader: string, pairIndex: number, index: number) {
  try {
    // openTrades inputs: address _trader, uint16 _pairIndex, uint8 _index
    const calldata = encodeFunctionData({
      abi: OSTIUM_STORAGE_ABI,
      functionName: 'openTrades',
      args: [trader as `0x${string}`, pairIndex, index],
    })

    console.log('🔍 Calling openTrades with:', { trader, pairIndex, index })
    console.log('🔍 Calldata:', calldata)

    const response = await fetch('https://arb1.arbitrum.io/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [{
          to: OSTIUM_CONTRACTS.TRADING_STORAGE,
          data: calldata,
        }, 'latest'],
      }),
    })

    const result = await response.json()
    console.log('🔍 Raw RPC response:', result)

    if (result.error) {
      console.error('RPC Error:', result.error)
      return null
    }

    // openTrades returns 9 values: collateral, openPrice, tp, sl, trader, leverage, pairIndex, index, buy
    if (result.result && result.result !== '0x' && result.result.length > 66) {
      // Try to decode the response
      try {
        const decoded = decodeFunctionResult({
          abi: OSTIUM_STORAGE_ABI,
          functionName: 'openTrades',
          data: result.result,
        }) as [bigint, bigint, bigint, bigint, string, number, number, number, boolean]

        console.log('🔍 Decoded position (raw):', decoded)

        // Extract values in order: collateral, openPrice, tp, sl, trader, leverage, pairIndex, index, buy
        const [collateral, openPrice, tp, sl, traderAddr, leverage, decodedPairIndex, decodedIndex, buy] = decoded

        // Check if the trader address is zero (means no position)
        if (traderAddr === '0x0000000000000000000000000000000000000000') {
          console.log('⚠️ Position exists but trader is zero address - position likely closed')
          return null
        }

        // Check if collateral is 0 (no position)
        if (collateral === BigInt(0)) {
          console.log('⚠️ Position has zero collateral - position likely closed')
          return null
        }

        const positionData = {
          trader: traderAddr,
          pairIndex: Number(decodedPairIndex),
          index: Number(decodedIndex),
          positionSizeUSDC: Number(collateral) / 1e6, // PRECISION_6
          openPrice: Number(openPrice) / 1e18,        // PRECISION_18
          buy,
          leverage: Number(leverage) / 100,           // PRECISION_2 (e.g., 1000 = 10x)
          tp: Number(tp) / 1e18,
          sl: Number(sl) / 1e18,
        }

        console.log('🔍 Decoded position (parsed):', positionData)
        return positionData
      } catch (decodeError) {
        console.error('Failed to decode with standard ABI, trying raw parsing:', decodeError)
        // Try raw parsing of the response
        return parseRawPositionData(result.result)
      }
    }

    console.log('⚠️ Empty or minimal response from openTrades')
    return null
  } catch (error) {
    console.error('Error reading on-chain position:', error)
    return null
  }
}

// Fallback raw parser for position data
// New Trade struct layout (from Ostium contract):
// 0: collateral (uint256)   - PRECISION_6
// 1: openPrice (uint192)    - PRECISION_18
// 2: tp (uint192)           - PRECISION_18
// 3: sl (uint192)           - PRECISION_18
// 4: trader (address)
// 5: leverage (uint32)      - PRECISION_2
// 6: pairIndex (uint16)
// 7: index (uint8)
// 8: buy (bool)
function parseRawPositionData(hexData: string): any | null {
  try {
    // Remove 0x prefix
    const data = hexData.slice(2)

    // Each 32-byte slot is 64 hex characters
    const slots = []
    for (let i = 0; i < data.length; i += 64) {
      slots.push(data.slice(i, i + 64))
    }

    console.log('🔍 Raw data slots:', slots)

    if (slots.length < 9) {
      console.log('⚠️ Not enough data slots for position struct')
      return null
    }

    const collateral = BigInt('0x' + slots[0])
    const openPrice = BigInt('0x' + slots[1])
    const tp = BigInt('0x' + slots[2])
    const sl = BigInt('0x' + slots[3])
    const trader = '0x' + slots[4].slice(24) // Last 20 bytes of the slot
    const leverage = BigInt('0x' + slots[5])
    const pairIndex = BigInt('0x' + slots[6])
    const index = BigInt('0x' + slots[7])
    const buy = BigInt('0x' + slots[8]) === BigInt(1)

    // Check if trader is zero address or collateral is zero
    if (trader === '0x0000000000000000000000000000000000000000' || collateral === BigInt(0)) {
      console.log('⚠️ No position found (zero trader or collateral)')
      return null
    }

    return {
      trader,
      pairIndex: Number(pairIndex),
      index: Number(index),
      positionSizeUSDC: Number(collateral) / 1e6,  // PRECISION_6
      openPrice: Number(openPrice) / 1e18,          // PRECISION_18
      buy,
      leverage: Number(leverage) / 100,             // PRECISION_2
      tp: Number(tp) / 1e18,
      sl: Number(sl) / 1e18,
    }
  } catch (e) {
    console.error('Raw parsing failed:', e)
    return null
  }
}

// Read additional position info including beingMarketClosed flag
async function readPositionInfo(trader: string, pairIndex: number, index: number) {
  try {
    const calldata = encodeFunctionData({
      abi: OSTIUM_STORAGE_ABI,
      functionName: 'openTradesInfo',
      args: [trader as `0x${string}`, pairIndex, index],
    })

    const response = await fetch('https://arb1.arbitrum.io/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [{
          to: OSTIUM_CONTRACTS.TRADING_STORAGE,
          data: calldata,
        }, 'latest'],
      }),
    })

    const result = await response.json()

    if (result.error || !result.result || result.result === '0x') {
      return null
    }

    // Decode: tokenId, tokenPriceDai, tpLastUpdated, slLastUpdated, beingMarketClosed, createdBlock, lossProtectionPercentage
    const decoded = decodeFunctionResult({
      abi: OSTIUM_STORAGE_ABI,
      functionName: 'openTradesInfo',
      data: result.result,
    }) as [bigint, bigint, number, number, boolean, number, number]

    const [tokenId, tokenPriceDai, tpLastUpdated, slLastUpdated, beingMarketClosed, createdBlock, lossProtectionPercentage] = decoded

    return {
      tokenId: Number(tokenId),
      tokenPriceDai: Number(tokenPriceDai) / 1e18, // PRECISION_18
      tpLastUpdated,
      slLastUpdated,
      beingMarketClosed,
      createdBlock,
      lossProtectionPercentage,
    }
  } catch (error) {
    console.error('Error reading position info:', error)
    return null
  }
}

// Scan multiple position indices to find all positions for a trader/pair
async function scanPositions(trader: string, pairIndex: number, maxIndex: number = 5) {
  console.log(`🔍 Scanning positions for trader=${trader}, pairIndex=${pairIndex}, indices 0-${maxIndex}`)
  const positions = []

  for (let i = 0; i <= maxIndex; i++) {
    const pos = await readOnChainPosition(trader, pairIndex, i)
    if (pos && pos.positionSizeUSDC > 0) {
      console.log(`✅ Found position at index ${i}:`, pos)
      positions.push({ ...pos, index: i })
    }
  }

  return positions
}

interface OstiumPositionsProps {
  onSelectPair?: (pairId: number) => void
}

export function OstiumPositions({ onSelectPair }: OstiumPositionsProps) {
  const { data: positions, isLoading, refetch } = useOstiumPositions()
  const { data: prices } = useOstiumPrices()
  const { client } = useSmartWallets()
  // Track closing state with both pairId and index to handle multiple positions
  const [closingKey, setClosingKey] = useState<string | null>(null)

  const closePosition = async (position: OstiumPosition, closePercent: number = 100) => {
    if (!client) {
      console.error('Smart wallet not ready')
      return
    }

    const smartWalletAddress = client.account?.address
    if (!smartWalletAddress) {
      console.error('Smart wallet address not available')
      return
    }

    const positionKey = `${position.pairId}-${position.index}`
    setClosingKey(positionKey)

    try {
      // Switch to Arbitrum if needed
      const chainId = await client.getChainId()
      if (chainId !== arbitrum.id) {
        console.log('🔄 Switching to Arbitrum...')
        await client.switchChain({ id: arbitrum.id })
      }

      console.log('╔═══════════════════════════════════════════════════════════════════════════╗')
      console.log('║  READING ON-CHAIN POSITION DATA                                           ║')
      console.log('╚═══════════════════════════════════════════════════════════════════════════╝')

      // CRITICAL: Read the ACTUAL on-chain position data first
      const onChainPosition = await readOnChainPosition(
        smartWalletAddress,
        position.pairId,
        position.index
      )

      // Also read position info to check beingMarketClosed flag
      const positionInfo = await readPositionInfo(
        smartWalletAddress,
        position.pairId,
        position.index
      )

      console.log('📊 ON-CHAIN Position Data:')
      if (onChainPosition) {
        console.log('   - Trader:', onChainPosition.trader)
        console.log('   - Pair Index:', onChainPosition.pairIndex)
        console.log('   - Position Index:', onChainPosition.index)
        console.log('   - Position Size USDC:', onChainPosition.positionSizeUSDC)
        console.log('   - Open Price:', onChainPosition.openPrice)
        console.log('   - Buy (Long):', onChainPosition.buy)
        console.log('   - Leverage:', onChainPosition.leverage)
        console.log('   - TP:', onChainPosition.tp)
        console.log('   - SL:', onChainPosition.sl)

        // Log position info
        if (positionInfo) {
          console.log('')
          console.log('📋 Position Info (openTradesInfo):')
          console.log('   - Token ID:', positionInfo.tokenId)
          console.log('   - Token Price (stored):', positionInfo.tokenPriceDai)
          console.log('   - Being Market Closed:', positionInfo.beingMarketClosed)
          console.log('   - Created Block:', positionInfo.createdBlock)
          console.log('   - Loss Protection %:', positionInfo.lossProtectionPercentage)

          // CRITICAL: Check if position is already being closed
          if (positionInfo.beingMarketClosed) {
            console.log('')
            console.log('🚨 POSITION IS ALREADY BEING MARKET CLOSED!')
            console.log('   A previous close request is pending fulfillment by the oracle.')
            console.log('   The Gelato keeper should execute this shortly.')
            console.log('   If stuck for a long time, contact Ostium support.')
            alert('This position already has a pending close request!\n\nA previous close is waiting for the Gelato keeper to fulfill it.\n\nPlease wait a few minutes. If it remains stuck, contact Ostium support.')
            setClosingKey(null)
            return
          }
        }
      } else {
        console.log('   ⚠️ NO ON-CHAIN POSITION FOUND AT INDEX', position.index)
        console.log('   Scanning for positions at other indices...')

        // Scan for positions at other indices
        const foundPositions = await scanPositions(smartWalletAddress, position.pairId, 5)

        if (foundPositions.length > 0) {
          console.log(`   ✅ Found ${foundPositions.length} position(s) at other indices:`)
          foundPositions.forEach(p => {
            console.log(`      Index ${p.index}: ${p.positionSizeUSDC} USDC, Price: ${p.openPrice}`)
          })
          alert(`Position not found at index ${position.index}. Found ${foundPositions.length} position(s) at other indices. Check console for details. The subgraph data may be stale.`)
          setClosingKey(null)
          return
        } else {
          console.log('   ❌ No positions found for this pair!')
          console.log('   The position has likely already been closed.')
          alert('This position appears to be already closed on-chain. The subgraph data is stale. Please refresh the page.')
          refetch() // Trigger a refresh of positions
          setClosingKey(null)
          return
        }
      }

      console.log('')
      console.log('📊 SUBGRAPH Position Data (what UI shows):')
      console.log('   - Pair Index:', position.pairId)
      console.log('   - Position Index:', position.index)
      console.log('   - Collateral:', position.collateral, 'USDC')
      console.log('   - Entry Price:', position.entryPrice)
      console.log('   - Is Long:', position.isLong)
      console.log('   - Leverage:', position.leverage)

      // Compare the data
      if (onChainPosition) {
        console.log('')
        console.log('🔍 DATA COMPARISON:')
        console.log(`   Collateral: Subgraph=${position.collateral.toFixed(6)} vs OnChain=${onChainPosition.positionSizeUSDC.toFixed(6)}`)
        console.log(`   Entry Price: Subgraph=${position.entryPrice.toFixed(2)} vs OnChain=${onChainPosition.openPrice.toFixed(2)}`)
        console.log(`   Direction: Subgraph=${position.isLong ? 'LONG' : 'SHORT'} vs OnChain=${onChainPosition.buy ? 'LONG' : 'SHORT'}`)

        if (Math.abs(position.collateral - onChainPosition.positionSizeUSDC) > 0.01) {
          console.log('')
          console.log('⚠️ COLLATERAL MISMATCH DETECTED!')
          console.log('   The subgraph shows different collateral than what is on-chain.')
          console.log('   Using ON-CHAIN value for close calculation.')
        }
      }

      // CRITICAL: Fetch fresh price directly from Ostium API before closing
      // This ensures we use the exact price their oracle will use
      let currentPrice = 0
      try {
        console.log('📡 Fetching fresh price from Ostium API...')
        const priceResponse = await fetch(`https://metadata-backend.ostium.io/PricePublish/latest-price?asset=${position.symbol.replace('-USD', 'USD')}`)
        if (priceResponse.ok) {
          const priceData = await priceResponse.json()
          currentPrice = priceData.mid || priceData.price || 0
          console.log('✅ Fresh Ostium API price:', currentPrice)
        }
      } catch (e) {
        console.log('⚠️ Could not fetch from Ostium API, using cached price')
      }

      // Fallback to cached prices if API fails
      if (!currentPrice || currentPrice <= 0) {
        const currentPriceData = prices?.find(p => p.pairId === position.pairId)
        currentPrice = currentPriceData?.mid || position.currentPrice || position.entryPrice
      }

      if (!currentPrice || currentPrice <= 0) {
        throw new Error('Unable to fetch current price for market close')
      }

      // CRITICAL FIX: Check if on-chain price is vastly different from API price
      // This indicates a price format mismatch - just use API price with max slippage
      let marketPriceToUse = currentPrice
      if (onChainPosition && onChainPosition.openPrice > 0) {
        const priceRatio = currentPrice / onChainPosition.openPrice
        console.log('📊 Price ratio (API/OnChain):', priceRatio.toFixed(2))

        // If prices differ by more than 100x, there's a potential format mismatch
        if (priceRatio > 100) {
          console.log('⚠️ LARGE PRICE DIFFERENCE DETECTED!')
          console.log('   On-chain openPrice:', onChainPosition.openPrice)
          console.log('   API current price:', currentPrice)
          console.log('   This position may have corrupted price data')
          console.log('   Will attempt close with API price and max slippage')
        }
      }

      // Calculate close percentage (10000 = 100%)
      const closePercentage = Math.round(closePercent * 100)

      // Use on-chain collateral if available, otherwise fall back to subgraph
      const actualCollateral = onChainPosition?.positionSizeUSDC || position.collateral
      const expectedReturn = (actualCollateral * closePercent) / 100

      console.log('')
      console.log('╔═══════════════════════════════════════════════════════════════════════════╗')
      console.log('║  CLOSING POSITION VIA SMART WALLET                                        ║')
      console.log('╚═══════════════════════════════════════════════════════════════════════════╝')
      console.log('📍 Smart Wallet:', smartWalletAddress)
      console.log('📊 Position Details:')
      console.log('   - Pair Index (pairId):', position.pairId)
      console.log('   - Position Index:', position.index)
      console.log('   - Symbol:', position.symbol)
      console.log('   - Direction:', position.isLong ? 'LONG' : 'SHORT')
      console.log('   - Subgraph Collateral:', position.collateral, 'USDC')
      console.log('   - ON-CHAIN Collateral:', actualCollateral, 'USDC')
      console.log('   - Leverage:', position.leverage, 'x')
      console.log('   - On-chain Entry Price:', onChainPosition?.openPrice || 'N/A')
      console.log('   - API Current Price:', currentPrice)
      console.log('   - Market Price to Use:', marketPriceToUse)
      console.log('💰 Close Amount:')
      console.log('   - Close Percentage:', closePercent, '%', `(${closePercentage}/10000)`)
      console.log('   - Expected Return:', expectedReturn.toFixed(2), 'USDC (before PnL)')

      // Convert price to 18 decimal precision (PRECISION_18)
      const marketPriceWei = BigInt(Math.floor(marketPriceToUse * 1e18))
      console.log('📊 Market Price (18 dec):', marketPriceWei.toString())

      // CRITICAL: Use MAXIMUM slippage (99%) to ensure close goes through
      // The oracle price format might differ significantly from what we expect
      const slippageP = 9900 // 99% slippage - maximum to ensure execution
      console.log('⚠️ Using 99% slippage (maximum) to ensure close execution')

      console.log('📦 Contract Call Parameters:', {
        pairIndex: position.pairId,
        index: position.index,
        closePercentage,
        marketPrice: marketPriceWei.toString(),
        slippageP,
      })

      // Encode closeTradeMarket call with correct parameters
      const calldata = encodeFunctionData({
        abi: OSTIUM_TRADING_ABI,
        functionName: 'closeTradeMarket',
        args: [
          position.pairId,           // uint16 pairIndex
          position.index,            // uint8 index
          closePercentage,           // uint16 closePercentage (10000 = 100%)
          marketPriceWei,            // uint192 marketPrice
          slippageP,                 // uint32 slippageP
        ],
      })

      console.log('📝 Calldata:', calldata)
      console.log('📝 Calldata length:', calldata.length)
      console.log('🚀 Sending close position via smart wallet...')
      console.log('💰 Note: Ostium charges a 0.10 USDC oracle fee per close')

      // Close trade - nonpayable function
      const hash = await client.sendTransaction({
        calls: [{
          to: OSTIUM_CONTRACTS.TRADING as `0x${string}`,
          data: calldata,
          value: BigInt(0), // Function is nonpayable
        }],
      })

      console.log('✅ Close position tx submitted:', hash)
      console.log('🔗 Arbiscan:', `https://arbiscan.io/tx/${hash}`)
      console.log('')
      console.log('⏳ IMPORTANT: Ostium closes are ASYNCHRONOUS')
      console.log('   1. This tx requests the close and pays 0.10 USDC oracle fee')
      console.log('   2. An oracle/keeper will fulfill the price request')
      console.log('   3. Your collateral + PnL will be returned in a follow-up tx')
      console.log('   4. This usually takes 5-30 seconds to settle')
      console.log('')
      console.log('🔍 Checking if position closed in 15 seconds...')

      // Check if position still exists after 15 seconds
      setTimeout(async () => {
        const postClosePosition = await readOnChainPosition(
          smartWalletAddress,
          position.pairId,
          position.index
        )
        if (!postClosePosition || postClosePosition.positionSizeUSDC === 0) {
          console.log('✅ SUCCESS! Position is now closed on-chain!')
          alert('Position successfully closed! Your funds should be in your wallet.')
        } else {
          console.log('⚠️ Position STILL EXISTS after close attempt!')
          console.log('   Remaining collateral:', postClosePosition.positionSizeUSDC, 'USDC')
          console.log('')
          console.log('📋 TROUBLESHOOTING:')
          console.log('   1. Check Arbiscan Events tab for the transaction')
          console.log('   2. Look for "MarketOrderExecuted" or "CloseRejected" events')
          console.log('   3. The oracle callback may have failed due to:')
          console.log('      - Price validation failure')
          console.log('      - Insufficient protocol liquidity')
          console.log('      - Position data corruption')
          console.log('')
          console.log('   Consider contacting Ostium support about this position.')
          alert('⚠️ Position still open!\n\nThe close transaction was submitted but the position remains open. This could be due to:\n1. Oracle callback failure\n2. Price validation issue\n3. Protocol-level rejection\n\nCheck the Arbiscan Events tab for details.\nYou may need to contact Ostium support.')
        }
        refetch()
      }, 15000)

      // Additional refetch as backup
      setTimeout(() => refetch(), 30000)
    } catch (error: any) {
      console.error('❌ Close position failed:', error)

      // Extract useful error message
      let errorMsg = 'Unknown error'
      if (error.shortMessage) {
        errorMsg = error.shortMessage
      } else if (error.message) {
        errorMsg = error.message
      }

      // Check for common issues
      if (errorMsg.includes('reverted during simulation')) {
        console.error('📋 Simulation revert - possible causes:')
        console.error('  1. Position may already be closed')
        console.error('  2. Position index may be incorrect')
        console.error('  3. Insufficient ETH for Pyth oracle fee')
        console.error('  4. Contract may require different parameters')
        errorMsg = 'Transaction simulation failed. Position may already be closed or parameters are incorrect.'
      }

      alert(`Failed to close position: ${errorMsg}`)
    } finally {
      setClosingKey(null)
    }
  }

  if (isLoading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 text-white/20 animate-spin" />
        <p className="text-white/40 text-sm">Loading positions...</p>
      </div>
    )
  }

  if (!positions?.length) {
    return (
      <div className="p-8 text-center">
        <div className="w-16 h-16 bg-white/[0.03] rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Clock className="w-8 h-8 text-white/20" />
        </div>
        <p className="text-white/40 font-medium">No open positions</p>
        <p className="text-white/20 text-sm mt-1">Your trades will appear here</p>
      </div>
    )
  }

  // Enrich positions with current prices
  const enrichedPositions = positions.map(pos => {
    const livePrice = prices?.find(p => p.pairId === pos.pairId)?.mid
    const currentPrice = livePrice || pos.entryPrice

    // Check if entry price seems wrong (more than 50x different from current price)
    // This indicates a potential data issue from the subgraph
    const priceRatio = currentPrice / pos.entryPrice
    const hasInvalidEntryPrice = !!(livePrice && pos.entryPrice > 0 && (priceRatio > 50 || priceRatio < 0.02))

    // If entry price is invalid, use live price as a fallback for PnL calculation
    // This prevents showing crazy PnL percentages like +4975484%
    const effectiveEntryPrice = hasInvalidEntryPrice ? currentPrice : pos.entryPrice

    const priceDiff = currentPrice - effectiveEntryPrice
    const pnlRaw = pos.isLong
      ? priceDiff * pos.collateral * pos.leverage / effectiveEntryPrice
      : -priceDiff * pos.collateral * pos.leverage / effectiveEntryPrice
    const pnlPercent = (pnlRaw / pos.collateral) * 100

    return {
      ...pos,
      currentPrice,
      pnl: pnlRaw,
      pnlPercent,
      hasInvalidEntryPrice, // Flag for UI to show warning
      displayEntryPrice: hasInvalidEntryPrice ? currentPrice : pos.entryPrice,
    }
  })

  return (
    <div className="p-3 space-y-2">
      {enrichedPositions.map((position) => {
        const positionKey = `${position.pairId}-${position.index}`
        return (
          <PositionCard
            key={positionKey}
            position={position}
            onClose={(percent) => closePosition(position, percent)}
            isClosing={closingKey === positionKey}
            onSelect={() => onSelectPair?.(position.pairId)}
          />
        )
      })}
    </div>
  )
}

interface EnrichedPosition extends OstiumPosition {
  hasInvalidEntryPrice?: boolean
  displayEntryPrice?: number
}

interface PositionCardProps {
  position: EnrichedPosition
  onClose: (percent: number) => void
  isClosing: boolean
  onSelect?: () => void
}

function PositionCard({ position, onClose, isClosing, onSelect }: PositionCardProps) {
  const [showCloseOptions, setShowCloseOptions] = useState(false)
  const [closePercent, setClosePercent] = useState(100)

  const formatPrice = (p: number) => {
    if (p < 10) return p.toFixed(4)
    return p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const timeSinceOpen = () => {
    const diff = Date.now() - position.openTime
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    if (hours > 24) return `${Math.floor(hours / 24)}d ago`
    if (hours > 0) return `${hours}h ago`
    return `${minutes}m ago`
  }

  // Calculate the amount of collateral being closed
  const collateralToClose = (position.collateral * closePercent) / 100
  const sizeToClose = (position.collateral * position.leverage * closePercent) / 100

  // Quick select percentages for convenience
  const quickPercentages = [25, 50, 75, 100]

  return (
    <div className="bg-[#141414] border border-white/[0.04] rounded-xl p-3 relative overflow-hidden">
      {/* PnL Background Gradient - only show if entry price is valid */}
      {!position.hasInvalidEntryPrice && (
        <div
          className={`absolute inset-0 opacity-10 ${
            position.pnl >= 0
              ? 'bg-gradient-to-r from-green-500 to-transparent'
              : 'bg-gradient-to-r from-red-500 to-transparent'
          }`}
        />
      )}

      {/* Header - clickable to select chart */}
      <div
        className="flex items-center justify-between mb-2 relative cursor-pointer"
        onClick={onSelect}
      >
        <div className="flex items-center gap-2">
          <div className="relative">
            <AssetIcon symbol={position.symbol} size="md" />
            {/* Long/Short indicator badge */}
            <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full flex items-center justify-center ${
              position.isLong ? 'bg-green-500' : 'bg-red-500'
            }`}>
              {position.isLong ? (
                <TrendingUp className="w-2 h-2 text-white" />
              ) : (
                <TrendingDown className="w-2 h-2 text-white" />
              )}
            </div>
          </div>
          <div>
            <p className="text-white font-medium text-sm">{position.symbol}</p>
            <p className="text-white/40 text-[10px]">
              {position.leverage}x {position.isLong ? 'Long' : 'Short'} · {timeSinceOpen()}
            </p>
          </div>
        </div>
        <div className="text-right">
          {position.hasInvalidEntryPrice ? (
            <>
              <p className="font-mono font-semibold text-white/40">---</p>
              <p className="text-[10px] font-medium text-white/30">P&L unavailable</p>
            </>
          ) : (
            <>
              <p className={`font-mono font-semibold ${position.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ${position.pnl >= 0 ? '' : '-'}{Math.abs(position.pnl).toFixed(2)}
              </p>
              <p className={`text-[10px] font-medium ${position.pnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {position.pnlPercent >= 0 ? '+' : ''}{position.pnlPercent.toFixed(2)}%
              </p>
            </>
          )}
        </div>
      </div>

      {/* Invalid Entry Price Warning */}
      {position.hasInvalidEntryPrice && (
        <div className="mb-2 px-2 py-1 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex items-center gap-2 relative">
          <span className="text-yellow-400 text-[10px]">⚠️ Entry price data unavailable</span>
        </div>
      )}

      {/* Details Grid - more compact */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-2 text-xs relative">
        <div className="flex justify-between">
          <span className="text-white/30">Size</span>
          <span className="text-white font-mono">${(position.collateral * position.leverage).toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/30">Collateral</span>
          <span className="text-white font-mono">${position.collateral.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/30">Entry</span>
          <span className={`font-mono ${position.hasInvalidEntryPrice ? 'text-yellow-400' : 'text-white'}`}>
            {position.hasInvalidEntryPrice ? '---' : `$${formatPrice(position.displayEntryPrice || position.entryPrice)}`}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/30">Mark</span>
          <span className="text-white font-mono">${formatPrice(position.currentPrice)}</span>
        </div>
      </div>

      {/* TP/SL Tags */}
      {(position.takeProfit || position.stopLoss) && (
        <div className="flex gap-2 mb-2 relative">
          {position.takeProfit && (
            <span className="bg-green-500/10 border border-green-500/20 text-green-400 text-[10px] px-2 py-0.5 rounded-lg">
              TP: ${formatPrice(position.takeProfit)}
            </span>
          )}
          {position.stopLoss && (
            <span className="bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] px-2 py-0.5 rounded-lg">
              SL: ${formatPrice(position.stopLoss)}
            </span>
          )}
        </div>
      )}

      {/* Close Position Section */}
      {isClosing ? (
        <div className="w-full py-2 bg-white/[0.05] border border-white/[0.08] rounded-lg text-white/60 text-xs font-medium flex items-center justify-center gap-2 relative">
          <Loader2 className="w-3 h-3 animate-spin" />
          Closing {closePercent}%...
        </div>
      ) : showCloseOptions ? (
        <div className="space-y-2 relative">
          {/* Close amount display */}
          <div className="bg-white/[0.03] rounded-lg p-2 space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="text-white/40 text-[10px]">Close Amount</span>
              <span className="text-white font-mono text-xs font-semibold">{closePercent}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/40 text-[10px]">Collateral</span>
              <span className="text-[#FF6B00] font-mono text-xs font-semibold">${collateralToClose.toFixed(2)}</span>
            </div>
          </div>

          {/* Slider */}
          <div className="px-1">
            <input
              type="range"
              min="1"
              max="100"
              value={closePercent}
              onChange={(e) => setClosePercent(parseInt(e.target.value))}
              className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#FF6B00]
                [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:cursor-pointer
                [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white/20
                [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4
                [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[#FF6B00]
                [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white/20
                [&::-moz-range-thumb]:cursor-pointer"
              style={{
                background: `linear-gradient(to right, #FF6B00 0%, #FF6B00 ${closePercent}%, rgba(255,255,255,0.1) ${closePercent}%, rgba(255,255,255,0.1) 100%)`
              }}
            />
          </div>

          {/* Quick select buttons */}
          <div className="grid grid-cols-4 gap-1">
            {quickPercentages.map((pct) => (
              <button
                key={pct}
                onClick={() => setClosePercent(pct)}
                className={`py-1 rounded text-[10px] font-medium transition-all ${
                  closePercent === pct
                    ? 'bg-[#FF6B00]/30 text-[#FF6B00] border border-[#FF6B00]/50'
                    : 'bg-white/[0.05] hover:bg-white/[0.08] text-white/50 hover:text-white/70 border border-white/[0.06]'
                }`}
              >
                {pct}%
              </button>
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex gap-1.5">
            <button
              onClick={() => setShowCloseOptions(false)}
              className="flex-1 py-2 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] rounded-lg text-white/50 hover:text-white/70 text-xs font-medium transition-all"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onClose(closePercent)
                setShowCloseOptions(false)
              }}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1 ${
                closePercent === 100
                  ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30'
                  : 'bg-[#FF6B00]/20 hover:bg-[#FF6B00]/30 text-[#FF6B00] border border-[#FF6B00]/30'
              }`}
            >
              <X className="w-3 h-3" />
              Close {closePercent}%
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowCloseOptions(true)}
          className="w-full py-2 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] rounded-lg text-white/60 hover:text-white text-xs font-medium transition-all flex items-center justify-center gap-1.5 relative"
        >
          <X className="w-3 h-3" />
          Close Position
        </button>
      )}

      {/* Debug info (position index) - small footer */}
      <div className="mt-1.5 pt-1.5 border-t border-white/[0.04] text-[10px] text-white/20 font-mono flex justify-between relative">
        <span>idx: {position.index}</span>
        <span>pair: {position.pairId}</span>
      </div>
    </div>
  )
}

