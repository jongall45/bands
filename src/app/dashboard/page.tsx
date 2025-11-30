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
  Send, RefreshCw, X, ExternalLink, Plus, Wallet,
  Home, QrCode, Settings
} from 'lucide-react'
import { Logo } from '@/components/ui/Logo'
import { Button } from '@/components/ui/Button'
import { Card, CardInner } from '@/components/ui/Card'
import { Modal } from '@/components/ui/Modal'

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

  const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy')
  const address = embeddedWallet?.address as `0x${string}` | undefined

  // Privy fiat onramp
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
          <div className="w-12 h-12 rounded-2xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center">
            <RefreshCw className="w-6 h-6 text-[#ef4444] animate-spin" />
          </div>
          <p className="text-white/40">Loading your wallet...</p>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-black pb-32">
      {/* Header */}
      <header className="px-6 py-6 flex items-center justify-between">
        <Logo size="md" />
        <button
          onClick={logout}
          className="p-3 rounded-full bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.1] transition-all"
          title="Sign out"
        >
          <LogOut className="w-5 h-5 text-white/40 hover:text-white transition-colors" strokeWidth={1.5} />
        </button>
      </header>

      {/* Balance Display */}
      <div className="px-6 py-12">
        <div className="text-center">
          <p className="text-white/40 text-sm mb-3">Total Balance</p>
          {balanceLoading ? (
            <div className="h-16 w-48 mx-auto shimmer rounded-2xl" />
          ) : (
            <h1 className="text-6xl md:text-7xl font-semibold text-white tracking-tight font-mono">
              ${formattedBalance}
            </h1>
          )}
          <p className="text-[#ef4444] text-sm mt-3 font-medium">USDC on Base</p>
          
          {/* Refresh */}
          <button 
            onClick={() => refetchBalance()}
            className="mt-4 p-2 rounded-full hover:bg-white/[0.05] transition-colors inline-flex"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 text-white/40 ${balanceLoading ? 'animate-spin' : ''}`} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Wallet Address */}
      <div className="px-6 mb-8">
        <button
          onClick={copyAddress}
          className="w-full bg-white/[0.02] border border-white/[0.06] rounded-2xl px-5 py-4 flex items-center justify-between hover:bg-white/[0.04] hover:border-white/[0.1] transition-all group"
        >
          <span className="text-white/50 font-mono text-sm">
            {address?.slice(0, 12)}...{address?.slice(-10)}
          </span>
          {copied ? (
            <span className="flex items-center gap-2 text-[#22c55e] text-sm">
              <Check className="w-4 h-4" />
              Copied
            </span>
          ) : (
            <Copy className="w-4 h-4 text-white/30 group-hover:text-white/60 transition-colors" strokeWidth={1.5} />
          )}
        </button>
        <a
          href={`https://basescan.org/address/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 mt-3 text-xs text-white/30 hover:text-white/60 transition-colors"
        >
          View on BaseScan
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* Action Buttons */}
      <div className="px-6 space-y-3 mb-8">
        {/* Add Funds - Primary CTA */}
        <Button
          variant="primary"
          size="lg"
          onClick={handleAddFunds}
          className="w-full flex-col gap-1 py-5"
        >
          <span className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Add Funds
          </span>
          <span className="text-xs opacity-70 font-normal">Apple Pay • Card • Crypto</span>
        </Button>
        
        {/* Secondary Actions */}
        <div className="grid grid-cols-3 gap-3">
          <Button
            variant="secondary"
            onClick={() => setShowSend(true)}
            className="flex-col gap-2 py-4"
          >
            <ArrowUpRight className="w-5 h-5 text-[#ef4444]" strokeWidth={1.5} />
            <span className="text-sm">Send</span>
          </Button>
          <Button
            variant="secondary"
            onClick={() => setShowReceive(true)}
            className="flex-col gap-2 py-4"
          >
            <ArrowDownLeft className="w-5 h-5 text-[#22c55e]" strokeWidth={1.5} />
            <span className="text-sm">Receive</span>
          </Button>
          <Button
            variant="secondary"
            onClick={handleAddFunds}
            className="flex-col gap-2 py-4"
          >
            <Wallet className="w-5 h-5 text-[#ef4444]" strokeWidth={1.5} />
            <span className="text-sm">Buy</span>
          </Button>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="px-6">
        <Card variant="default" className="p-6">
          <h2 className="font-semibold text-lg mb-4 text-white">Recent Activity</h2>
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
              <Send className="w-7 h-7 text-white/20" strokeWidth={1.5} />
            </div>
            <p className="text-white/40 text-sm">No transactions yet</p>
            <p className="text-white/20 text-xs mt-1">Send or receive to get started</p>
          </div>
        </Card>
      </div>

      {/* Bottom Navigation - Floating Pill */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
        <nav className="flex items-center gap-1 p-2 bg-[#111]/90 backdrop-blur-xl border border-white/[0.08] rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
          {[
            { icon: Home, label: 'Home', active: true },
            { icon: Send, label: 'Send', onClick: () => setShowSend(true) },
            { icon: QrCode, label: 'Receive', onClick: () => setShowReceive(true) },
            { icon: Wallet, label: 'Wallet' },
            { icon: Settings, label: 'Settings' },
          ].map((item, i) => (
            <button
              key={i}
              onClick={item.onClick}
              className={`relative p-3 rounded-full transition-all duration-200 ${
                item.active 
                  ? 'bg-white/[0.1] text-white' 
                  : 'text-white/40 hover:text-white/70 hover:bg-white/[0.05]'
              }`}
              title={item.label}
            >
              <item.icon className="w-5 h-5" strokeWidth={item.active ? 2 : 1.5} />
              {item.active && (
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-white rounded-full" />
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Send Modal */}
      <Modal isOpen={showSend} onClose={() => !isPending && !isConfirming && setShowSend(false)} title="Send USDC">
        <div className="space-y-5">
          {/* Recipient */}
          <div>
            <label className="block text-white/40 text-sm mb-2 font-medium">Recipient Address</label>
            <div className={`
              bg-white/[0.03] rounded-2xl border transition-all duration-200
              ${addressError ? 'border-red-500/50' : 'border-white/[0.06] focus-within:border-white/20'}
            `}>
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

          {/* Amount */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-white/40 text-sm font-medium">Amount</label>
              <button 
                onClick={setMaxAmount}
                className="text-xs text-[#ef4444] hover:text-[#dc2626] font-semibold transition-colors"
                disabled={isPending || isConfirming}
              >
                MAX
              </button>
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
              <p className="text-white/40 text-sm mt-3">
                Balance: <span className="text-white/60">${formattedBalance}</span>
              </p>
            </CardInner>
          </div>

          {/* Send Button */}
          <Button
            variant="primary"
            size="lg"
            onClick={handleSend}
            disabled={isPending || isConfirming || !sendTo || !sendAmount || !!addressError || parseFloat(sendAmount) > numericBalance}
            isLoading={isPending || isConfirming}
            className="w-full"
          >
            {isPending ? 'Confirm in wallet...' : isConfirming ? 'Sending...' : 'Send USDC'}
          </Button>

          {parseFloat(sendAmount) > numericBalance && sendAmount && (
            <p className="text-red-400 text-sm text-center">Insufficient balance</p>
          )}
        </div>
      </Modal>

      {/* Receive Modal */}
      <Modal isOpen={showReceive} onClose={() => setShowReceive(false)} title="Receive USDC">
        <div className="text-center">
          {/* QR Placeholder */}
          <div className="w-48 h-48 mx-auto mb-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-center">
            <div className="w-32 h-32 bg-white rounded-xl flex items-center justify-center">
              <QrCode className="w-16 h-16 text-[#111]" />
            </div>
          </div>

          <p className="text-white/40 text-sm mb-4">
            Share your address to receive USDC on Base
          </p>

          <CardInner className="p-4 mb-4">
            <p className="font-mono text-xs text-white/60 break-all">
              {address}
            </p>
          </CardInner>

          <Button
            variant="primary"
            size="lg"
            onClick={() => {
              copyAddress()
              setShowReceive(false)
            }}
            className="w-full"
          >
            <Copy className="w-4 h-4" />
            Copy Address
          </Button>

          <p className="text-white/30 text-xs mt-4">
            Only send USDC on the <span className="text-[#ef4444]">Base</span> network
          </p>
        </div>
      </Modal>
    </main>
  )
}
