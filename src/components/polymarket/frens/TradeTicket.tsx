'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { X, Loader2, AlertCircle, TrendingUp, TrendingDown, Zap } from 'lucide-react'
import { SportsGame, formatCents } from '@/lib/polymarket/sports'
import { 
  fetchOrderbook, 
  getBuyQuote, 
  getSellQuote, 
  getLimitPrice,
  formatPriceCents,
  validateOrderbook,
  BuyQuote,
  SellQuote,
} from '@/lib/polymarket/orderbook'
import { getPosition, formatPnl } from '@/lib/polymarket/positionStore'
import { usePolymarketTrade } from '@/hooks/usePolymarketTrade'

interface TradeTicketProps {
  isOpen: boolean
  onClose: () => void
  game: SportsGame
  selectedTeamIndex: 0 | 1
  cashBalance: number
  onTradeSuccess?: () => void
}

export interface TradeParams {
  tokenId: string
  side: 'BUY' | 'SELL'
  amount: number        // USDC for buy, shares for sell
  limitPrice: number    // 0-1 price
  estAvgPrice: number   // Expected fill price
  outcomeLabel: string
  marketId: string
}

type TradeMode = 'BUY' | 'SELL'

const BUY_CHIPS = [1, 5, 10, 20]
const SELL_CHIPS = [25, 50, 100] // Percentages

export function TradeTicket({
  isOpen,
  onClose,
  game,
  selectedTeamIndex,
  cashBalance,
  onTradeSuccess,
}: TradeTicketProps) {
  const [mode, setMode] = useState<TradeMode>('BUY')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [quote, setQuote] = useState<BuyQuote | SellQuote | null>(null)
  const [isQuoting, setIsQuoting] = useState(false)
  
  const selectedTeam = selectedTeamIndex === 0 ? game.team1 : game.team2
  const tokenId = selectedTeam.tokenId || ''
  const market = game.markets[0]
  
  // Use the trade hook
  const {
    isReady,
    isLoading,
    state,
    error: tradeError,
    hasUserCreds,
    executeTrade,
    executeSell,
    enableTrading,
    reset: resetTrade,
  } = usePolymarketTrade({
    market: market as any,
    onSuccess: () => {
      onTradeSuccess?.()
      onClose()
    },
    onError: (err) => {
      setError(err)
    },
  })
  
  // Get user's position for this token
  const position = useMemo(() => getPosition(tokenId), [tokenId])
  const sharesHeld = position?.sharesHeld || 0
  
  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setAmount('')
      setError(null)
      setQuote(null)
      setMode('BUY')
    }
  }, [isOpen])
  
  // Fetch quote when amount changes (debounced)
  useEffect(() => {
    if (!isOpen || !tokenId || !amount) {
      setQuote(null)
      return
    }
    
    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      setQuote(null)
      return
    }
    
    const timer = setTimeout(async () => {
      setIsQuoting(true)
      setError(null)
      
      try {
        const orderbook = await fetchOrderbook(tokenId)
        const validation = validateOrderbook(orderbook)
        
        if (!validation.valid) {
          setError(validation.issues.join('. '))
          setQuote(null)
          return
        }
        
        if (mode === 'BUY') {
          const buyQuote = getBuyQuote(orderbook, amountNum)
          setQuote(buyQuote)
          if (!buyQuote.canFill) {
            setError(buyQuote.error || 'Cannot fill order')
          }
        } else {
          const sellQuote = getSellQuote(orderbook, amountNum)
          setQuote(sellQuote)
          if (!sellQuote.canFill) {
            setError(sellQuote.error || 'Cannot fill order')
          }
        }
      } catch (err) {
        console.error('Quote error:', err)
        setError('Failed to get quote')
      } finally {
        setIsQuoting(false)
      }
    }, 300) // 300ms debounce
    
    return () => clearTimeout(timer)
  }, [isOpen, tokenId, amount, mode])
  
  const handleAmountChange = (value: string) => {
    // Only allow numbers and decimals
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setAmount(value)
      setError(null)
    }
  }
  
  const handleBuyChip = (chipAmount: number) => {
    setAmount(chipAmount.toString())
  }
  
  const handleSellChip = (percent: number) => {
    if (sharesHeld > 0) {
      const shares = sharesHeld * (percent / 100)
      setAmount(shares.toFixed(2))
    }
  }
  
  const handleTrade = useCallback(async () => {
    if (!tokenId || !quote || !quote.canFill) return
    
    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) return
    
    // Validate cash for buy
    if (mode === 'BUY' && amountNum > cashBalance) {
      setError('Insufficient balance')
      return
    }
    
    // Validate shares for sell
    if (mode === 'SELL' && amountNum > sharesHeld) {
      setError('Insufficient shares')
      return
    }
    
    setError(null)
    
    try {
      if (mode === 'BUY') {
        // Map team outcome to YES/NO
        const outcome = selectedTeamIndex === 0 ? 'YES' : 'NO'
        await executeTrade(amount, outcome as 'YES' | 'NO')
      } else {
        const sellPrice = getLimitPrice('SELL', quote.worstFillPrice)
        const outcome = selectedTeamIndex === 0 ? 'YES' : 'NO'
        await executeSell(tokenId, amountNum, sellPrice, outcome as 'YES' | 'NO')
      }
    } catch (err) {
      console.error('Trade error:', err)
      setError(err instanceof Error ? err.message : 'Trade failed')
    }
  }, [tokenId, quote, amount, mode, cashBalance, sharesHeld, selectedTeamIndex, executeTrade, executeSell])
  
  if (!isOpen) return null
  
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end justify-center">
      <div className="w-full max-w-lg bg-[#0a0a0b] rounded-t-3xl overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-white/[0.08]">
          <button 
            onClick={onClose}
            className="p-2 -ml-2 rounded-full hover:bg-white/[0.05]"
          >
            <X className="w-5 h-5 text-white/60" />
          </button>
          
          <div className="flex items-center gap-2">
            <span className="text-white/60 text-sm">{game.league}</span>
            <span className="text-white/30">•</span>
            <span className="text-white text-sm font-medium">{game.shortTitle}</span>
          </div>
          
          <div className="text-green-400 font-semibold text-sm">
            ${cashBalance.toFixed(2)}
          </div>
        </div>
        
        {/* Selected Team Pill */}
        <div className="px-4 py-3">
          <div 
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full"
            style={{ backgroundColor: `${selectedTeam.color}20` }}
          >
            <div 
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: selectedTeam.color }}
            />
            <span className="text-white font-medium text-sm">{selectedTeam.name}</span>
          </div>
        </div>
        
        {/* Buy/Sell Toggle */}
        <div className="px-4 pb-4">
          <div className="flex gap-1 p-1 bg-white/[0.05] rounded-xl">
            <button
              onClick={() => { setMode('BUY'); setAmount(''); setError(null) }}
              className={`flex-1 py-2.5 rounded-lg font-semibold transition-all ${
                mode === 'BUY'
                  ? 'bg-green-500 text-white'
                  : 'text-white/50 hover:text-white/70'
              }`}
            >
              Buy
            </button>
            <button
              onClick={() => { setMode('SELL'); setAmount(''); setError(null) }}
              disabled={sharesHeld <= 0}
              className={`flex-1 py-2.5 rounded-lg font-semibold transition-all ${
                mode === 'SELL'
                  ? 'bg-orange-500 text-white'
                  : sharesHeld > 0
                    ? 'text-white/50 hover:text-white/70'
                    : 'text-white/20 cursor-not-allowed'
              }`}
            >
              Sell
            </button>
          </div>
        </div>
        
        {/* Amount Input */}
        <div className="px-4 pb-4">
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-white/40 text-sm">
                {mode === 'BUY' ? 'Amount' : 'Shares to Sell'}
              </span>
              {mode === 'BUY' ? (
                <span className="text-white/40 text-sm">
                  Max: ${cashBalance.toFixed(2)}
                </span>
              ) : (
                <span className="text-white/40 text-sm">
                  Position: {sharesHeld.toFixed(2)} shares
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <span className="text-white/40 text-3xl">
                {mode === 'BUY' ? '$' : ''}
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="0"
                className="flex-1 bg-transparent text-white text-4xl font-bold outline-none placeholder:text-white/20"
              />
              {mode === 'SELL' && (
                <span className="text-white/40 text-lg">shares</span>
              )}
            </div>
            
            {/* Quick Chips */}
            <div className="flex gap-2 mt-4">
              {mode === 'BUY' ? (
                BUY_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => handleBuyChip(chip)}
                    disabled={chip > cashBalance}
                    className="flex-1 py-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] text-white/70 text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    ${chip}
                  </button>
                ))
              ) : (
                SELL_CHIPS.map((pct) => (
                  <button
                    key={pct}
                    onClick={() => handleSellChip(pct)}
                    disabled={sharesHeld <= 0}
                    className="flex-1 py-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] text-white/70 text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {pct === 100 ? 'Max' : `${pct}%`}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
        
        {/* Quote Display */}
        {quote && amount && parseFloat(amount) > 0 && (
          <div className="px-4 pb-4">
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-white/50">Est. Price</span>
                <span className="text-white font-medium">
                  {isQuoting ? '...' : formatPriceCents(quote.estAvgPrice)}
                </span>
              </div>
              
              {mode === 'BUY' && 'estShares' in quote && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">Est. Shares</span>
                    <span className="text-white font-medium">
                      {quote.estShares.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/50">Payout if Win</span>
                    <span className="text-green-400 font-medium">
                      ${quote.estShares.toFixed(2)}
                    </span>
                  </div>
                </>
              )}
              
              {mode === 'SELL' && 'estProceeds' in quote && (
                <div className="flex justify-between text-sm">
                  <span className="text-white/50">Est. Proceeds</span>
                  <span className="text-white font-medium">
                    ${quote.estProceeds.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Position Info for SELL mode */}
        {mode === 'SELL' && position && position.sharesHeld > 0 && (
          <div className="px-4 pb-4">
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-white/50">Avg Entry</span>
                <span className="text-white font-medium">
                  {formatPriceCents(position.avgEntryPrice)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/50">Mark Price</span>
                <span className="text-white font-medium">
                  {formatPriceCents(position.markPrice)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/50">Unrealized P&L</span>
                <span className={formatPnl(position.unrealizedPnl, position.unrealizedPnlPercent).color}>
                  {formatPnl(position.unrealizedPnl, position.unrealizedPnlPercent).display}
                </span>
              </div>
            </div>
          </div>
        )}
        
        {/* Error Display */}
        {error && (
          <div className="px-4 pb-4">
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span className="text-red-400 text-sm">{error}</span>
            </div>
          </div>
        )}
        
        {/* Trade Button */}
        <div className="px-4 pb-8">
          <button
            onClick={handleTrade}
            disabled={
              isLoading || 
              isQuoting || 
              !amount || 
              parseFloat(amount) <= 0 ||
              !quote?.canFill ||
              !!error
            }
            className={`w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2 ${
              mode === 'BUY'
                ? 'bg-green-500 hover:bg-green-600 disabled:bg-green-500/30'
                : 'bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/30'
            } text-white disabled:cursor-not-allowed`}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                {mode === 'BUY' ? (
                  <TrendingUp className="w-5 h-5" />
                ) : (
                  <TrendingDown className="w-5 h-5" />
                )}
                {mode} {selectedTeam.abbreviation}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
