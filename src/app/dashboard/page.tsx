'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useWaitForTransactionReceipt } from 'wagmi'
import { useReadContract } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { formatUnits, parseUnits, isAddress, encodeFunctionData } from 'viem'
import { base, arbitrum, optimism, mainnet, polygon } from 'wagmi/chains'
import { useAuth } from '@/hooks/useAuth'
import { usePortfolio, formatUsdValue, formatTokenBalance, CHAIN_CONFIG, type PortfolioToken } from '@/hooks/usePortfolio'
import { useSolanaAuth, SOLANA_TOKENS } from '@/hooks/useSolanaAuth'
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { getAssociatedTokenAddress, createTransferInstruction, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token'
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

// Solana chain ID (used for Relay API, but we use 'solana' as a special case for native transfers)
const SOLANA_CHAIN_ID = 792703809

// Supported chains for sending
const SEND_CHAINS = [
  { id: 8453, name: 'Base', logo: CHAIN_CONFIG[8453]?.logo, isSolana: false },
  { id: 42161, name: 'Arbitrum', logo: CHAIN_CONFIG[42161]?.logo, isSolana: false },
  { id: 10, name: 'Optimism', logo: CHAIN_CONFIG[10]?.logo, isSolana: false },
  { id: 1, name: 'Ethereum', logo: CHAIN_CONFIG[1]?.logo, isSolana: false },
  { id: 137, name: 'Polygon', logo: CHAIN_CONFIG[137]?.logo, isSolana: false },
  { id: SOLANA_CHAIN_ID, name: 'Solana', logo: 'https://cryptologos.cc/logos/solana-sol-logo.png', isSolana: true },
]

export default function Dashboard() {
  const { isAuthenticated, isConnected, address, isSmartWalletReady, logout, getClientForChain, isReady, solanaAddress, hasSolanaWallet, balances } = useAuth()
  const { sendTransaction, getConnection, fetchBalances: fetchSolanaBalances } = useSolanaAuth()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [copied, setCopied] = useState(false)
  const [copiedSolana, setCopiedSolana] = useState(false)
  const [showSend, setShowSend] = useState(false)
  const [showReceive, setShowReceive] = useState(false)
  const [sendTo, setSendTo] = useState('')
  const [sendAmount, setSendAmount] = useState('')
  const [addressError, setAddressError] = useState('')
  const [selectedChain, setSelectedChain] = useState(SEND_CHAINS[0])
  const [showChainSelect, setShowChainSelect] = useState(false)
  const hasNavigatedRef = useRef(false)

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
  const [receiveWallet, setReceiveWallet] = useState<'evm' | 'solana'>('evm')

  // Cross-chain portfolio from Dune API
  const { data: portfolio, refetch: refetchPortfolio, isLoading: portfolioLoading } = usePortfolio(address)

  // Create Solana tokens for the token selector
  const solPrice = 180 // Approximate SOL price
  const solanaTokensForSelector: PortfolioToken[] = hasSolanaWallet ? [
    {
      chainId: SOLANA_CHAIN_ID,
      chain: 'solana',
      address: 'native',
      symbol: 'SOL',
      name: 'Solana',
      decimals: 9,
      balance: balances.sol || '0',
      balanceUsd: parseFloat(balances.sol || '0') * solPrice,
      price: solPrice,
      logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
    },
    {
      chainId: SOLANA_CHAIN_ID,
      chain: 'solana',
      address: SOLANA_TOKENS.USDC.address,
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      balance: balances.usdcSolana || '0',
      balanceUsd: parseFloat(balances.usdcSolana || '0'),
      price: 1,
      logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
    },
  ] : []

  // Filter tokens by selected chain
  const tokensOnSelectedChain = selectedChain.isSolana
    ? solanaTokensForSelector
    : (portfolio?.tokens?.filter(t => t.chainId === selectedChain.id) || [])

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
    // Clear and re-validate address when switching chains
    if (sendTo) {
      validateAddress(sendTo)
    }
  }, [selectedChain.id, portfolio, solanaTokensForSelector])

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

  // Only redirect after auth is ready to prevent flash/glitch on refresh
  useEffect(() => {
    if (isReady && !isAuthenticated && !hasNavigatedRef.current) {
      hasNavigatedRef.current = true
      router.push('/')
    }
  }, [isAuthenticated, isReady, router])

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

  // Calculate Solana value (approximate - SOL ~$180, USDC = $1)
  const solValueUsd = parseFloat(balances.sol || '0') * 180 // Approximate SOL price
  const usdcSolanaValueUsd = parseFloat(balances.usdcSolana || '0')
  const solanaTotal = solValueUsd + usdcSolanaValueUsd

  // Use portfolio total if available, fallback to USDC balance, add Solana
  const evmTotal = portfolio?.totalValueUsd || 0
  const totalValue = evmTotal + solanaTotal
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

  // Refresh all balances including Solana
  const handleRefresh = useCallback(() => {
    refetchBalance()
    refetchPortfolio()
    fetchSolanaBalances()
  }, [refetchBalance, refetchPortfolio, fetchSolanaBalances])

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

  const copySolanaAddress = useCallback(() => {
    if (solanaAddress) {
      navigator.clipboard.writeText(solanaAddress)
      setCopiedSolana(true)
      setTimeout(() => setCopiedSolana(false), 2000)
    }
  }, [solanaAddress])

  // Validate Solana address (base58 format, 32-44 characters)
  const isValidSolanaAddress = (addr: string): boolean => {
    try {
      if (!addr || addr.length < 32 || addr.length > 44) return false
      // Solana addresses use base58 encoding (no 0, O, I, l)
      const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/
      if (!base58Regex.test(addr)) return false
      // Try to create a PublicKey - this validates the checksum
      new PublicKey(addr)
      return true
    } catch {
      return false
    }
  }

  const validateAddress = (addr: string) => {
    if (!addr) {
      setAddressError('')
      return
    }

    if (selectedChain.isSolana) {
      // Validate Solana address
      if (!isValidSolanaAddress(addr)) {
        setAddressError('Invalid Solana address format')
      } else {
        setAddressError('')
      }
    } else {
      // Validate EVM address
      if (!isAddress(addr)) {
        setAddressError('Invalid address format')
      } else {
        setAddressError('')
      }
    }
  }

  const handleSend = async () => {
    if (!sendTo || !sendAmount || addressError || !selectedToken) return

    // Validate address based on chain type
    if (selectedChain.isSolana) {
      if (!isValidSolanaAddress(sendTo)) {
        setAddressError('Invalid Solana address format')
        return
      }
    } else {
      if (!address) return
      if (!isAddress(sendTo)) {
        setAddressError('Invalid address format')
        return
      }
    }

    setIsSending(true)
    setSendError(null)

    try {
      // Handle Solana transfers
      if (selectedChain.isSolana) {
        if (!solanaAddress) {
          throw new Error('Solana wallet not available')
        }

        const connection = getConnection('mainnet')
        const fromPubkey = new PublicKey(solanaAddress)
        const toPubkey = new PublicKey(sendTo)
        const decimals = selectedToken.decimals || 9
        const amountInSmallestUnit = Math.floor(parseFloat(sendAmount) * Math.pow(10, decimals))

        let transaction: Transaction

        if (selectedToken.address === 'native' || selectedToken.symbol === 'SOL') {
          // Native SOL transfer
          transaction = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey,
              toPubkey,
              lamports: amountInSmallestUnit,
            })
          )
        } else {
          // SPL Token transfer (e.g., USDC)
          const mintPubkey = new PublicKey(selectedToken.address)

          // Get the associated token accounts
          const fromAta = await getAssociatedTokenAddress(mintPubkey, fromPubkey)
          const toAta = await getAssociatedTokenAddress(mintPubkey, toPubkey)

          // Check if recipient's ATA exists
          const toAtaInfo = await connection.getAccountInfo(toAta)

          transaction = new Transaction()

          // Create the recipient's ATA if it doesn't exist
          if (!toAtaInfo) {
            transaction.add(
              createAssociatedTokenAccountInstruction(
                fromPubkey, // payer
                toAta, // associated token account
                toPubkey, // owner
                mintPubkey // mint
              )
            )
          }

          // Add the transfer instruction
          transaction.add(
            createTransferInstruction(
              fromAta, // source
              toAta, // destination
              fromPubkey, // owner
              BigInt(amountInSmallestUnit) // amount
            )
          )
        }

        // Get recent blockhash
        const { blockhash } = await connection.getLatestBlockhash()
        transaction.recentBlockhash = blockhash
        transaction.feePayer = fromPubkey

        // Sign and send the transaction
        const result = await sendTransaction(transaction)
        console.log('Solana transaction sent:', result)

        // Refresh Solana balances after successful send
        setTimeout(() => fetchSolanaBalances(), 2000)

        // Close modal and reset
        setShowSend(false)
        setSendTo('')
        setSendAmount('')
        refetchPortfolio()
        return
      }

      // Handle EVM transfers
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

  // Show loading while auth is initializing or user is not authenticated
  if (!isReady || !isAuthenticated) {
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
          {/* Add Money Button - Top Right - Frosted Glass Style */}
          <div className="flex justify-end mb-2">
            <Link
              href="/fund"
              className="flex items-center gap-1 px-2.5 py-1.5 bg-[#FF3B30]/15 hover:bg-[#FF3B30]/30 border border-[#FF3B30]/30 hover:border-[#FF3B30]/50 text-[#FF3B30] text-[10px] font-bold rounded-lg transition-all active:scale-[0.98] uppercase tracking-wide backdrop-blur-md"
            >
              <Plus className="w-3 h-3" strokeWidth={2.5} />
              <span>Add Cash</span>
            </Link>
          </div>

          {/* Balance Display */}
          <div className="text-center pb-6">
            <p className="text-white/40 text-xs font-mono uppercase tracking-widest mb-2">Total Balance</p>
            {portfolioLoading || balanceLoading ? (
              <div className="h-14 w-48 mx-auto bg-white/5 rounded-xl animate-pulse" />
            ) : (
              <h1 className="text-5xl font-extrabold text-white tracking-tight" style={{ fontWeight: 800 }}>
                ${formattedBalance}
              </h1>
            )}

            {/* Multi-chain indicator */}
            <div className="flex items-center justify-center gap-2 mt-3">
              {portfolioChains.length > 0 || hasSolanaWallet ? (
                <div className="flex items-center gap-1">
                  {portfolioChains.slice(0, 3).map(chainId => (
                    <img
                      key={chainId}
                      src={CHAIN_CONFIG[chainId]?.logo || CHAIN_CONFIG[8453].logo}
                      alt={CHAIN_CONFIG[chainId]?.name || 'Chain'}
                      className="w-5 h-5 rounded-full border border-white/10"
                    />
                  ))}
                  {/* Solana indicator */}
                  {hasSolanaWallet && (
                    <img
                      src="https://cryptologos.cc/logos/solana-sol-logo.png"
                      alt="Solana"
                      className="w-5 h-5 rounded-full border border-white/10"
                    />
                  )}
                  {portfolioChains.length > 3 && (
                    <span className="text-white/40 text-xs">+{portfolioChains.length - 3}</span>
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

          {/* Wallet Addresses - Compact Row */}
          <div className="flex items-center justify-center gap-3 mb-4">
            {/* EVM Wallet */}
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/[0.03] rounded-xl border border-white/[0.06] hover:border-white/10 transition-colors">
              <img
                src="https://cryptologos.cc/logos/ethereum-eth-logo.png"
                alt="ETH"
                className="w-4 h-4 rounded-full"
              />
              <span className="text-white/50 text-xs font-mono">
                {address?.slice(0, 6)}...{address?.slice(-4)}
              </span>
              <a
                href={`https://basescan.org/address/${address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/30 hover:text-white/50 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
              <button
                onClick={copyAddress}
                className="text-white/30 hover:text-white/50 transition-colors"
              >
                {copied ? (
                  <Check className="w-3 h-3 text-green-400" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
            </div>

            {/* Solana Wallet */}
            {hasSolanaWallet && solanaAddress && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/[0.03] rounded-xl border border-white/[0.06] hover:border-white/10 transition-colors">
                <img
                  src="https://cryptologos.cc/logos/solana-sol-logo.png"
                  alt="SOL"
                  className="w-4 h-4 rounded-full"
                />
                <span className="text-white/50 text-xs font-mono">
                  {solanaAddress?.slice(0, 4)}...{solanaAddress?.slice(-4)}
                </span>
                <a
                  href={`https://solscan.io/account/${solanaAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/30 hover:text-white/50 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
                <button
                  onClick={copySolanaAddress}
                  className="text-white/30 hover:text-white/50 transition-colors"
                >
                  {copiedSolana ? (
                    <Check className="w-3 h-3 text-green-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              </div>
            )}
          </div>

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
        {(() => {
          // Combine EVM tokens with Solana tokens for display
          const evmTokens = portfolio?.tokens || []
          const solanaDisplayTokens = solanaTokensForSelector.filter(t => parseFloat(t.balance) > 0)
          const allTokens = [...solanaDisplayTokens, ...evmTokens]

          if (allTokens.length === 0) return null

          return (
            <GlassCard noPadding variant="redAccent" className="mb-4">
              <div className="p-4 pb-0">
                <SectionHeader badge={`${allTokens.length} assets`} badgeColor="#FF3B30">
                  <span className="flex items-center gap-2">
                    <Coins className="w-4 h-4 text-[#FF3B30]" />
                    Holdings
                  </span>
                </SectionHeader>
              </div>

              <div className="px-4 pb-4 space-y-2 max-h-[280px] overflow-y-auto">
                {allTokens.slice(0, 10).map((token: PortfolioToken, index: number) => {
                  const isSolanaToken = token.chainId === SOLANA_CHAIN_ID
                  const chainLogo = isSolanaToken
                    ? 'https://cryptologos.cc/logos/solana-sol-logo.png'
                    : (CHAIN_CONFIG[token.chainId]?.logo || CHAIN_CONFIG[8453].logo)
                  const chainName = isSolanaToken ? 'Solana' : (CHAIN_CONFIG[token.chainId]?.name || 'Unknown')

                  // Don't show chain badge for native tokens (SOL on Solana, ETH on EVM chains)
                  // since their logo already represents the chain
                  const isNativeToken = (isSolanaToken && (token.address === 'native' || token.symbol === 'SOL')) ||
                    (!isSolanaToken && (token.address === '0x0000000000000000000000000000000000000000' || token.symbol === 'ETH'))
                  const showChainBadge = !isNativeToken

                  return (
                    <div
                      key={`${token.chainId}-${token.address}-${index}`}
                      className="relative rounded-xl p-[1px] bg-gradient-to-br from-white/5 via-transparent to-transparent transition-all hover:from-white/10 hover:to-[#FF3B30]/25 group"
                    >
                      <div className="flex items-center justify-between p-3 bg-[#0a0a0a]/90 rounded-[11px] transition-all">
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
                            {showChainBadge && (
                              <img
                                src={chainLogo}
                                alt={chainName}
                                className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border border-[#050505]"
                              />
                            )}
                          </div>
                          <div>
                            <p className="text-white font-semibold text-sm">{token.symbol}</p>
                            <p className="text-white/40 text-xs">{chainName}</p>
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
                    </div>
                  )
                })}
              </div>

              {allTokens.length > 10 && (
                <p className="text-white/40 text-xs text-center pb-4">
                  +{allTokens.length - 10} more assets
                </p>
              )}
            </GlassCard>
          )
        })()}

        {/* Recent Activity Card */}
        <GlassCard variant="redAccent">
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
                placeholder={selectedChain.isSolana ? "Solana address..." : "0x..."}
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
            {selectedChain.isSolana ? 'Requires SOL for transaction fees' : 'Gas sponsored • No ETH needed'}
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
          {/* Wallet Selector Tabs */}
          {hasSolanaWallet && solanaAddress && (
            <div className="flex bg-white/[0.03] rounded-xl p-1 border border-white/[0.06] mb-4">
              <button
                onClick={() => setReceiveWallet('evm')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
                  receiveWallet === 'evm'
                    ? 'bg-[#FF3B30] text-white'
                    : 'text-white/50 hover:text-white/70'
                }`}
              >
                <img src="https://cryptologos.cc/logos/ethereum-eth-logo.png" alt="ETH" className="w-4 h-4 rounded-full" />
                EVM
              </button>
              <button
                onClick={() => setReceiveWallet('solana')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
                  receiveWallet === 'solana'
                    ? 'bg-[#FF3B30] text-white'
                    : 'text-white/50 hover:text-white/70'
                }`}
              >
                <img src="https://cryptologos.cc/logos/solana-sol-logo.png" alt="SOL" className="w-4 h-4 rounded-full" />
                Solana
              </button>
            </div>
          )}

          {/* Wallet badge */}
          {receiveWallet === 'evm' && isSmartWalletReady && (
            <div className="flex items-center justify-center gap-1.5 mb-4 px-3 py-1.5 mx-auto w-fit bg-green-500/10 rounded-full border border-green-500/20">
              <Shield className="w-3.5 h-3.5 text-green-400" />
              <span className="text-green-400 text-xs font-medium">Smart Wallet</span>
            </div>
          )}
          {receiveWallet === 'solana' && (
            <div className="flex items-center justify-center gap-1.5 mb-4 px-3 py-1.5 mx-auto w-fit bg-[#9945FF]/10 rounded-full border border-[#9945FF]/20">
              <img src="https://cryptologos.cc/logos/solana-sol-logo.png" alt="SOL" className="w-3.5 h-3.5 rounded-full" />
              <span className="text-[#9945FF] text-xs font-medium">Solana Wallet</span>
            </div>
          )}

          <GlassInner className="w-48 h-48 mx-auto mb-6 flex items-center justify-center p-2">
            <div className="w-full h-full bg-white rounded-xl flex items-center justify-center p-2">
              {(receiveWallet === 'evm' ? address : solanaAddress) ? (
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${receiveWallet === 'evm' ? address : solanaAddress}&bgcolor=ffffff&color=111111`}
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
            <p className="font-mono text-xs text-white/60 break-all">
              {receiveWallet === 'evm' ? address : solanaAddress}
            </p>
          </GlassInner>

          <GlassButton
            primary
            onClick={() => {
              receiveWallet === 'evm' ? copyAddress() : copySolanaAddress()
              setShowReceive(false)
            }}
          >
            <Copy className="w-4 h-4" />
            Copy Address
          </GlassButton>

          <div className="mt-5">
            <p className="text-white/30 text-xs mb-3">
              {receiveWallet === 'evm' ? 'Works on' : 'Solana Network'}
            </p>
            <div className="flex items-center justify-center gap-2">
              {receiveWallet === 'evm' ? (
                SEND_CHAINS.map((chain) => (
                  <div key={chain.id} className="flex flex-col items-center gap-1" title={chain.name}>
                    <div className="w-8 h-8 bg-white/[0.05] rounded-full border border-white/[0.1] flex items-center justify-center">
                      <img src={chain.logo} alt={chain.name} className="w-5 h-5 rounded-full" />
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <div className="w-8 h-8 bg-white/[0.05] rounded-full border border-white/[0.1] flex items-center justify-center">
                    <img src="https://cryptologos.cc/logos/solana-sol-logo.png" alt="Solana" className="w-5 h-5 rounded-full" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>
    </IndustrialPage>
  )
}
