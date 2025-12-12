'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useWaitForTransactionReceipt } from 'wagmi'
import { useReadContract } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { formatUnits, parseUnits, isAddress, encodeFunctionData } from 'viem'
import { base, arbitrum, optimism, mainnet, polygon } from 'wagmi/chains'
import { useAuth } from '@/hooks/useAuth'
import { usePortfolio, formatUsdValue, formatTokenBalance, CHAIN_CONFIG, type PortfolioToken } from '@/hooks/usePortfolio'
import { USDC_ADDRESS, USDC_DECIMALS, ERC20_ABI } from '@/lib/wagmi'
import {
  ArrowUpRight, ArrowDownLeft, Copy, Check, LogOut,
  Send, RefreshCw, ExternalLink, Plus, QrCode, Shield, Wallet, ChevronDown, Coins
} from 'lucide-react'
import Link from 'next/link'
import { Modal } from '@/components/ui/Modal'
import { CardInner } from '@/components/ui/Card'
import { BottomNav } from '@/components/ui/BottomNav'
import { LogoInline } from '@/components/ui/Logo'
import { TransactionList } from '@/components/ui/TransactionList'
import { InstallPrompt } from '@/components/pwa/InstallPrompt'

// Supported chains for sending
const SEND_CHAINS = [
  { id: 8453, name: 'Base', logo: CHAIN_CONFIG[8453]?.logo },
  { id: 42161, name: 'Arbitrum', logo: CHAIN_CONFIG[42161]?.logo },
  { id: 10, name: 'Optimism', logo: CHAIN_CONFIG[10]?.logo },
  { id: 1, name: 'Ethereum', logo: CHAIN_CONFIG[1]?.logo },
  { id: 137, name: 'Polygon', logo: CHAIN_CONFIG[137]?.logo },
]

export default function Dashboard() {
  const { isAuthenticated, isConnected, address, isSmartWalletReady, logout, getClientForChain } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [copied, setCopied] = useState(false)
  const [showSend, setShowSend] = useState(false)
  const [showReceive, setShowReceive] = useState(false)
  const [sendTo, setSendTo] = useState('')
  const [sendAmount, setSendAmount] = useState('')
  const [addressError, setAddressError] = useState('')
  const [selectedChain, setSelectedChain] = useState(SEND_CHAINS[0])
  const [showChainSelect, setShowChainSelect] = useState(false)

  const [txHash, setTxHash] = useState<`0x${string}` | undefined>(undefined)
  const [txChainId, setTxChainId] = useState<number | undefined>(undefined)
  const [isSending, setIsSending] = useState(false)
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId: txChainId,
  })
  const [selectedToken, setSelectedToken] = useState<PortfolioToken | null>(null)
  const [showTokenSelect, setShowTokenSelect] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  // Cross-chain portfolio from Dune API
  const { data: portfolio, refetch: refetchPortfolio, isLoading: portfolioLoading } = usePortfolio(address)

  // Filter tokens by selected chain
  const tokensOnSelectedChain = portfolio?.tokens?.filter(t => t.chainId === selectedChain.id) || []

  // Update selected token when chain changes
  useEffect(() => {
    if (tokensOnSelectedChain.length > 0) {
      // Try to keep same token symbol if available on new chain
      const sameSymbol = selectedToken
        ? tokensOnSelectedChain.find(t => t.symbol === selectedToken.symbol)
        : null
      setSelectedToken(sameSymbol || tokensOnSelectedChain[0])
    } else {
      setSelectedToken(null)
    }
  }, [selectedChain.id, portfolio])

  // Fallback to on-chain USDC balance for Base
  const { data: usdcBalance, refetch: refetchBalance, isLoading: balanceLoading } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: base.id,
    query: {
      enabled: !!address,
      refetchInterval: 10000,
    },
  })

  useEffect(() => {
    if (!isAuthenticated) router.push('/')
  }, [isAuthenticated, router])

  useEffect(() => {
    if (isSuccess) {
      setShowSend(false)
      setSendTo('')
      setSendAmount('')
      refetchBalance()
      refetchPortfolio()
      // Immediately refresh transaction history
      queryClient.invalidateQueries({ queryKey: ['transaction-history'] })
    }
  }, [isSuccess, refetchBalance, refetchPortfolio, queryClient])

  // Use portfolio total if available, fallback to USDC balance
  const totalValue = portfolio?.totalValueUsd || 0
  const formattedBalance = totalValue > 0
    ? totalValue.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : usdcBalance
    ? parseFloat(formatUnits(usdcBalance, USDC_DECIMALS)).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : '0.00'

  const numericBalance = usdcBalance
    ? parseFloat(formatUnits(usdcBalance, USDC_DECIMALS))
    : 0

  // Refresh all balances
  const handleRefresh = useCallback(() => {
    refetchBalance()
    refetchPortfolio()
  }, [refetchBalance, refetchPortfolio])

  // Get unique chains in portfolio
  const portfolioChains = portfolio?.tokens
    ? [...new Set(portfolio.tokens.map(t => t.chainId))]
    : []

  const copyAddress = useCallback(() => {
    if (address) {
      navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [address])

  const validateAddress = (addr: string) => {
    if (!addr) {
      setAddressError('')
      return
    }
    if (!isAddress(addr)) {
      setAddressError('Invalid address format')
    } else {
      setAddressError('')
    }
  }

  const handleSend = async () => {
    if (!sendTo || !sendAmount || addressError || !address || !selectedToken) return
    if (!isAddress(sendTo)) {
      setAddressError('Invalid address format')
      return
    }

    setIsSending(true)
    setSendError(null)

    try {
      // Get smart wallet client for the target chain
      const chainConfig = {
        8453: base,
        42161: arbitrum,
        10: optimism,
        1: mainnet,
        137: polygon,
      }[selectedChain.id]

      if (!chainConfig) {
        throw new Error('Unsupported chain')
      }

      const smartClient = await getClientForChain({ id: chainConfig.id })
      if (!smartClient) {
        throw new Error('Smart wallet not available')
      }

      const decimals = selectedToken.decimals || 18
      const amount = parseUnits(sendAmount, decimals)

      // Check if it's native token (ETH)
      const isNative = selectedToken.address === '0x0000000000000000000000000000000000000000' ||
                       selectedToken.symbol === 'ETH' ||
                       selectedToken.address === 'native'

      let hash: `0x${string}`

      if (isNative) {
        // Send native ETH using smart wallet
        hash = await smartClient.sendTransaction({
          to: sendTo as `0x${string}`,
          value: amount,
          account: smartClient.account,
          chain: chainConfig,
        })
      } else {
        // Send ERC20 token using smart wallet
        const data = encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [sendTo as `0x${string}`, amount],
        })

        hash = await smartClient.sendTransaction({
          to: selectedToken.address as `0x${string}`,
          data,
          account: smartClient.account,
          chain: chainConfig,
        })
      }

      setTxHash(hash)
      setTxChainId(chainConfig.id)
      console.log('Transaction sent via smart wallet:', hash)
    } catch (error) {
      console.error('Send transaction error:', error)
      setSendError(error instanceof Error ? error.message : 'Transaction failed')
    } finally {
      setIsSending(false)
    }
  }

  const setMaxAmount = () => {
    if (selectedToken) {
      setSendAmount(selectedToken.balance)
    } else {
      setSendAmount(numericBalance.toString())
    }
  }

  // Get selected token balance
  const selectedTokenBalance = selectedToken
    ? parseFloat(selectedToken.balance)
    : numericBalance

  if (!isAuthenticated) {
    return (
      <div className="dashboard-page">
        <div className="noise-overlay" />
        <div className="aura aura-1" />
        <div className="aura aura-2" />
        <div className="min-h-screen flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <RefreshCw className="w-8 h-8 text-[#ef4444] animate-spin" />
            <p className="text-gray-500">Loading your wallet...</p>
          </div>
        </div>
        <style jsx global>{dashboardStyles}</style>
      </div>
    )
  }

  return (
    <div className="dashboard-page">
      {/* Grain Texture Overlay */}
      <div className="noise-overlay" />

      {/* Atmospheric Red Auras */}
      <div className="aura aura-1" />
      <div className="aura aura-2" />
      <div className="aura aura-3" />

      {/* Header */}
      <header className="dashboard-header">
        <LogoInline size="sm" />
        <button
          onClick={() => logout()}
          className="logout-btn"
          title="Sign out"
        >
          <LogOut className="w-5 h-5" strokeWidth={1.5} />
        </button>
      </header>

      {/* Main Content */}
      <main className="dashboard-main">
        
        {/* Balance Card */}
        <div className="card">

          {/* Balance Display */}
          <div className="text-center py-6">
            <p className="text-gray-400 text-sm mb-1">Total Balance</p>
            {portfolioLoading || balanceLoading ? (
              <div className="h-12 w-40 mx-auto bg-gray-700/30 rounded-xl animate-pulse" />
            ) : (
              <h1 className="text-5xl font-bold text-white tracking-tight font-mono">
                ${formattedBalance}
              </h1>
            )}

            {/* Multi-chain indicator */}
            <div className="flex items-center justify-center gap-2 mt-2">
              {portfolioChains.length > 0 ? (
                <div className="flex items-center gap-1">
                  {portfolioChains.slice(0, 4).map(chainId => (
                    <img
                      key={chainId}
                      src={CHAIN_CONFIG[chainId]?.logo || CHAIN_CONFIG[8453].logo}
                      alt={CHAIN_CONFIG[chainId]?.name || 'Chain'}
                      className="w-5 h-5 rounded-full"
                    />
                  ))}
                  {portfolioChains.length > 4 && (
                    <span className="text-white/40 text-xs">+{portfolioChains.length - 4}</span>
                  )}
                </div>
              ) : (
                <p className="text-[#ef4444] text-sm font-medium">USDC on Base</p>
              )}
            </div>

            {/* Refresh button */}
            <button
              onClick={handleRefresh}
              className="mt-3 p-2 text-gray-500 hover:text-gray-300 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${portfolioLoading || balanceLoading ? 'animate-spin' : ''}`} strokeWidth={2} />
            </button>
          </div>

          {/* Wallet Address Row */}
          <div className="flex items-center justify-between py-3 px-4 bg-white/[0.02] rounded-2xl mb-4">
            <div className="flex items-center gap-2">
              {isSmartWalletReady ? (
                <div className="flex items-center gap-1 px-2 py-1 bg-green-500/10 rounded-lg border border-green-500/20">
                  <Shield className="w-3 h-3 text-green-400" />
                  <span className="text-green-400 text-xs font-medium">Smart</span>
                </div>
              ) : (
                <div className="w-4 h-4 bg-[#ef4444] rounded" />
              )}
              <span className="text-gray-400 text-sm font-mono">
                {address?.slice(0, 6)}...{address?.slice(-4)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={`https://basescan.org/address/${address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 text-xs hover:text-gray-300 transition-colors flex items-center gap-1"
              >
                BaseScan
                <ExternalLink className="w-3 h-3" />
              </a>
              <button
                onClick={copyAddress}
                className="p-1.5 text-gray-400 hover:text-gray-300 transition-colors"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-[#22c55e]" />
                ) : (
                  <Copy className="w-4 h-4" strokeWidth={1.5} />
                )}
              </button>
            </div>
          </div>

          {/* Action Buttons Row */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => {
                setShowSend(true)
                setTxHash(undefined)
                setTxChainId(undefined)
                setSendError(null)
              }}
              className="action-btn"
            >
              <ArrowUpRight className="w-5 h-5 text-gray-300" strokeWidth={1.5} />
              <span className="text-gray-300 text-sm">Send</span>
            </button>
            <button 
              onClick={() => setShowReceive(true)}
              className="action-btn"
            >
              <ArrowDownLeft className="w-5 h-5 text-gray-300" strokeWidth={1.5} />
              <span className="text-gray-300 text-sm">Receive</span>
            </button>
            <Link 
              href="/fund"
              className="action-btn buy-btn"
            >
              <Plus className="w-5 h-5 text-[#ef4444]" strokeWidth={2} />
              <span className="text-[#ef4444] text-sm font-medium">Buy USDC</span>
            </Link>
          </div>
        </div>

        {/* Holdings/Portfolio Card */}
        {portfolio && portfolio.tokens && portfolio.tokens.length > 0 && (
          <div className="card mt-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold flex items-center gap-2">
                <Coins className="w-4 h-4 text-white/60" />
                Holdings
              </h2>
              <span className="text-white/40 text-xs">{portfolio.tokens.length} assets</span>
            </div>

            <div className="space-y-2 max-h-[280px] overflow-y-auto">
              {portfolio.tokens.slice(0, 10).map((token: PortfolioToken, index: number) => (
                <div
                  key={`${token.chainId}-${token.address}-${index}`}
                  className="flex items-center justify-between p-3 bg-white/[0.02] rounded-xl hover:bg-white/[0.04] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {/* Token logo with chain badge */}
                    <div className="relative">
                      <img
                        src={token.logoURI || `https://api.dicebear.com/7.x/shapes/svg?seed=${token.symbol}`}
                        alt={token.symbol}
                        className="w-9 h-9 rounded-full bg-white/10"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/shapes/svg?seed=${token.symbol}`
                        }}
                      />
                      {/* Chain badge */}
                      <img
                        src={CHAIN_CONFIG[token.chainId]?.logo || CHAIN_CONFIG[8453].logo}
                        alt={CHAIN_CONFIG[token.chainId]?.name || 'Chain'}
                        className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border border-[#111]"
                      />
                    </div>

                    <div>
                      <p className="text-white font-medium text-sm">{token.symbol}</p>
                      <p className="text-white/40 text-xs">{CHAIN_CONFIG[token.chainId]?.name || 'Unknown'}</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-white font-mono text-sm">
                      {formatTokenBalance(token.balance)}
                    </p>
                    <p className="text-white/40 text-xs">
                      {token.balanceUsd > 0 ? formatUsdValue(token.balanceUsd) : '-'}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {portfolio.tokens.length > 10 && (
              <p className="text-white/40 text-xs text-center mt-3">
                +{portfolio.tokens.length - 10} more assets
              </p>
            )}
          </div>
        )}

        {/* Recent Activity Card */}
        <div className="card mt-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold">Recent Activity</h2>
          </div>

          <TransactionList address={address} limit={5} />
        </div>

      </main>

      {/* Bottom Navigation */}
      <BottomNav />

      {/* PWA Install Prompt */}
      <InstallPrompt />

      {/* Send Modal */}
      <Modal isOpen={showSend} onClose={() => !isSending && !isConfirming && setShowSend(false)} title="Send">
        <div className="space-y-5">
          {/* Chain Selection */}
          <div>
            <label className="block text-white/40 text-sm mb-2 font-medium">Network</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowChainSelect(!showChainSelect)}
                className="w-full flex items-center justify-between px-4 py-3 bg-white/[0.03] rounded-2xl border border-white/[0.06] hover:border-white/20 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={selectedChain.logo}
                    alt={selectedChain.name}
                    className="w-6 h-6 rounded-full"
                  />
                  <span className="text-white font-medium">{selectedChain.name}</span>
                </div>
                <ChevronDown className={`w-5 h-5 text-white/40 transition-transform ${showChainSelect ? 'rotate-180' : ''}`} />
              </button>

              {showChainSelect && (
                <div className="absolute z-10 w-full mt-2 bg-[#1a1a1a] border border-white/10 rounded-xl overflow-hidden shadow-xl">
                  {SEND_CHAINS.map((chain) => (
                    <button
                      key={chain.id}
                      type="button"
                      onClick={() => {
                        setSelectedChain(chain)
                        setShowChainSelect(false)
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.05] transition-colors ${
                        selectedChain.id === chain.id ? 'bg-white/[0.05]' : ''
                      }`}
                    >
                      <img src={chain.logo} alt={chain.name} className="w-5 h-5 rounded-full" />
                      <span className="text-white text-sm">{chain.name}</span>
                      {selectedChain.id === chain.id && (
                        <Check className="w-4 h-4 text-green-400 ml-auto" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-white/40 text-sm mb-2 font-medium">Recipient Address</label>
            <div className={`bg-white/[0.03] rounded-2xl border transition-all ${addressError ? 'border-red-500/50' : 'border-white/[0.06] focus-within:border-white/20'}`}>
              <input
                type="text"
                value={sendTo}
                onChange={(e) => {
                  setSendTo(e.target.value)
                  validateAddress(e.target.value)
                }}
                placeholder="0x..."
                disabled={isSending || isConfirming}
                className="w-full bg-transparent px-5 py-4 text-white font-mono text-sm placeholder:text-white/30 focus:outline-none"
              />
            </div>
            {addressError && <p className="mt-2 text-sm text-red-400">{addressError}</p>}
          </div>

          {/* Token Selection */}
          <div>
            <label className="block text-white/40 text-sm mb-2 font-medium">Token</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowTokenSelect(!showTokenSelect)}
                disabled={tokensOnSelectedChain.length === 0}
                className="w-full flex items-center justify-between px-4 py-3 bg-white/[0.03] rounded-2xl border border-white/[0.06] hover:border-white/20 transition-colors disabled:opacity-50"
              >
                {selectedToken ? (
                  <div className="flex items-center gap-3">
                    <img
                      src={selectedToken.logoURI}
                      alt={selectedToken.symbol}
                      className="w-6 h-6 rounded-full"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png'
                      }}
                    />
                    <div className="text-left">
                      <span className="text-white font-medium">{selectedToken.symbol}</span>
                      <p className="text-white/40 text-xs">{formatTokenBalance(selectedToken.balance)} available</p>
                    </div>
                  </div>
                ) : (
                  <span className="text-white/40">No tokens on {selectedChain.name}</span>
                )}
                <ChevronDown className={`w-5 h-5 text-white/40 transition-transform ${showTokenSelect ? 'rotate-180' : ''}`} />
              </button>

              {showTokenSelect && tokensOnSelectedChain.length > 0 && (
                <div className="absolute z-10 w-full mt-2 bg-[#1a1a1a] border border-white/10 rounded-xl overflow-hidden shadow-xl max-h-60 overflow-y-auto">
                  {tokensOnSelectedChain.map((token, index) => (
                    <button
                      key={`${token.address}-${index}`}
                      type="button"
                      onClick={() => {
                        setSelectedToken(token)
                        setShowTokenSelect(false)
                        setSendAmount('') // Reset amount when switching tokens
                      }}
                      className={`w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.05] transition-colors ${
                        selectedToken?.address === token.address ? 'bg-white/[0.05]' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={token.logoURI}
                          alt={token.symbol}
                          className="w-5 h-5 rounded-full"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png'
                          }}
                        />
                        <div className="text-left">
                          <span className="text-white text-sm">{token.symbol}</span>
                          <p className="text-white/40 text-xs">{token.name}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-white text-sm">{formatTokenBalance(token.balance)}</p>
                        <p className="text-white/40 text-xs">${token.balanceUsd?.toFixed(2)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-white/40 text-sm font-medium">Amount</label>
              <button onClick={setMaxAmount} disabled={!selectedToken} className="text-xs text-[#ef4444] hover:text-[#dc2626] font-semibold disabled:opacity-50">MAX</button>
            </div>
            <CardInner className="p-5">
              <div className="flex items-center gap-4">
                <input
                  type="text"
                  inputMode="decimal"
                  value={sendAmount}
                  onChange={(e) => setSendAmount(e.target.value)}
                  placeholder="0.00"
                  disabled={isSending || isConfirming || !selectedToken}
                  className="flex-1 bg-transparent text-4xl font-semibold text-white placeholder:text-white/20 focus:outline-none disabled:opacity-50"
                />
                {selectedToken && (
                  <div className="flex items-center gap-2 bg-white/[0.06] rounded-full px-4 py-2">
                    <img
                      src={selectedToken.logoURI}
                      alt={selectedToken.symbol}
                      className="w-6 h-6 rounded-full"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png'
                      }}
                    />
                    <span className="text-white font-medium">{selectedToken.symbol}</span>
                  </div>
                )}
              </div>
              {/* USD value of amount being sent */}
              {selectedToken && sendAmount && parseFloat(sendAmount) > 0 && (
                <p className="text-white/60 text-lg mt-2 font-medium">
                  ≈ ${(() => {
                    const tokenBalance = parseFloat(selectedToken.balance) || 0
                    const pricePerToken = tokenBalance > 0 ? (selectedToken.balanceUsd || 0) / tokenBalance : 0
                    const usdValue = parseFloat(sendAmount) * pricePerToken
                    return usdValue < 0.01 ? '< 0.01' : usdValue.toFixed(2)
                  })()}
                </p>
              )}
              <p className="text-white/40 text-sm mt-2">
                Balance: <span className="text-white/60">
                  {selectedToken ? `${formatTokenBalance(selectedToken.balance)} ${selectedToken.symbol}` : '$0.00'}
                </span>
                {selectedToken?.balanceUsd ? (
                  <span className="text-white/40 ml-1">(${selectedToken.balanceUsd.toFixed(2)})</span>
                ) : null}
              </p>
            </CardInner>
          </div>

          <button
            onClick={handleSend}
            disabled={isSending || isConfirming || !sendTo || !sendAmount || !selectedToken || !!addressError || parseFloat(sendAmount) > selectedTokenBalance}
            className="w-full py-4 bg-[#ef4444] hover:bg-[#dc2626] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-2xl transition-all flex items-center justify-center gap-2"
          >
            {isSending || isConfirming ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                {isSending ? 'Sending...' : 'Confirming...'}
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send on {selectedChain.name}
              </>
            )}
          </button>

          <p className="text-white/30 text-xs text-center">
            Gas sponsored • No ETH needed
          </p>

          {sendError && (
            <p className="text-red-400 text-sm text-center">{sendError}</p>
          )}

          {selectedToken && parseFloat(sendAmount) > selectedTokenBalance && sendAmount && !sendError && (
            <p className="text-red-400 text-sm text-center">Insufficient {selectedToken.symbol} balance</p>
          )}
        </div>
      </Modal>

      {/* Receive Modal */}
      <Modal isOpen={showReceive} onClose={() => setShowReceive(false)} title="Receive">
        <div className="text-center">
          {/* Smart wallet badge */}
          {isSmartWalletReady && (
            <div className="flex items-center justify-center gap-1.5 mb-4 px-3 py-1.5 mx-auto w-fit bg-green-500/10 rounded-full border border-green-500/20">
              <Shield className="w-3.5 h-3.5 text-green-400" />
              <span className="text-green-400 text-xs font-medium">Smart Wallet</span>
            </div>
          )}

          {/* QR Code */}
          <div className="w-48 h-48 mx-auto mb-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-center p-2">
            <div className="w-full h-full bg-white rounded-xl flex items-center justify-center p-2">
              {address ? (
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${address}&bgcolor=ffffff&color=111111`}
                  alt="Wallet QR Code"
                  className="w-full h-full"
                />
              ) : (
                <QrCode className="w-16 h-16 text-[#111]" />
              )}
            </div>
          </div>

          <p className="text-white/40 text-sm mb-4">Share your address to receive tokens</p>

          <div className="bg-white/[0.02] rounded-2xl border border-white/[0.04] p-4 mb-4">
            <p className="font-mono text-xs text-white/60 break-all">{address}</p>
          </div>

          <button
            onClick={() => { copyAddress(); setShowReceive(false); }}
            className="w-full py-4 bg-[#ef4444] hover:bg-[#dc2626] text-white font-semibold rounded-2xl transition-all flex items-center justify-center gap-2"
          >
            <Copy className="w-4 h-4" />
            Copy Address
          </button>

          {/* Supported chains */}
          <div className="mt-5">
            <p className="text-white/30 text-xs mb-3">Works on</p>
            <div className="flex items-center justify-center gap-2">
              {SEND_CHAINS.map((chain) => (
                <div key={chain.id} className="flex flex-col items-center gap-1" title={chain.name}>
                  <div className="w-8 h-8 bg-white/[0.05] rounded-full border border-white/[0.1] flex items-center justify-center">
                    <img
                      src={chain.logo}
                      alt={chain.name}
                      className="w-5 h-5 rounded-full"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <style jsx global>{dashboardStyles}</style>
    </div>
  )
}

const dashboardStyles = `
  .dashboard-page {
    min-height: 100vh;
    width: 100%;
    background: #F4F4F5;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif;
    overflow-x: hidden;
    position: relative;
  }

  /* Grain texture like homepage */
  .dashboard-page .noise-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 10000;
    opacity: 0.08;
    mix-blend-mode: overlay;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
  }

  /* Red auras like homepage */
  .dashboard-page .aura {
    position: fixed;
    border-radius: 50%;
    z-index: 0;
    animation: aura-float 20s ease-in-out infinite;
  }

  .dashboard-page .aura-1 {
    width: 800px;
    height: 800px;
    top: -250px;
    left: -200px;
    background: #FF3B30;
    filter: blur(150px);
    opacity: 0.5;
  }

  .dashboard-page .aura-2 {
    width: 700px;
    height: 700px;
    bottom: -200px;
    right: -150px;
    background: #D70015;
    filter: blur(140px);
    opacity: 0.45;
    animation-delay: 7s;
  }

  .dashboard-page .aura-3 {
    width: 400px;
    height: 400px;
    top: 40%;
    right: 20%;
    background: #FF6B35;
    filter: blur(120px);
    opacity: 0.3;
    animation-delay: 14s;
  }

  @keyframes aura-float {
    0%, 100% { transform: translate(0, 0) scale(1); }
    33% { transform: translate(50px, -40px) scale(1.05); }
    66% { transform: translate(-30px, 40px) scale(0.95); }
  }

  /* Header - with safe area for notch */
  .dashboard-page .dashboard-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    padding-top: calc(16px + env(safe-area-inset-top, 0px));
    max-width: 430px;
    margin: 0 auto;
    width: 100%;
    position: relative;
    z-index: 10;
  }

  .dashboard-page .logout-btn {
    padding: 8px;
    color: #6B7280;
    transition: color 0.2s;
    background: none;
    border: none;
    cursor: pointer;
  }

  .dashboard-page .logout-btn:hover {
    color: #374151;
  }

  /* Main Content */
  .dashboard-page .dashboard-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 0 16px 96px;
    max-width: 430px;
    margin: 0 auto;
    width: 100%;
    position: relative;
    z-index: 1;
  }

  /* Cards - Dark with red gradient fade from top-left */
  .dashboard-page .card {
    background: #111111;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 24px;
    padding: 24px;
    position: relative;
    overflow: hidden;
  }

  .dashboard-page .card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: radial-gradient(
      ellipse at 0% 0%,
      rgba(255, 59, 48, 0.25) 0%,
      rgba(255, 59, 48, 0.1) 30%,
      rgba(255, 59, 48, 0.03) 50%,
      transparent 70%
    );
    pointer-events: none;
    z-index: 0;
  }

  .dashboard-page .card > * {
    position: relative;
    z-index: 1;
  }

  /* Action Buttons */
  .dashboard-page .action-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 16px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 16px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .dashboard-page .action-btn:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  .dashboard-page .buy-btn {
    background: rgba(239, 68, 68, 0.1);
    border-color: rgba(239, 68, 68, 0.2);
  }

  .dashboard-page .buy-btn:hover {
    background: rgba(239, 68, 68, 0.15);
  }
`
