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
  Send, RefreshCw, X, ExternalLink,
  Home, CreditCard, PiggyBank, DollarSign, Plus, Wallet
} from 'lucide-react'

export default function Dashboard() {
  const { ready, authenticated, user, logout } = usePrivy()
  const { wallets } = useWallets()
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const [showSend, setShowSend] = useState(false)
  const [showReceive, setShowReceive] = useState(false)
  const [sendTo, setSendTo] = useState('')
  const [sendAmount, setSendAmount] = useState('')
  const [addressError, setAddressError] = useState('')
  const [activeNav, setActiveNav] = useState('home')

  const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy')
  const address = embeddedWallet?.address as `0x${string}` | undefined

  // Privy fiat onramp - supports Apple Pay, Google Pay, cards via MoonPay
  const { fundWallet } = useFundWallet()

  const handleAddFunds = async () => {
    if (!address) return
    try {
      await fundWallet({ address })
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
      <div className="min-h-screen bg-dark-gradient flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 neu-card flex items-center justify-center">
            <RefreshCw className="w-6 h-6 text-[#D32F2F] animate-spin" />
          </div>
          <p className="text-[#606060]">Loading your wallet...</p>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-dark-gradient pb-24">
      {/* Header */}
      <header className="px-6 py-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            <span className="text-[#D32F2F]">bands</span>
          </h1>
          {user?.email?.address && (
            <p className="text-xs text-[#606060] mt-1 font-mono">
              {user.email.address}
            </p>
          )}
        </div>
        <button
          onClick={logout}
          className="neu-button p-3 group"
          title="Sign out"
        >
          <LogOut className="w-5 h-5 text-[#606060] group-hover:text-white transition-colors" />
        </button>
      </header>

      {/* Balance Orb */}
      <div className="px-6 py-8">
        <div className="relative mx-auto w-64 h-64">
          {/* Outer glow ring */}
          <div className="absolute inset-0 rounded-full bg-[#D32F2F]/10 blur-xl" />
          
          {/* Main orb */}
          <div className="balance-orb absolute inset-4 rounded-full flex flex-col items-center justify-center">
            <span className="text-sm text-[#606060] mb-1">Total Balance</span>
            {balanceLoading ? (
              <div className="h-10 w-32 shimmer rounded-lg" />
            ) : (
              <span className="text-4xl font-bold font-mono text-white">
                ${formattedBalance}
              </span>
            )}
            <span className="text-sm text-[#D32F2F] mt-1 font-medium">USDC</span>
          </div>

          {/* Refresh button */}
          <button 
            onClick={() => refetchBalance()}
            className="absolute top-4 right-4 p-2 neu-button rounded-full"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 text-[#606060] ${balanceLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Wallet Address */}
      <div className="px-6 mb-8">
        <button
          onClick={copyAddress}
          className="w-full neu-pressed px-4 py-3 flex items-center justify-between group"
        >
          <span className="text-sm text-[#606060] font-mono truncate">
            {address?.slice(0, 12)}...{address?.slice(-10)}
          </span>
          {copied ? (
            <span className="flex items-center gap-1 text-[#69F0AE] text-sm">
              <Check className="w-4 h-4" />
            </span>
          ) : (
            <Copy className="w-4 h-4 text-[#606060] group-hover:text-white transition-colors" />
          )}
        </button>
        <a
          href={`https://basescan.org/address/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 mt-3 text-xs text-[#606060] hover:text-[#D32F2F] transition-colors"
        >
          View on BaseScan
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* Action Buttons */}
      <div className="px-6 grid grid-cols-3 gap-3 mb-8">
        {/* Add Funds - Primary CTA */}
        <button
          onClick={handleAddFunds}
          className="btn-bands-red py-4 flex flex-col items-center justify-center gap-2 font-semibold col-span-3"
        >
          <div className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Add Funds
          </div>
          <span className="text-xs opacity-80 font-normal">Apple Pay • Card • Crypto</span>
        </button>
        
        <button
          onClick={() => setShowSend(true)}
          className="neu-button py-4 flex flex-col items-center justify-center gap-1 font-semibold text-white"
        >
          <ArrowUpRight className="w-5 h-5 text-[#D32F2F]" />
          <span className="text-sm">Send</span>
        </button>
        <button
          onClick={() => setShowReceive(true)}
          className="neu-button py-4 flex flex-col items-center justify-center gap-1 font-semibold text-white"
        >
          <ArrowDownLeft className="w-5 h-5 text-[#69F0AE]" />
          <span className="text-sm">Receive</span>
        </button>
        <button
          onClick={handleAddFunds}
          className="neu-button py-4 flex flex-col items-center justify-center gap-1 font-semibold text-white"
        >
          <Wallet className="w-5 h-5 text-[#D32F2F]" />
          <span className="text-sm">Buy</span>
        </button>
      </div>

      {/* Transaction History Placeholder */}
      <div className="px-6">
        <div className="neu-card p-6">
          <h2 className="font-bold text-lg mb-4 text-white">Recent Activity</h2>
          <div className="text-center py-8">
            <div className="w-16 h-16 mx-auto mb-4 neu-pressed rounded-full flex items-center justify-center">
              <DollarSign className="w-8 h-8 text-[#606060]" />
            </div>
            <p className="text-[#606060] text-sm">No transactions yet</p>
            <p className="text-[#404040] text-xs mt-1">Send or receive to get started</p>
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <nav className="bottom-nav fixed bottom-0 left-0 right-0 px-6 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-around">
          {[
            { id: 'home', icon: Home, label: 'Home' },
            { id: 'send', icon: Send, label: 'Send' },
            { id: 'cards', icon: CreditCard, label: 'Cards' },
            { id: 'savings', icon: PiggyBank, label: 'Savings' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveNav(item.id)
                if (item.id === 'send') setShowSend(true)
              }}
              className={`nav-item relative flex flex-col items-center gap-1 p-2 ${
                activeNav === item.id ? 'active' : ''
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-xs">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Send Modal */}
      {showSend && (
        <div
          className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-4"
          onClick={() => !isPending && !isConfirming && setShowSend(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md neu-card p-6 animate-slide-in"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#D32F2F]/20 flex items-center justify-center">
                  <Send className="w-4 h-4 text-[#D32F2F]" />
                </div>
                Send USDC
              </h2>
              <button 
                onClick={() => !isPending && !isConfirming && setShowSend(false)}
                className="neu-button p-2"
                disabled={isPending || isConfirming}
              >
                <X className="w-5 h-5 text-[#606060]" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-[#606060] mb-2 block">Recipient Address</label>
                <input
                  type="text"
                  value={sendTo}
                  onChange={(e) => {
                    setSendTo(e.target.value)
                    validateAddress(e.target.value)
                  }}
                  placeholder="0x..."
                  disabled={isPending || isConfirming}
                  className="w-full px-4 py-3 neu-input font-mono text-sm"
                />
                {addressError && (
                  <p className="text-[#D32F2F] text-xs mt-1">{addressError}</p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-[#606060]">Amount</label>
                  <button 
                    onClick={setMaxAmount}
                    className="text-xs text-[#D32F2F] hover:text-[#E53935] transition-colors font-semibold"
                    disabled={isPending || isConfirming}
                  >
                    MAX
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    value={sendAmount}
                    onChange={(e) => setSendAmount(e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    disabled={isPending || isConfirming}
                    className="w-full px-4 py-3 pr-20 neu-input font-mono text-lg"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#606060] font-medium">
                    USDC
                  </span>
                </div>
                <p className="text-xs text-[#606060] mt-2">
                  Available: <span className="text-[#69F0AE]">${formattedBalance}</span>
                </p>
              </div>

              <button
                onClick={handleSend}
                disabled={isPending || isConfirming || !sendTo || !sendAmount || !!addressError || parseFloat(sendAmount) > numericBalance}
                className="w-full py-4 btn-bands-red font-semibold flex items-center justify-center gap-2
                           disabled:opacity-50 disabled:cursor-not-allowed"
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
                <p className="text-[#D32F2F] text-sm text-center">Insufficient balance</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Receive Modal */}
      {showReceive && (
        <div
          className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-4"
          onClick={() => setShowReceive(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md neu-card p-6 animate-slide-in"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#69F0AE]/20 flex items-center justify-center">
                  <ArrowDownLeft className="w-4 h-4 text-[#69F0AE]" />
                </div>
                Receive USDC
              </h2>
              <button 
                onClick={() => setShowReceive(false)}
                className="neu-button p-2"
              >
                <X className="w-5 h-5 text-[#606060]" />
              </button>
            </div>

            <div className="text-center">
              {/* QR Code Placeholder - Neumorphic */}
              <div className="w-48 h-48 mx-auto mb-6 neu-pressed rounded-2xl flex items-center justify-center">
                <div className="w-32 h-32 bg-white rounded-xl flex items-center justify-center">
                  <DollarSign className="w-16 h-16 text-[#D32F2F]" />
                </div>
              </div>

              <p className="text-sm text-[#606060] mb-4">
                Share your address to receive USDC on Base
              </p>

              <div className="neu-pressed rounded-xl p-4 mb-4">
                <p className="font-mono text-xs text-[#A0A0A0] break-all">
                  {address}
                </p>
              </div>

              <button
                onClick={() => {
                  copyAddress()
                  setShowReceive(false)
                }}
                className="w-full py-4 btn-bands-red font-semibold flex items-center justify-center gap-2"
              >
                <Copy className="w-4 h-4" />
                Copy Address
              </button>

              <p className="text-xs text-[#404040] mt-4">
                Only send USDC on the <span className="text-[#D32F2F]">Base</span> network
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
