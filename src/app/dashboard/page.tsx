'use client'

import { usePrivy, useWallets, useFundWallet } from '@privy-io/react-auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { formatUnits, parseUnits, isAddress } from 'viem'
import { base } from 'wagmi/chains'
import { USDC_ADDRESS, USDC_DECIMALS, ERC20_ABI } from '@/lib/wagmi'
import { 
  ArrowUpRight, ArrowDownLeft, Copy, Check, LogOut, 
  Send, RefreshCw, ExternalLink, Plus, ShoppingCart, QrCode,
  Zap, Wallet
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { CardInner } from '@/components/ui/Card'
import { BottomNav } from '@/components/ui/BottomNav'
import { Logo } from '@/components/ui/Logo'

export default function Dashboard() {
  const { ready, authenticated, logout } = usePrivy()
  const { wallets } = useWallets()
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const [showSend, setShowSend] = useState(false)
  const [showReceive, setShowReceive] = useState(false)
  const [sendTo, setSendTo] = useState('')
  const [sendAmount, setSendAmount] = useState('')
  const [addressError, setAddressError] = useState('')

  // Find the active wallet - prioritize Coinbase Smart Wallet, then embedded
  const coinbaseWallet = wallets.find((w) => w.walletClientType === 'coinbase_wallet' || w.walletClientType === 'coinbase_smart_wallet')
  const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy')
  const activeWallet = coinbaseWallet || embeddedWallet
  const address = activeWallet?.address as `0x${string}` | undefined
  
  // Determine wallet type for UI
  const isCoinbaseSmartWallet = !!coinbaseWallet
  const walletType = isCoinbaseSmartWallet ? 'Coinbase Smart Wallet' : 'Privy Wallet'

  const { fundWallet } = useFundWallet()

  const handleAddFunds = async () => {
    if (!address) return
    try {
      await fundWallet({ address: address as string })
    } catch (error) {
      console.error('Funding error:', error)
    }
  }

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

  const { writeContract, data: hash, isPending, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (!ready) return
    if (!authenticated) router.push('/')
  }, [ready, authenticated, router])

  useEffect(() => {
    if (isSuccess) {
      setShowSend(false)
      setSendTo('')
      setSendAmount('')
      refetchBalance()
      reset()
    }
  }, [isSuccess, refetchBalance, reset])

  const formattedBalance = usdcBalance 
    ? parseFloat(formatUnits(usdcBalance, USDC_DECIMALS)).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : '0.00'

  const numericBalance = usdcBalance 
    ? parseFloat(formatUnits(usdcBalance, USDC_DECIMALS))
    : 0

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

  const handleSend = () => {
    if (!sendTo || !sendAmount || addressError) return
    if (!isAddress(sendTo)) {
      setAddressError('Invalid address format')
      return
    }
    
    const amount = parseUnits(sendAmount, USDC_DECIMALS)
    writeContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [sendTo as `0x${string}`, amount],
      chainId: base.id,
    })
  }

  const setMaxAmount = () => {
    setSendAmount(numericBalance.toString())
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 text-[#ef4444] animate-spin" />
          <p className="text-white/40">Loading your wallet...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Header - Centered */}
      <header className="flex items-center justify-between px-5 py-4 max-w-[430px] mx-auto w-full">
        <Logo size="sm" />
        <button
          onClick={logout}
          className="p-2 text-white/40 hover:text-white transition-colors"
          title="Sign out"
        >
          <LogOut className="w-5 h-5" strokeWidth={1.5} />
        </button>
      </header>

      {/* Main Content - Centered Card Layout */}
      <main className="flex-1 flex flex-col px-4 pb-24 max-w-[430px] mx-auto w-full">
        
        {/* Balance Card */}
        <div className="bg-[#111111] border border-white/[0.06] rounded-3xl p-6 mt-4">
          
          {/* Wallet Type Badge */}
          {isCoinbaseSmartWallet && (
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#0052FF]/10 border border-[#0052FF]/30 rounded-full">
                <Zap className="w-3 h-3 text-[#0052FF]" />
                <span className="text-[#0052FF] text-xs font-medium">Free Gas</span>
              </div>
            </div>
          )}
          
          {/* Balance Display */}
          <div className="text-center py-6">
            <p className="text-white/40 text-sm mb-1">Total Balance</p>
            {balanceLoading ? (
              <div className="h-12 w-40 mx-auto shimmer rounded-xl" />
            ) : (
              <h1 className="text-5xl font-bold text-white tracking-tight font-mono">
                ${formattedBalance}
              </h1>
            )}
            <p className="text-[#ef4444] text-sm mt-2 font-medium">USDC on Base</p>
            
            {/* Refresh button */}
            <button 
              onClick={() => refetchBalance()}
              className="mt-3 p-2 text-white/30 hover:text-white/60 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${balanceLoading ? 'animate-spin' : ''}`} strokeWidth={2} />
            </button>
          </div>

          {/* Wallet Address Row */}
          <div className="flex items-center justify-between py-3 px-4 bg-white/[0.02] rounded-2xl mb-4">
            <div className="flex items-center gap-2">
              {isCoinbaseSmartWallet ? (
                <Wallet className="w-4 h-4 text-[#0052FF]" />
              ) : (
                <div className="w-4 h-4 bg-[#ef4444] rounded" />
              )}
              <span className="text-white/40 text-sm font-mono">
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
                  <Check className="w-4 h-4 text-[#22c55e]" />
                ) : (
                  <Copy className="w-4 h-4" strokeWidth={1.5} />
                )}
              </button>
            </div>
          </div>

          {/* Add Funds Button - Primary CTA */}
          <button 
            onClick={handleAddFunds}
            className="w-full py-4 bg-[#ef4444] hover:bg-[#dc2626] text-white font-semibold rounded-2xl transition-all flex items-center justify-center gap-2 mb-3 shadow-[0_0_20px_rgba(239,68,68,0.3)]"
          >
            <Plus className="w-5 h-5" />
            Add Funds
            <span className="text-white/60 text-sm ml-1">Apple Pay · Card</span>
          </button>

          {/* Action Buttons Row */}
          <div className="grid grid-cols-3 gap-2">
            <button 
              onClick={() => setShowSend(true)}
              className="flex flex-col items-center gap-2 py-4 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded-2xl transition-all"
            >
              <ArrowUpRight className="w-5 h-5 text-white/70" strokeWidth={1.5} />
              <span className="text-white/70 text-sm">Send</span>
            </button>
            <button 
              onClick={() => setShowReceive(true)}
              className="flex flex-col items-center gap-2 py-4 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded-2xl transition-all"
            >
              <ArrowDownLeft className="w-5 h-5 text-white/70" strokeWidth={1.5} />
              <span className="text-white/70 text-sm">Receive</span>
            </button>
            <button 
              onClick={handleAddFunds}
              className="flex flex-col items-center gap-2 py-4 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] rounded-2xl transition-all"
            >
              <ShoppingCart className="w-5 h-5 text-white/70" strokeWidth={1.5} />
              <span className="text-white/70 text-sm">Buy</span>
            </button>
          </div>
        </div>

        {/* Wallet Info Card */}
        <div className="bg-[#111111] border border-white/[0.06] rounded-3xl p-5 mt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isCoinbaseSmartWallet ? (
                <div className="w-10 h-10 bg-[#0052FF] rounded-xl flex items-center justify-center">
                  <Wallet className="w-5 h-5 text-white" />
                </div>
              ) : (
                <div className="w-10 h-10 bg-[#ef4444] rounded-xl flex items-center justify-center">
                  <span className="text-white font-bold">$</span>
                </div>
              )}
              <div>
                <p className="text-white font-medium">{walletType}</p>
                <p className="text-white/40 text-sm">
                  {isCoinbaseSmartWallet ? 'Gas sponsored by Coinbase' : 'Self-custody wallet'}
                </p>
              </div>
            </div>
            {isCoinbaseSmartWallet && (
              <div className="flex items-center gap-1 text-[#0052FF] text-xs">
                <Zap className="w-3 h-3" />
                <span>Free Gas</span>
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity Card */}
        <div className="bg-[#111111] border border-white/[0.06] rounded-3xl p-5 mt-4">
          <h2 className="text-white font-semibold mb-4">Recent Activity</h2>
          
          {/* Empty State */}
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 bg-white/[0.03] rounded-full flex items-center justify-center mb-4">
              <Send className="w-6 h-6 text-white/20" strokeWidth={1.5} />
            </div>
            <p className="text-white/40 text-sm">No transactions yet</p>
            <p className="text-white/20 text-xs mt-1">Send or receive to get started</p>
          </div>
        </div>

      </main>

      {/* Bottom Navigation - Using shared component */}
      <BottomNav />

      {/* Send Modal */}
      <Modal isOpen={showSend} onClose={() => !isPending && !isConfirming && setShowSend(false)} title="Send USDC">
        <div className="space-y-5">
          {isCoinbaseSmartWallet && (
            <div className="flex items-center gap-2 p-3 bg-[#0052FF]/10 border border-[#0052FF]/20 rounded-xl">
              <Zap className="w-4 h-4 text-[#0052FF]" />
              <span className="text-[#0052FF] text-sm">Gas is free with Coinbase Smart Wallet</span>
            </div>
          )}
          
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
                disabled={isPending || isConfirming}
                className="w-full bg-transparent px-5 py-4 text-white font-mono text-sm placeholder:text-white/30 focus:outline-none"
              />
            </div>
            {addressError && <p className="mt-2 text-sm text-red-400">{addressError}</p>}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-white/40 text-sm font-medium">Amount</label>
              <button onClick={setMaxAmount} className="text-xs text-[#ef4444] hover:text-[#dc2626] font-semibold">MAX</button>
            </div>
            <CardInner className="p-5">
              <div className="flex items-center gap-4">
                <input
                  type="text"
                  inputMode="decimal"
                  value={sendAmount}
                  onChange={(e) => setSendAmount(e.target.value)}
                  placeholder="0.00"
                  disabled={isPending || isConfirming}
                  className="flex-1 bg-transparent text-4xl font-semibold text-white placeholder:text-white/20 focus:outline-none"
                />
                <div className="flex items-center gap-2 bg-white/[0.06] rounded-full px-4 py-2">
                  <div className="w-6 h-6 rounded-full bg-[#2775ca] flex items-center justify-center">
                    <span className="text-white text-xs font-bold">$</span>
                  </div>
                  <span className="text-white font-medium">USDC</span>
                </div>
              </div>
              <p className="text-white/40 text-sm mt-3">Balance: <span className="text-white/60">${formattedBalance}</span></p>
            </CardInner>
          </div>

          <button
            onClick={handleSend}
            disabled={isPending || isConfirming || !sendTo || !sendAmount || !!addressError || parseFloat(sendAmount) > numericBalance}
            className="w-full py-4 bg-[#ef4444] hover:bg-[#dc2626] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-2xl transition-all flex items-center justify-center gap-2"
          >
            {isPending || isConfirming ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                {isPending ? 'Confirm in wallet...' : 'Sending...'}
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send USDC
              </>
            )}
          </button>

          {parseFloat(sendAmount) > numericBalance && sendAmount && (
            <p className="text-red-400 text-sm text-center">Insufficient balance</p>
          )}
        </div>
      </Modal>

      {/* Receive Modal */}
      <Modal isOpen={showReceive} onClose={() => setShowReceive(false)} title="Receive USDC">
        <div className="text-center">
          <div className="w-48 h-48 mx-auto mb-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-center">
            <div className="w-32 h-32 bg-white rounded-xl flex items-center justify-center">
              <QrCode className="w-16 h-16 text-[#111]" />
            </div>
          </div>

          <p className="text-white/40 text-sm mb-4">Share your address to receive USDC on Base</p>

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

          <p className="text-white/30 text-xs mt-4">Only send USDC on the <span className="text-[#ef4444]">Base</span> network</p>
        </div>
      </Modal>
    </div>
  )
}
