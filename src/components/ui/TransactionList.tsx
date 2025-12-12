'use client'

import { useState, useEffect } from 'react'
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
  ArrowLeftRight, Zap, Globe, Repeat, Plus, ChevronDown
} from 'lucide-react'

// Ostium logo URL
const OSTIUM_LOGO = 'https://media.licdn.com/dms/image/v2/D4E0BAQEvzvW_jYImMw/company-logo_200_200/company-logo_200_200/0/1729111585394/ostium_labs_logo?e=2147483647&v=beta&t=QjJtNudNDTTZHEPlshMDMhku-BkYdLJU2RPFlRIR62M'

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

export function TransactionList({ address, limit = 5, crossChain = true }: TransactionListProps) {
  const { data: transactions, isLoading, isError, refetch } = useTransactionHistory(address, { crossChain })
  const [displayCount, setDisplayCount] = useState(limit)

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

  const displayedTxs = transactions.slice(0, displayCount)
  const hasMore = transactions.length > displayCount

  const showMore = () => {
    setDisplayCount(prev => Math.min(prev + 5, transactions.length))
  }

  return (
    <div className="space-y-2">
      {displayedTxs.map((tx) => (
        <TransactionRow key={tx.hash} tx={tx} userAddress={address} />
      ))}

      {hasMore && (
        <button
          onClick={showMore}
          className="w-full flex items-center justify-center gap-2 py-3 text-[#ef4444] text-sm hover:text-[#dc2626] transition-colors"
        >
          <Plus className="w-4 h-4" />
          Show more ({transactions.length - displayCount} remaining)
        </button>
      )}
    </div>
  )
}

function TransactionRow({ tx, userAddress }: { tx: Transaction; userAddress: string }) {
  const [tradeDetails, setTradeDetails] = useState<OstiumTradeDetails | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  
  const isReceive = tx.type === 'receive'
  const isSwap = tx.type === 'swap'
  const isBridge = tx.type === 'bridge'
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
