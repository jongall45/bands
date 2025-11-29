'use client'

import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { formatUnits, parseUnits, isAddress } from 'viem'
import { base } from 'wagmi/chains'
import { USDC_ADDRESS, USDC_DECIMALS, ERC20_ABI } from '@/lib/wagmi'
import { 
  ArrowUpRight, ArrowDownLeft, Copy, Check, LogOut, 
  Send, QrCode, RefreshCw, Sparkles, X, ExternalLink,
  User, Settings, ChevronRight
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

  const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy')
  const address = embeddedWallet?.address as `0x${string}` | undefined

  // USDC Balance
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

  // Send USDC
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
          <p className="text-zinc-500">Loading your wallet...</p>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen px-6 py-8 max-w-lg mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-2xl font-semibold">
            <span className="text-emerald-400">bands</span>
            <span className="text-zinc-500">.cash</span>
          </h1>
          {user?.email?.address && (
            <p className="text-sm text-zinc-500 mt-1 flex items-center gap-1">
              <User className="w-3 h-3" />
              {user.email.address}
            </p>
          )}
        </div>
        <button
          onClick={logout}
          className="p-3 rounded-xl glass hover:bg-zinc-800/50 transition-colors group"
          title="Sign out"
        >
          <LogOut className="w-5 h-5 text-zinc-400 group-hover:text-zinc-200 transition-colors" />
        </button>
      </header>

      {/* Balance Card */}
      <div className="gradient-border rounded-3xl p-8 mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-500" />
            <span className="text-sm text-zinc-500">Total Balance</span>
          </div>
          <button 
            onClick={() => refetchBalance()}
            className="p-1.5 rounded-lg hover:bg-zinc-800/50 transition-colors"
            title="Refresh balance"
          >
            <RefreshCw className={`w-4 h-4 text-zinc-500 ${balanceLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        
        <div className="flex items-baseline gap-2 mb-6">
          {balanceLoading ? (
            <div className="h-12 w-48 shimmer rounded-lg" />
          ) : (
            <>
              <span className="text-5xl font-semibold font-mono balance-glow text-emerald-400">
                ${formattedBalance}
              </span>
              <span className="text-xl text-zinc-500">USDC</span>
            </>
          )}
        </div>

        {/* Wallet Address */}
        <button
          onClick={copyAddress}
          className="flex items-center gap-2 px-4 py-3 rounded-xl bg-zinc-900/50 hover:bg-zinc-800/50 
                     transition-colors group w-full border border-zinc-800/50"
        >
          <span className="text-sm text-zinc-400 font-mono truncate flex-1 text-left">
            {address?.slice(0, 10)}...{address?.slice(-8)}
          </span>
          {copied ? (
            <span className="flex items-center gap-1 text-emerald-500 text-sm">
              <Check className="w-4 h-4" />
              Copied
            </span>
          ) : (
            <Copy className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
          )}
        </button>

        {/* View on Explorer */}
        <a
          href={`https://basescan.org/address/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 mt-3 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          View on BaseScan
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <button
          onClick={() => setShowSend(true)}
          className="flex items-center justify-center gap-3 p-4 rounded-2xl bg-emerald-500 text-black 
                     font-semibold hover:bg-emerald-400 transition-all duration-200
                     hover:shadow-lg hover:shadow-emerald-500/20"
        >
          <ArrowUpRight className="w-5 h-5" />
          Send
        </button>
        <button
          onClick={() => setShowReceive(true)}
          className="flex items-center justify-center gap-3 p-4 rounded-2xl glass 
                     hover:bg-zinc-800/50 transition-all duration-200 border border-zinc-800/50
                     hover:border-zinc-700/50"
        >
          <ArrowDownLeft className="w-5 h-5 text-emerald-500" />
          Receive
        </button>
      </div>

      {/* Quick Actions */}
      <div className="glass rounded-2xl mb-6 overflow-hidden">
        <button className="w-full flex items-center justify-between p-4 hover:bg-zinc-800/30 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <Settings className="w-5 h-5 text-emerald-500" />
            </div>
            <span className="font-medium">Settings</span>
          </div>
          <ChevronRight className="w-5 h-5 text-zinc-500" />
        </button>
      </div>

      {/* Recent Activity */}
      <div className="glass rounded-2xl p-6">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          Recent Activity
          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">Coming soon</span>
        </h2>
        <div className="text-center py-8 text-zinc-500">
          <QrCode className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No transactions yet</p>
          <p className="text-xs mt-1 text-zinc-600">Send or receive USDC to get started</p>
        </div>
      </div>

      {/* Send Modal */}
      {showSend && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-4"
          onClick={() => !isPending && !isConfirming && setShowSend(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md glass rounded-3xl p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Send className="w-5 h-5 text-emerald-500" />
                Send USDC
              </h2>
              <button 
                onClick={() => !isPending && !isConfirming && setShowSend(false)}
                className="p-2 rounded-lg hover:bg-zinc-800/50 transition-colors"
                disabled={isPending || isConfirming}
              >
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-zinc-400 mb-2 block">Recipient Address</label>
                <input
                  type="text"
                  value={sendTo}
                  onChange={(e) => {
                    setSendTo(e.target.value)
                    validateAddress(e.target.value)
                  }}
                  placeholder="0x..."
                  disabled={isPending || isConfirming}
                  className="w-full px-4 py-3 rounded-xl bg-zinc-900/50 border border-zinc-800 
                             focus:border-emerald-500/50 focus:outline-none font-mono text-sm
                             disabled:opacity-50 disabled:cursor-not-allowed"
                />
                {addressError && (
                  <p className="text-red-400 text-xs mt-1">{addressError}</p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-zinc-400">Amount</label>
                  <button 
                    onClick={setMaxAmount}
                    className="text-xs text-emerald-500 hover:text-emerald-400 transition-colors"
                    disabled={isPending || isConfirming}
                  >
                    Max
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
                    className="w-full px-4 py-3 pr-20 rounded-xl bg-zinc-900/50 border border-zinc-800 
                               focus:border-emerald-500/50 focus:outline-none font-mono text-lg
                               disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 font-medium">
                    USDC
                  </span>
                </div>
                <p className="text-xs text-zinc-500 mt-2">
                  Available: <span className="text-zinc-400">${formattedBalance} USDC</span>
                </p>
              </div>

              <button
                onClick={handleSend}
                disabled={isPending || isConfirming || !sendTo || !sendAmount || !!addressError || parseFloat(sendAmount) > numericBalance}
                className="w-full py-4 rounded-xl bg-emerald-500 text-black font-semibold
                           hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed
                           transition-all duration-200 flex items-center justify-center gap-2
                           hover:shadow-lg hover:shadow-emerald-500/20"
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
          </div>
        </div>
      )}

      {/* Receive Modal */}
      {showReceive && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-4"
          onClick={() => setShowReceive(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md glass rounded-3xl p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <ArrowDownLeft className="w-5 h-5 text-emerald-500" />
                Receive USDC
              </h2>
              <button 
                onClick={() => setShowReceive(false)}
                className="p-2 rounded-lg hover:bg-zinc-800/50 transition-colors"
              >
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>

            <div className="text-center">
              {/* QR Code Placeholder */}
              <div className="w-48 h-48 mx-auto mb-6 rounded-2xl bg-white p-4 flex items-center justify-center">
                <div className="w-full h-full bg-zinc-100 rounded-xl flex items-center justify-center">
                  <QrCode className="w-20 h-20 text-zinc-400" />
                </div>
              </div>

              <p className="text-sm text-zinc-400 mb-4">
                Share your address to receive USDC on Base
              </p>

              <div className="bg-zinc-900/50 rounded-xl p-4 mb-4">
                <p className="font-mono text-sm text-zinc-300 break-all">
                  {address}
                </p>
              </div>

              <button
                onClick={() => {
                  copyAddress()
                  setShowReceive(false)
                }}
                className="w-full py-4 rounded-xl bg-emerald-500 text-black font-semibold
                           hover:bg-emerald-400 transition-all duration-200 flex items-center justify-center gap-2"
              >
                <Copy className="w-4 h-4" />
                Copy Address
              </button>

              <p className="text-xs text-zinc-600 mt-4">
                Only send USDC on the Base network to this address
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
