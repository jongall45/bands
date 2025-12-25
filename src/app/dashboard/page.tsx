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
  Send, RefreshCw, ExternalLink, Plus, QrCode, Shield, ChevronDown, Coins
} from 'lucide-react'
import Link from 'next/link'
import { Modal } from '@/components/ui/Modal'
import { BottomNav } from '@/components/ui/BottomNav'
import { LogoInline } from '@/components/ui/Logo'
import { TransactionList } from '@/components/ui/TransactionList'
import { InstallPrompt } from '@/components/pwa/InstallPrompt'
import { IndustrialPage, GlassCard, GlassButton, GlassInner, TechBadge, SectionHeader } from '@/components/ui/IndustrialGlass'

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

      const isNative = selectedToken.address === '0x0000000000000000000000000000000000000000' ||
                       selectedToken.symbol === 'ETH' ||
                       selectedToken.address === 'native'

      let hash: `0x${string}`

      if (isNative) {
        hash = await smartClient.sendTransaction({
          to: sendTo as `0x${string}`,
          value: amount,
          account: smartClient.account,
          chain: chainConfig,
        })
      } else {
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

  const selectedTokenBalance = selectedToken
    ? parseFloat(selectedToken.balance)
    : numericBalance

  if (!isAuthenticated) {
    return (
      <IndustrialPage>
        <div className="min-h-screen flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <RefreshCw className="w-8 h-8 text-[#FF3B30] animate-spin" />
            <p className="text-white/50">Loading your wallet...</p>
          </div>
        </div>
      </IndustrialPage>
    )
  }

  return (
    <IndustrialPage>
      {/* Header */}
      <header
        className="flex items-center justify-between px-5 py-4 max-w-[430px] mx-auto"
        style={{ paddingTop: 'calc(16px + env(safe-area-inset-top, 0px))' }}
      >
        <LogoInline size="sm" />
        <button
          onClick={() => logout()}
          className="p-2 text-white/40 hover:text-white/70 transition-colors"
          title="Sign out"
        >
          <LogOut className="w-5 h-5" strokeWidth={1.5} />
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col px-4 pb-24 max-w-[430px] mx-auto w-full">

        {/* Balance Card */}
        <GlassCard variant="redAccent" className="mb-4">
          {/* Add Money Button - Top Right */}
          <div className="flex justify-end mb-2">
            <Link
              href="/fund"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FF3B30] hover:bg-[#D70015] text-white text-xs font-bold rounded-lg transition-all active:scale-[0.98] uppercase tracking-wide"
            >
              <Plus className="w-3 h-3" strokeWidth={2.5} />
              <span>Add Cash</span>
            </Link>
          </div>

          {/* Balance Display */}
          <div className="text-center pb-6">
            <p className="text-white/40 text-xs font-mono uppercase tracking-widest mb-2">Total_Liquidity</p>
            {portfolioLoading || balanceLoading ? (
              <div className="h-14 w-48 mx-auto bg-white/5 rounded-xl animate-pulse" />
            ) : (
              <h1 className="text-5xl font-extrabold text-white tracking-tight" style={{ fontWeight: 800 }}>
                ${formattedBalance}
              </h1>
            )}

            {/* Multi-chain indicator */}
            <div className="flex items-center justify-center gap-2 mt-3">
              {portfolioChains.length > 0 ? (
                <div className="flex items-center gap-1">
                  {portfolioChains.slice(0, 4).map(chainId => (
                    <img
                      key={chainId}
                      src={CHAIN_CONFIG[chainId]?.logo || CHAIN_CONFIG[8453].logo}
                      alt={CHAIN_CONFIG[chainId]?.name || 'Chain'}
                      className="w-5 h-5 rounded-full border border-white/10"
                    />
                  ))}
                  {portfolioChains.length > 4 && (
                    <span className="text-white/40 text-xs">+{portfolioChains.length - 4}</span>
                  )}
                </div>
              ) : (
                <TechBadge color="#FF3B30">USDC on Base</TechBadge>
              )}
            </div>

            {/* Refresh button */}
            <button
              onClick={handleRefresh}
              className="mt-3 p-2 text-white/30 hover:text-white/60 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${portfolioLoading || balanceLoading ? 'animate-spin' : ''}`} strokeWidth={2} />
            </button>
          </div>

          {/* Wallet Address Row */}
          <GlassInner className="mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isSmartWalletReady ? (
                  <div className="flex items-center gap-1 px-2 py-1 bg-green-500/10 rounded-lg border border-green-500/20">
                    <Shield className="w-3 h-3 text-green-400" />
                    <span className="text-green-400 text-xs font-medium">Smart</span>
                  </div>
                ) : (
                  <div className="w-4 h-4 bg-[#FF3B30] rounded" />
                )}
                <span className="text-white/60 text-sm font-mono">
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`https://basescan.org/address/${address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/40 text-xs hover:text-white/60 transition-colors flex items-center gap-1"
                >
                  BaseScan
                  <ExternalLink className="w-3 h-3" />
                </a>
                <button
                  onClick={copyAddress}
                  className="p-1.5 text-white/40 hover:text-white/60 transition-colors"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4" strokeWidth={1.5} />
                  )}
                </button>
              </div>
            </div>
          </GlassInner>

          {/* Action Buttons Row */}
          <div className="grid grid-cols-2 gap-3">
            <GlassButton
              onClick={() => {
                setShowSend(true)
                setTxHash(undefined)
                setTxChainId(undefined)
                setSendError(null)
              }}
            >
              <ArrowUpRight className="w-4 h-4" strokeWidth={2} />
              Send
            </GlassButton>
            <GlassButton onClick={() => setShowReceive(true)}>
              <ArrowDownLeft className="w-4 h-4" strokeWidth={2} />
              Receive
            </GlassButton>
          </div>
        </GlassCard>

        {/* Holdings/Portfolio Card */}
        {portfolio && portfolio.tokens && portfolio.tokens.length > 0 && (
          <GlassCard noPadding variant="redAccent" className="mb-4">
            <div className="p-4 pb-0">
              <SectionHeader badge={`${portfolio.tokens.length} assets`}>
                <span className="flex items-center gap-2">
                  <Coins className="w-4 h-4 text-white/60" />
                  Holdings //
                </span>
              </SectionHeader>
            </div>

            <div className="px-4 pb-4 space-y-2 max-h-[280px] overflow-y-auto">
              {portfolio.tokens.slice(0, 10).map((token: PortfolioToken, index: number) => (
                <div
                  key={`${token.chainId}-${token.address}-${index}`}
                  className="flex items-center justify-between p-3 bg-black/30 border border-white/5 rounded-xl hover:border-white/10 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <img
                        src={token.logoURI || `https://api.dicebear.com/7.x/shapes/svg?seed=${token.symbol}`}
                        alt={token.symbol}
                        className="w-9 h-9 rounded-full bg-white/10"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/shapes/svg?seed=${token.symbol}`
                        }}
                      />
                      <img
                        src={CHAIN_CONFIG[token.chainId]?.logo || CHAIN_CONFIG[8453].logo}
                        alt={CHAIN_CONFIG[token.chainId]?.name || 'Chain'}
                        className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border border-[#050505]"
                      />
                    </div>

                    <div>
                      <p className="text-white font-semibold text-sm">{token.symbol}</p>
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
              <p className="text-white/40 text-xs text-center pb-4">
                +{portfolio.tokens.length - 10} more assets
              </p>
            )}
          </GlassCard>
        )}

        {/* Recent Activity Card */}
        <GlassCard>
          <SectionHeader>Recent Activity</SectionHeader>
          <TransactionList address={address} limit={5} />
        </GlassCard>

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
                        setSendAmount('')
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
              <button onClick={setMaxAmount} disabled={!selectedToken} className="text-xs text-[#FF3B30] hover:text-[#D70015] font-semibold disabled:opacity-50">MAX</button>
            </div>
            <GlassInner className="p-5">
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
            </GlassInner>
          </div>

          <GlassButton
            primary
            onClick={handleSend}
            disabled={isSending || isConfirming || !sendTo || !sendAmount || !selectedToken || !!addressError || parseFloat(sendAmount) > selectedTokenBalance}
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
          </GlassButton>

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
          {isSmartWalletReady && (
            <div className="flex items-center justify-center gap-1.5 mb-4 px-3 py-1.5 mx-auto w-fit bg-green-500/10 rounded-full border border-green-500/20">
              <Shield className="w-3.5 h-3.5 text-green-400" />
              <span className="text-green-400 text-xs font-medium">Smart Wallet</span>
            </div>
          )}

          <GlassInner className="w-48 h-48 mx-auto mb-6 flex items-center justify-center p-2">
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
          </GlassInner>

          <p className="text-white/40 text-sm mb-4">Share your address to receive tokens</p>

          <GlassInner className="mb-4">
            <p className="font-mono text-xs text-white/60 break-all">{address}</p>
          </GlassInner>

          <GlassButton
            primary
            onClick={() => { copyAddress(); setShowReceive(false); }}
          >
            <Copy className="w-4 h-4" />
            Copy Address
          </GlassButton>

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
    </IndustrialPage>
  )
}
