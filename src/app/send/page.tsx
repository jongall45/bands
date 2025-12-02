'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount, useSendTransaction, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { encodeFunctionData, parseUnits, formatUnits, isAddress } from 'viem'
import { base } from 'wagmi/chains'
import { USDC_ADDRESS, USDC_DECIMALS, ERC20_ABI } from '@/lib/wagmi'
import { ArrowLeft, Loader2, Check, AlertCircle } from 'lucide-react'
import Link from 'next/link'

export default function SendPage() {
  const router = useRouter()
  const { address, isConnected } = useAccount()
  const { sendTransaction, data: txHash, isPending } = useSendTransaction()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Fetch USDC balance
  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: base.id,
  })

  const formattedBalance = usdcBalance
    ? parseFloat(formatUnits(usdcBalance, USDC_DECIMALS)).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : '0.00'

  const numericBalance = usdcBalance
    ? parseFloat(formatUnits(usdcBalance, USDC_DECIMALS))
    : 0

  useEffect(() => {
    if (!isConnected) {
      router.push('/')
    }
  }, [isConnected, router])

  // Redirect on success
  useEffect(() => {
    if (isSuccess) {
      setTimeout(() => router.push('/dashboard'), 2000)
    }
  }, [isSuccess, router])

  const handleSend = async () => {
    if (!recipient || !amount) return

    setError(null)

    if (!isAddress(recipient)) {
      setError('Invalid address format')
      return
    }

    if (parseFloat(amount) > numericBalance) {
      setError('Insufficient balance')
      return
    }

    try {
      const amountWei = parseUnits(amount, USDC_DECIMALS)

      sendTransaction({
        to: USDC_ADDRESS,
        data: encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [recipient as `0x${string}`, amountWei],
        }),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transfer failed')
    }
  }

  if (!isConnected) {
    return null
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-[#F4F4F5] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-500" />
          </div>
          <h2 className="text-gray-900 text-xl font-semibold mb-2">Sent!</h2>
          <p className="text-gray-500">Redirecting to dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F4F4F5]">
      {/* Grain overlay */}
      <div className="fixed inset-0 pointer-events-none z-[10000] opacity-[0.08] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
        }}
      />

      {/* Red auras */}
      <div className="fixed w-[800px] h-[800px] -top-[250px] -left-[200px] bg-[#FF3B30] rounded-full blur-[150px] opacity-50 z-0" />
      <div className="fixed w-[700px] h-[700px] -bottom-[200px] -right-[150px] bg-[#D70015] rounded-full blur-[140px] opacity-45 z-0" />

      <div className="max-w-[430px] mx-auto relative z-10">
        {/* Header */}
        <header className="px-5 py-4 flex items-center gap-4">
          <Link href="/dashboard" className="text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-gray-900 font-semibold text-lg">Send USDC</h1>
        </header>

        <div className="p-5 space-y-5">
          {/* Amount Input */}
          <div className="bg-[#111] border border-white/[0.06] rounded-3xl p-6 relative overflow-hidden">
            {/* Red gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#FF3B30]/25 via-[#FF3B30]/10 to-transparent pointer-events-none" />
            
            <div className="relative z-10">
              <label className="text-white/40 text-sm mb-2 block">Amount</label>
              <div className="flex items-center gap-2">
                <span className="text-white/40 text-3xl">$</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="flex-1 bg-transparent text-white text-4xl font-bold outline-none placeholder:text-white/20"
                />
              </div>
              <div className="flex items-center justify-between mt-3">
                <p className="text-white/30 text-sm">USDC on Base</p>
                <button
                  onClick={() => setAmount(numericBalance.toString())}
                  className="text-[#ef4444] text-sm font-medium hover:text-[#dc2626]"
                >
                  Max: ${formattedBalance}
                </button>
              </div>
            </div>
          </div>

          {/* Recipient Input */}
          <div className="bg-[#111] border border-white/[0.06] rounded-3xl p-5 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-[#FF3B30]/25 via-[#FF3B30]/10 to-transparent pointer-events-none" />
            
            <div className="relative z-10">
              <label className="text-white/40 text-sm mb-2 block">Recipient Address</label>
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="0x..."
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-2xl px-4 py-3 text-white font-mono text-sm outline-none focus:border-white/20 placeholder:text-white/30"
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Send Button */}
          <button
            onClick={handleSend}
            disabled={isPending || isConfirming || !recipient || !amount}
            className="w-full py-4 bg-[#ef4444] hover:bg-[#dc2626] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2"
          >
            {isPending || isConfirming ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {isPending ? 'Confirm in wallet...' : 'Sending...'}
              </>
            ) : (
              'Send USDC'
            )}
          </button>

          <p className="text-gray-400 text-xs text-center">
            Gas paid in USDC • No ETH needed
          </p>
        </div>
      </div>
    </div>
  )
}

