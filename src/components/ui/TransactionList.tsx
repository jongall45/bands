'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  useTransactionHistory,
  formatTxAmount,
  formatRelativeTime,
  shortenAddress,
  type Transaction
} from '@/hooks/useTransactionHistory'
import { CHAIN_CONFIG } from '@/hooks/usePortfolio'
import {
  ArrowUpRight, ArrowDownLeft, RefreshCw, ExternalLink,
  XCircle, Loader2, PiggyBank, TrendingUp,
  ArrowLeftRight, Zap, Globe, Repeat, Plus, ChevronDown, ArrowRight
} from 'lucide-react'
import { getSwapByHash } from '@/lib/swapHistory'

// Extended transaction type that can include paired bridge info
interface DisplayTransaction extends Transaction {
  // For grouped bridge swaps
  bridgePair?: {
    fromToken: { symbol: string; amount: string; logo: string; chainId: number; chainName: string; chainLogo: string }
    toToken: { symbol: string; amount: string; logo: string; chainId: number; chainName: string; chainLogo: string }
  }
  isGroupedSwap?: boolean
}

// Ostium logo URL
const OSTIUM_LOGO = 'https://media.licdn.com/dms/image/v2/D4E0BAQEvzvW_jYImMw/company-logo_200_200/company-logo_200_200/0/1729111585394/ostium_labs_logo?e=2147483647&v=beta&t=QjJtNudNDTTZHEPlshMDMhku-BkYdLJU2RPFlRIR62M'

// Relay logo URL
const RELAY_LOGO = 'https://pbs.twimg.com/profile_images/1960334543052816384/ejODKCzq_400x400.jpg'

// Ostium trade details interface
interface OstiumTradeDetails {
  type: 'open' | 'close' | 'unknown'
  pair: string | null
  pairIndex: number | null
  direction: 'long' | 'short' | null
  collateral: string | null
  leverage: number | null
  positionSize: string | null
}

// Cache for Ostium trade details
const tradeDetailsCache = new Map<string, OstiumTradeDetails | null>()

// Fetch Ostium trade details from our API (uses Ostium subgraph)
async function fetchOstiumTradeDetails(
  hash: string, 
  address: string, 
  timestamp: number
): Promise<OstiumTradeDetails | null> {
  const cacheKey = `${hash}-${address}`
  if (tradeDetailsCache.has(cacheKey)) {
    return tradeDetailsCache.get(cacheKey) || null
  }
  
  try {
    const params = new URLSearchParams({
      hash,
      address,
      timestamp: String(timestamp),
    })
    const response = await fetch(`/api/ostium/trade-details?${params}`)
    if (!response.ok) {
      tradeDetailsCache.set(cacheKey, null)
      return null
    }
    const data = await response.json()
    // Only cache if we got valid data
    if (data.pair || data.direction) {
      tradeDetailsCache.set(cacheKey, data)
    }
    return data
  } catch (error) {
    console.error('[Ostium] Failed to fetch trade details:', error)
    tradeDetailsCache.set(cacheKey, null)
    return null
  }
}

interface TransactionListProps {
  address: string | undefined
  limit?: number
  crossChain?: boolean
}

// Chain info helpers (outside component to avoid recreation)
const CHAIN_LOGOS: Record<number, string> = {
  1: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
  8453: 'https://assets.coingecko.com/asset_platforms/images/131/small/base.jpeg',
  42161: 'https://assets.coingecko.com/coins/images/16547/small/photo_2023-03-29_21.47.00.jpeg',
  10: 'https://assets.coingecko.com/coins/images/25244/small/Optimism.png',
  137: 'https://assets.coingecko.com/coins/images/4713/small/matic-token-icon.png',
}
const CHAIN_NAMES: Record<number, string> = {
  1: 'ETH', 8453: 'Base', 42161: 'ARB', 10: 'OP', 137: 'MATIC'
}

export function TransactionList({ address, limit = 5, crossChain = true }: TransactionListProps) {
  const { data: transactions, isLoading, isError, refetch } = useTransactionHistory(address, { crossChain })
  const [displayCount, setDisplayCount] = useState(limit)
  

  // Group bridge send/receive pairs into swap views - MUST be before any early returns
  const groupedTransactions = useMemo(() => {
    if (!transactions || transactions.length === 0) return []
    
    const result: DisplayTransaction[] = []
    const usedHashes = new Set<string>()
    
    // Sort by timestamp descending
    const sorted = [...transactions].sort((a, b) => b.timestamp - a.timestamp)
    
    for (const tx of sorted) {
      if (usedHashes.has(tx.hash)) continue
      
      // Check if this is a Bridge send (outgoing) - more flexible matching
      const isBridgeSend = (
        (tx.appCategory === 'Bridge' && (tx.direction === 'out' || tx.type === 'send')) ||
        // Also match if it's a send to a Relay address
        (tx.type === 'send' && tx.appName === 'Relay')
      )
      
      if (isBridgeSend) {
        // Look for a matching receive within 10 minutes
        const sendTime = tx.timestamp
        const sendTokenSymbol = tx.token?.symbol || tx.tokenSymbol || ''
        
        const matchingReceive = sorted.find(other => {
          if (usedHashes.has(other.hash)) return false
          if (other.hash === tx.hash) return false
          
          // Check for incoming bridge transaction
          const isReceive = (
            (other.appCategory === 'Bridge' && (other.direction === 'in' || other.type === 'receive')) ||
            // Also match call type from Relay
            (other.appName === 'Relay' && other.type === 'app_interaction' && other.direction === 'in')
          )
          
          if (!isReceive) return false
          
          // Must be different token OR different chain (cross-chain swap)
          const otherTokenSymbol = other.token?.symbol || other.tokenSymbol || ''
          const isDifferentToken = otherTokenSymbol && sendTokenSymbol && otherTokenSymbol !== sendTokenSymbol
          const isDifferentChain = other.chainId !== tx.chainId
          
          if (!isDifferentToken && !isDifferentChain) return false
          
          // Within 10 minute window
          const timeDiff = Math.abs(other.timestamp - sendTime)
          return timeDiff < 10 * 60 * 1000 // 10 minutes in ms
        })
        
        if (matchingReceive) {
          // Create grouped swap transaction
          usedHashes.add(tx.hash)
          usedHashes.add(matchingReceive.hash)
          
          const sendToken = tx.token || (tx as any).bridgeToken
          const receiveToken = matchingReceive.token || (matchingReceive as any).bridgeToken
          
          const sendChainId = tx.chainId || 8453
          const receiveChainId = matchingReceive.chainId || 8453
          
          const groupedTx: DisplayTransaction = {
            ...tx,
            isGroupedSwap: true,
            bridgePair: {
              fromToken: {
                symbol: sendToken?.symbol || tx.tokenSymbol || 'Unknown',
                amount: sendToken?.amount || tx.tokenAmount || '0',
                logo: sendToken?.logoURI || sendToken?.logo || 
                  (sendToken?.symbol === 'USDC' ? 'https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png' :
                   sendToken?.symbol === 'ETH' ? 'https://assets.coingecko.com/coins/images/279/small/ethereum.png' : ''),
                chainId: sendChainId,
                chainName: CHAIN_NAMES[sendChainId] || 'Chain',
                chainLogo: CHAIN_LOGOS[sendChainId] || '',
              },
              toToken: {
                symbol: receiveToken?.symbol || matchingReceive.tokenSymbol || 'Unknown',
                amount: receiveToken?.amount || matchingReceive.tokenAmount || '0',
                logo: receiveToken?.logoURI || receiveToken?.logo ||
                  (receiveToken?.symbol === 'USDC' ? 'https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png' :
                   receiveToken?.symbol === 'ETH' ? 'https://assets.coingecko.com/coins/images/279/small/ethereum.png' : ''),
                chainId: receiveChainId,
                chainName: CHAIN_NAMES[receiveChainId] || 'Chain',
                chainLogo: CHAIN_LOGOS[receiveChainId] || '',
              }
            }
          }
          result.push(groupedTx)
        } else {
          // No matching receive found, show as individual
          usedHashes.add(tx.hash)
          result.push(tx as DisplayTransaction)
        }
      } else {
        // Not a bridge send, add as-is
        usedHashes.add(tx.hash)
        result.push(tx as DisplayTransaction)
      }
    }
    
    return result
  }, [transactions])

  // Early returns AFTER hooks
  if (!address) {
    return <EmptyState message="Connect wallet to see activity" />
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-gray-500 animate-spin mb-3" />
        <p className="text-gray-500 text-sm">Loading transactions...</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-gray-500 text-sm mb-3">Failed to load transactions</p>
        <button
          onClick={() => refetch()}
          className="text-[#ef4444] text-sm hover:text-[#dc2626] flex items-center gap-1"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    )
  }

  if (!transactions || transactions.length === 0) {
    return <EmptyState message="No transactions yet" submessage="Send or receive to get started" />
  }

  const displayedTxs = groupedTransactions.slice(0, displayCount)
  const hasMore = groupedTransactions.length > displayCount

  const showMore = () => {
    setDisplayCount(prev => Math.min(prev + 5, groupedTransactions.length))
  }

  return (
    <div className="space-y-2">
      {displayedTxs.map((tx) => (
        <TransactionRow key={tx.hash} tx={tx} userAddress={address!} />
      ))}

      {hasMore && (
        <button
          onClick={showMore}
          className="w-full flex items-center justify-center gap-2 py-3 text-[#ef4444] text-sm hover:text-[#dc2626] transition-colors"
        >
          <Plus className="w-4 h-4" />
          Show more ({groupedTransactions.length - displayCount} remaining)
        </button>
      )}
    </div>
  )
}

function TransactionRow({ tx, userAddress }: { tx: DisplayTransaction; userAddress: string }) {
  const [tradeDetails, setTradeDetails] = useState<OstiumTradeDetails | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  
  const isReceive = tx.type === 'receive'
  const isSwap = tx.type === 'swap'
  const isBridge = tx.type === 'bridge'
  const isGroupedSwap = tx.isGroupedSwap && tx.bridgePair
  const isAppInteraction = tx.type === 'app_interaction'
  const isVaultDeposit = tx.type === 'vault_deposit'
  const isVaultWithdraw = tx.type === 'vault_withdraw'
  const isVaultTx = isVaultDeposit || isVaultWithdraw
  const isOstium = isAppInteraction && tx.appName === 'Ostium'

  // Fetch Ostium trade details from subgraph
  useEffect(() => {
    if (isOstium && tx.hash && userAddress && !tradeDetails && !loadingDetails) {
      setLoadingDetails(true)
      fetchOstiumTradeDetails(tx.hash, userAddress, tx.timestamp).then(details => {
        setTradeDetails(details)
        setLoadingDetails(false)
      })
    }
  }, [isOstium, tx.hash, userAddress, tx.timestamp, tradeDetails, loadingDetails])

  // Use pre-formatted amount from API if available, otherwise format from value
  const amount = tx.tokenAmount || formatTxAmount(tx.value, tx.tokenDecimals)
  const timeAgo = formatRelativeTime(tx.timestamp)

  // Format USD value
  const valueUsd = tx.valueUsd && tx.valueUsd > 0
    ? tx.valueUsd < 0.01 ? '< $0.01' : `$${tx.valueUsd.toFixed(2)}`
    : null

  // Determine counterparty
  const counterparty = isReceive || isVaultWithdraw ? tx.from : tx.to

  // Chain info
  const chainId = tx.chainId || 8453
  const chainConfig = CHAIN_CONFIG[chainId] || CHAIN_CONFIG[8453]
  const explorerUrl = tx.explorerUrl || `${chainConfig.explorer}/tx/${tx.hash}`

  // Get display info based on transaction type
  const getDisplayInfo = () => {
    // Swap transaction
    if (isSwap && tx.swapFromToken && tx.swapToToken) {
      return {
        label: 'Swapped',
        sublabel: `${tx.swapFromToken.symbol} → ${tx.swapToToken.symbol}`,
        icon: <Repeat className="w-5 h-5 text-purple-400" />,
        iconBg: 'bg-purple-500/10',
        amountColor: 'text-white',
        amountPrefix: '',
        customAmount: (
          <div className="flex items-center gap-1">
            <span className="text-white/60">-{tx.swapFromToken.amount}</span>
            <ArrowLeftRight className="w-3 h-3 text-white/40" />
            <span className="text-green-400">+{tx.swapToToken.amount}</span>
          </div>
        ),
      }
    }

    // Bridge transaction
    if (isBridge) {
      return {
        label: 'Bridged',
        sublabel: tx.appName || 'Cross-chain transfer',
        icon: <Globe className="w-5 h-5 text-blue-400" />,
        iconBg: 'bg-blue-500/10',
        amountColor: 'text-white',
        amountPrefix: '',
      }
    }

    // App interaction (including Perps trades)
    if (isAppInteraction && tx.appName) {
      // Special handling for Perps/Trading apps (like Ostium)
      if (tx.appCategory === 'Perps') {
        // Use trade details if available, otherwise fall back to direction-based detection
        const isOpening = tradeDetails?.type === 'open' || 
          (!tradeDetails && (tx.direction === 'out' || (tx as any).to?.toLowerCase().includes('ccd5891')))
        const isClosing = tradeDetails?.type === 'close' || 
          (!tradeDetails && !isOpening)
        
        // Build sublabel with trade details
        let sublabel = isOpening ? 'Open Position' : 'Close Position'
        if (tradeDetails) {
          const parts: string[] = []
          if (tradeDetails.pair) {
            // Extract just the asset symbol (e.g., "BTC" from "BTC-USD")
            const asset = tradeDetails.pair.split('-')[0]
            parts.push(asset)
          }
          if (tradeDetails.direction) {
            parts.push(tradeDetails.direction.toUpperCase())
          }
          if (parts.length > 0) {
            sublabel = parts.join(' · ')
          }
        }
        
        // Build display amount from trade details or fallback (just the collateral, no leverage)
        let displayAmount: string | null = null
        if (tradeDetails?.collateral) {
          displayAmount = `$${tradeDetails.collateral}`
        } else if (tx.valueUsd && tx.valueUsd > 0.01) {
          displayAmount = `$${tx.valueUsd.toFixed(2)}`
        }
        
        // Direction indicator colors
        const isLong = tradeDetails?.direction === 'long'
        const isShort = tradeDetails?.direction === 'short'
        const directionColor = isLong ? 'text-green-400' : isShort ? 'text-red-400' : 'text-white'
        
        return {
          label: tx.appName,
          sublabel: loadingDetails ? 'Loading...' : sublabel,
          icon: (
            <img 
              src={OSTIUM_LOGO} 
              alt="Ostium" 
              className="w-5 h-5 rounded-full"
              onError={(e) => {
                // Fallback to trending icon if logo fails to load
                (e.target as HTMLImageElement).style.display = 'none'
              }}
            />
          ),
          iconBg: isLong ? 'bg-green-500/10' : isShort ? 'bg-red-500/10' : 'bg-orange-500/10',
          amountColor: directionColor,
          amountPrefix: isOpening ? '-' : '+',
          // Show custom amount with trade details
          customAmount: displayAmount ? (
            <div className="text-right">
              <div className={isClosing ? 'text-green-400' : 'text-white'}>
                {isClosing ? '+' : '-'}{displayAmount} USDC
              </div>
              {(tradeDetails?.leverage || tradeDetails?.direction) && (
                <div className="text-[10px] text-white/40">
                  {tradeDetails?.leverage && `${tradeDetails.leverage}x `}
                  {tradeDetails?.direction && (
                    <span className={isLong ? 'text-green-400/70' : 'text-red-400/70'}>
                      {tradeDetails.direction.toUpperCase()}
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <span className="text-white/40 text-xs">
              {loadingDetails ? '...' : (isOpening ? 'Open' : 'Close')}
            </span>
          ),
        }
      }
      // Special handling for DEX
      if (tx.appCategory === 'DEX') {
        return {
          label: tx.appName,
          sublabel: 'Trade',
          icon: <Repeat className="w-5 h-5 text-purple-400" />,
          iconBg: 'bg-purple-500/10',
          amountColor: 'text-white',
          amountPrefix: '',
        }
      }
      // Special handling for Bridge (Relay, Socket, Across, etc.)
      if (tx.appCategory === 'Bridge' || isGroupedSwap) {
        // Determine if this is Relay specifically
        const isRelay = tx.appName === 'Relay'
        
        // Format amount helper
        const formatBridgeAmount = (amt: string) => {
          const num = parseFloat(amt)
          if (isNaN(num) || num === 0) return '0'
          if (num < 0.0001) return num.toFixed(6)
          if (num < 1) return num.toFixed(4)
          if (num < 1000) return num.toFixed(2)
          return num.toLocaleString(undefined, { maximumFractionDigits: 2 })
        }
        
        // Token with chain badge component
        const TokenWithChainBadge = ({ 
          tokenImg, tokenAlt, chainImg, chainAlt, size = 'sm' 
        }: { 
          tokenImg: string; tokenAlt: string; chainImg: string; chainAlt: string; size?: 'sm' | 'md' | 'lg'
        }) => (
          <div className={`relative ${size === 'sm' ? 'w-5 h-5' : size === 'md' ? 'w-6 h-6' : 'w-7 h-7'} flex-shrink-0`}>
            <img 
              src={tokenImg} 
              alt={tokenAlt} 
              className={`${size === 'sm' ? 'w-5 h-5' : size === 'md' ? 'w-6 h-6' : 'w-7 h-7'} rounded-full`}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
            {chainImg && (
              <img 
                src={chainImg} 
                alt={chainAlt} 
                className={`absolute ${size === 'sm' ? '-bottom-0.5 -right-0.5 w-2.5 h-2.5' : '-bottom-0.5 -right-0.5 w-3 h-3'} rounded-full border border-black/50`}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            )}
          </div>
        )
        
        // GROUPED SWAP: Show both sides of the cross-chain swap
        if (isGroupedSwap && tx.bridgePair) {
          const { fromToken, toToken } = tx.bridgePair
          const fromAmount = formatBridgeAmount(fromToken.amount)
          const toAmount = formatBridgeAmount(toToken.amount)
          
          return {
            label: tx.appName || 'Bridge',
            sublabel: `${fromToken.chainName} → ${toToken.chainName}`,
            icon: isRelay ? (
              <img src={RELAY_LOGO} alt="Relay" className="w-5 h-5 rounded-full object-cover" />
            ) : <Globe className="w-5 h-5 text-blue-400" />,
            iconBg: isRelay ? 'bg-[#7B3FE4]/20' : 'bg-blue-500/10',
            amountColor: 'text-white',
            amountPrefix: '',
            customAmount: (
              <div className="flex flex-col items-end gap-0.5">
                {/* From token - what you sold */}
                <div className="flex items-center gap-1">
                  <span className="text-white">-{fromAmount}</span>
                  <TokenWithChainBadge 
                    tokenImg={fromToken.logo} 
                    tokenAlt={fromToken.symbol}
                    chainImg={fromToken.chainLogo}
                    chainAlt={fromToken.chainName}
                    size="sm"
                  />
                </div>
                {/* To token - what you received */}
                <div className="flex items-center gap-1 text-[11px]">
                  <span className="text-green-400">+{toAmount}</span>
                  <TokenWithChainBadge 
                    tokenImg={toToken.logo} 
                    tokenAlt={toToken.symbol}
                    chainImg={toToken.chainLogo}
                    chainAlt={toToken.chainName}
                    size="sm"
                  />
                </div>
              </div>
            ),
          }
        }
        
        // SINGLE BRIDGE TX: Show one side only
        // Get token info - prefer regular token over bridgeToken for better accuracy
        const tokenInfo = tx.token || (tx as any).bridgeToken
        const tokenSymbol = tokenInfo?.symbol || tx.tokenSymbol || 'Unknown'
        const tokenAmount = tokenInfo?.amount || tx.tokenAmount || '0'
        const tokenLogo = tokenInfo?.logoURI || tokenInfo?.logo || 
          (tokenSymbol === 'USDC' ? 'https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png' :
           tokenSymbol === 'ETH' ? 'https://assets.coingecko.com/coins/images/279/small/ethereum.png' : '')
        
        // Chain logos
        const chainLogos: Record<number, string> = {
          1: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
          8453: 'https://raw.githubusercontent.com/base-org/brand-kit/main/logo/symbol/Base_Symbol_Blue.png',
          42161: 'https://assets.coingecko.com/coins/images/16547/small/photo_2023-03-29_21.47.00.jpeg',
          10: 'https://assets.coingecko.com/coins/images/25244/small/Optimism.png',
          137: 'https://assets.coingecko.com/coins/images/4713/small/matic-token-icon.png',
        }
        const chainNames: Record<number, string> = {
          1: 'ETH', 8453: 'Base', 42161: 'ARB', 10: 'OP', 137: 'MATIC'
        }
        const txChainId = tx.chainId || 8453
        const chainLogo = chainLogos[txChainId] || ''
        const chainName = chainNames[txChainId] || 'Chain'
        
        const displayAmount = formatBridgeAmount(tokenAmount)
        const numAmount = parseFloat(tokenAmount)
        
        // Determine if this is sending (out) or receiving (in)
        const isSending = tx.direction === 'out' || tx.type === 'send'
        
        // For sends, show what asset they're getting (likely on another chain)
        // Relay cross-chain swaps: USDC on ARB -> ETH on Base
        const destChain = txChainId === 42161 ? 'Base' : txChainId === 8453 ? 'ARB' : 'ETH'
        const destToken = tokenSymbol === 'USDC' ? 'ETH' : 'USDC'
        const destChainLogo = txChainId === 42161 
          ? CHAIN_LOGOS[8453] // ARB -> Base
          : txChainId === 8453 
            ? CHAIN_LOGOS[42161] // Base -> ARB
            : CHAIN_LOGOS[1]
        const destTokenLogo = destToken === 'ETH' 
          ? 'https://assets.coingecko.com/coins/images/279/small/ethereum.png'
          : 'https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png'
        
        
        // Look up swap history for exact amounts on both sides
        const swapRecord = tx.hash ? getSwapByHash(tx.hash) : null
        
        // If we have swap history, show both sides of the trade
        if (swapRecord) {
          const fromToken = swapRecord.fromToken
          const toToken = swapRecord.toToken
          const fromChainLogo = CHAIN_LOGOS[fromToken.chainId] || ''
          const toChainLogo = CHAIN_LOGOS[toToken.chainId] || ''
          const fromChainName = chainNames[fromToken.chainId] || 'Chain'
          const toChainName = chainNames[toToken.chainId] || 'Chain'
          
          return {
            label: tx.appName || 'Relay',
            sublabel: 'Cross-chain Swap',
            icon: isRelay ? (
              <img src={RELAY_LOGO} alt="Relay" className="w-5 h-5 rounded-full object-cover" />
            ) : <Globe className="w-5 h-5 text-blue-400" />,
            iconBg: isRelay ? 'bg-[#7B3FE4]/20' : 'bg-blue-500/10',
            amountColor: 'text-green-400',
            amountPrefix: '+',
            customAmount: (
              <div className="flex flex-col items-end gap-0.5">
                {/* What you received (green, on top) */}
                <div className="flex items-center gap-1">
                  <span className="text-green-400">
                    +{parseFloat(toToken.amount).toFixed(toToken.symbol === 'USDC' ? 2 : 6)}
                  </span>
                  <TokenWithChainBadge 
                    tokenImg={toToken.logoURI || destTokenLogo} 
                    tokenAlt={toToken.symbol}
                    chainImg={toChainLogo}
                    chainAlt={toChainName}
                    size="sm"
                  />
                </div>
                {/* What you sent (white/gray, below) */}
                <div className="flex items-center gap-1 text-[11px]">
                  <span className="text-white/70">
                    -{parseFloat(fromToken.amount).toFixed(fromToken.symbol === 'USDC' ? 2 : 6)}
                  </span>
                  <TokenWithChainBadge 
                    tokenImg={fromToken.logoURI || tokenLogo} 
                    tokenAlt={fromToken.symbol}
                    chainImg={fromChainLogo}
                    chainAlt={fromChainName}
                    size="sm"
                  />
                </div>
              </div>
            ),
          }
        }
        
        // Fallback: No swap history, show what Dune gave us
        return {
          label: tx.appName || 'Bridge',
          sublabel: isSending ? 'Cross-chain Swap' : `Bridge · ${chainName}`,
          icon: isRelay ? (
            <img src={RELAY_LOGO} alt="Relay" className="w-5 h-5 rounded-full object-cover" />
          ) : <Globe className="w-5 h-5 text-blue-400" />,
          iconBg: isRelay ? 'bg-[#7B3FE4]/20' : 'bg-blue-500/10',
          amountColor: isSending ? 'text-white' : 'text-green-400',
          amountPrefix: isSending ? '-' : '+',
          customAmount: numAmount > 0 ? (
            <div className="flex flex-col items-end gap-0.5">
              {/* What you sent/received */}
              <div className="flex items-center gap-1">
                <span className={isSending ? 'text-white' : 'text-green-400'}>
                  {isSending ? '-' : '+'}{displayAmount}
                </span>
                <TokenWithChainBadge 
                  tokenImg={tokenLogo} 
                  tokenAlt={tokenSymbol}
                  chainImg={chainLogo}
                  chainAlt={chainName}
                  size="sm"
                />
              </div>
              {/* What you're getting (for sends) - show destination token */}
              {isSending && (
                <div className="flex items-center gap-1 text-[11px]">
                  <span className="text-green-400">→</span>
                  <TokenWithChainBadge 
                    tokenImg={destTokenLogo} 
                    tokenAlt={destToken}
                    chainImg={destChainLogo}
                    chainAlt={destChain}
                    size="sm"
                  />
                  <span className="text-green-400">{destToken}</span>
                </div>
              )}
            </div>
          ) : undefined,
        }
      }
      // Default app interaction
      return {
        label: tx.appName,
        sublabel: tx.appCategory || 'App',
        icon: <Zap className="w-5 h-5 text-yellow-400" />,
        iconBg: 'bg-yellow-500/10',
        amountColor: 'text-white',
        amountPrefix: '-',
      }
    }

    // Generic contract interaction (without known app)
    if (tx.type === 'contract') {
      return {
        label: 'Contract',
        sublabel: `To ${shortenAddress(tx.to)}`,
        icon: <Zap className="w-5 h-5 text-gray-400" />,
        iconBg: 'bg-white/[0.05]',
        amountColor: 'text-white',
        amountPrefix: '-',
      }
    }

    // Vault deposit
    if (isVaultDeposit) {
      return {
        label: 'Deposited',
        sublabel: tx.vaultName || 'Morpho Vault',
        icon: <PiggyBank className="w-5 h-5 text-[#ef4444]" />,
        iconBg: 'bg-[#ef4444]/10',
        amountColor: 'text-white',
        amountPrefix: '-',
      }
    }

    // Vault withdraw
    if (isVaultWithdraw) {
      return {
        label: 'Withdrew',
        sublabel: tx.vaultName || 'Morpho Vault',
        icon: <PiggyBank className="w-5 h-5 text-green-400" />,
        iconBg: 'bg-green-500/10',
        amountColor: 'text-green-400',
        amountPrefix: '+',
      }
    }

    // Receive - show token logo
    if (isReceive) {
      const tokenLogo = tx.tokenLogoUri || `https://api.sim.dune.com/beta/token/logo/${chainId}/${tx.tokenAddress}`
      return {
        label: 'Received',
        sublabel: `From ${shortenAddress(counterparty)}`,
        icon: tx.tokenLogoUri ? (
          <img
            src={tokenLogo}
            alt={tx.tokenSymbol}
            className="w-5 h-5 rounded-full"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none'
              ;(e.target as HTMLImageElement).parentElement!.innerHTML = '<svg class="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"/></svg>'
            }}
          />
        ) : <ArrowDownLeft className="w-5 h-5 text-green-400" />,
        iconBg: 'bg-green-500/10',
        amountColor: 'text-green-400',
        amountPrefix: '+',
      }
    }

    // Default: Send - show token logo
    const tokenLogo = tx.tokenLogoUri || `https://api.sim.dune.com/beta/token/logo/${chainId}/${tx.tokenAddress}`
    return {
      label: 'Sent',
      sublabel: `To ${shortenAddress(counterparty)}`,
      icon: tx.tokenLogoUri ? (
        <img
          src={tokenLogo}
          alt={tx.tokenSymbol}
          className="w-5 h-5 rounded-full"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none'
            ;(e.target as HTMLImageElement).parentElement!.innerHTML = '<svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18"/></svg>'
          }}
        />
      ) : <ArrowUpRight className="w-5 h-5 text-gray-400" />,
      iconBg: 'bg-white/[0.05]',
      amountColor: 'text-white',
      amountPrefix: '-',
    }
  }

  const display = getDisplayInfo()

  return (
    <a
      href={explorerUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between p-3 bg-white/[0.02] hover:bg-white/[0.04] rounded-2xl transition-colors group"
    >
      <div className="flex items-center gap-3">
        {/* Icon with chain indicator */}
        <div className="relative">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${display.iconBg}`}>
            {display.icon}
          </div>
          {/* Chain badge */}
          {tx.chainId && tx.chainId !== 8453 && (
            <img
              src={chainConfig.logo}
              alt={chainConfig.name}
              className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border border-[#111]"
            />
          )}
        </div>

        {/* Details */}
        <div>
          <div className="flex items-center gap-2">
            <p className="text-white font-medium text-sm">
              {display.label}
            </p>
            {tx.status === 'failed' && (
              <XCircle className="w-3.5 h-3.5 text-red-400" />
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <p className="text-white/40 text-xs">
              {display.sublabel}
            </p>
            {/* Show APY for vault transactions */}
            {isVaultTx && tx.vaultApy && (
              <span className="flex items-center gap-0.5 text-green-400 text-xs">
                <TrendingUp className="w-3 h-3" />
                {tx.vaultApy.toFixed(2)}%
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Amount & Time */}
      <div className="text-right flex items-center gap-2">
        <div>
          {'customAmount' in display && display.customAmount ? (
            <div className="font-mono font-medium text-sm">
              {display.customAmount}
            </div>
          ) : (
            <p className={`font-mono font-medium text-sm ${display.amountColor}`}>
              {display.amountPrefix} {amount} {tx.tokenSymbol}
            </p>
          )}
          <p className="text-white/30 text-xs">
            {valueUsd && <span className="mr-1">{valueUsd}</span>}
            {timeAgo}
          </p>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-white/20 group-hover:text-white/40 transition-colors" />
      </div>
    </a>
  )
}

function EmptyState({ message, submessage }: { message: string; submessage?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-12 h-12 bg-white/[0.03] rounded-full flex items-center justify-center mb-4">
        <ArrowUpRight className="w-6 h-6 text-gray-600" strokeWidth={1.5} />
      </div>
      <p className="text-gray-400 text-sm">{message}</p>
      {submessage && (
        <p className="text-gray-600 text-xs mt-1">{submessage}</p>
      )}
    </div>
  )
}
