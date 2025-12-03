'use client'

import { useState } from 'react'
import { useAccount, useBalance } from 'wagmi'
import { X, Loader2, TrendingUp, AlertCircle, Check } from 'lucide-react'
import { useMorphoActions } from '@/hooks/useMorphoActions'
import { useVaultBalance } from '@/hooks/useMorphoVaults'
import { calculateProjectedEarnings, type MorphoVault } from '@/lib/morpho/api'
import { USDC_BASE } from '@/lib/morpho/constants'
import { base } from 'viem/chains'

interface DepositModalProps {
  vault: MorphoVault
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function DepositModal({ vault, isOpen, onClose, onSuccess }: DepositModalProps) {
  const { address } = useAccount()
  const [amount, setAmount] = useState('')
  const [isSuccess, setIsSuccess] = useState(false)

  // Get USDC balance
  const { data: usdcBalance } = useBalance({
    address,
    token: USDC_BASE,
    chainId: base.id,
  })

  // Get current vault position
  const vaultBalance = useVaultBalance(vault.address as `0x${string}`)

  // Deposit action
  const { deposit, isLoading } = useMorphoActions({
    vaultAddress: vault.address as `0x${string}`,
    onSuccess: () => {
      setIsSuccess(true)
      setTimeout(() => {
        onSuccess?.()
        onClose()
        setIsSuccess(false)
        setAmount('')
      }, 2000)
    },
  })

  // Calculate projections
  const apyPercent = vault.state.netApy * 100
  const amountNum = parseFloat(amount) || 0
  const dailyEarnings = calculateProjectedEarnings(amountNum, apyPercent, 1)
  const monthlyEarnings = calculateProjectedEarnings(amountNum, apyPercent, 30)
  const yearlyEarnings = calculateProjectedEarnings(amountNum, apyPercent, 365)

  const handleMax = () => {
    if (usdcBalance) {
      setAmount(usdcBalance.formatted)
    }
  }

  const handleDeposit = async () => {
    if (!amount || parseFloat(amount) <= 0) return
    await deposit(amount)
  }

  const canDeposit = amount && parseFloat(amount) > 0 && 
    usdcBalance && parseFloat(amount) <= parseFloat(usdcBalance.formatted)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-[430px] bg-[#0a0a0a] border border-white/[0.1] rounded-t-3xl sm:rounded-3xl p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-white font-semibold text-lg">Deposit to {vault.name}</h2>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/[0.05] rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>

        {/* Success State */}
        {isSuccess ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mb-4">
              <Check className="w-8 h-8 text-green-400" />
            </div>
            <h3 className="text-white font-semibold text-lg mb-2">Deposit Successful!</h3>
            <p className="text-white/40 text-sm text-center">
              Your USDC is now earning {apyPercent.toFixed(2)}% APY
            </p>
          </div>
        ) : (
          <>
            {/* Amount Input */}
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white/40 text-sm">Amount</span>
                <button 
                  onClick={handleMax}
                  className="text-[#ef4444] text-xs font-medium hover:underline"
                >
                  Max: {usdcBalance ? parseFloat(usdcBalance.formatted).toFixed(2) : '0'} USDC
                </button>
              </div>
              
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="flex-1 bg-transparent text-white text-3xl font-medium outline-none placeholder:text-white/20"
                />
                <div className="bg-[#ef4444] rounded-xl px-4 py-2 flex items-center gap-2">
                  <span className="text-white font-bold text-sm">$</span>
                  <span className="text-white font-semibold">USDC</span>
                </div>
              </div>

              <p className="text-white/30 text-sm mt-2">
                ≈ ${amountNum.toFixed(2)} USD
              </p>
            </div>

            {/* APY Info */}
            <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4 mb-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-5 h-5 text-green-400" />
                <span className="text-green-400 font-semibold">{apyPercent.toFixed(2)}% APY</span>
              </div>

              {amountNum > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-green-400/60 text-sm">Daily earnings</span>
                    <span className="text-green-400 text-sm">+${dailyEarnings.toFixed(4)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-green-400/60 text-sm">Monthly earnings</span>
                    <span className="text-green-400 text-sm">+${monthlyEarnings.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-green-400/60 text-sm">Yearly earnings</span>
                    <span className="text-green-400 font-medium">+${yearlyEarnings.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Current Position */}
            {vaultBalance.assets > BigInt(0) && (
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 mb-4">
                <div className="flex items-center justify-between">
                  <span className="text-white/40 text-sm">Current deposit</span>
                  <span className="text-white font-medium">
                    ${parseFloat(vaultBalance.assetsFormatted).toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* Info Notice */}
            <div className="flex items-start gap-2 mb-6">
              <AlertCircle className="w-4 h-4 text-white/30 mt-0.5 flex-shrink-0" />
              <p className="text-white/30 text-xs">
                Deposits earn variable yield from overcollateralized lending. 
                You can withdraw anytime when liquidity is available.
              </p>
            </div>

            {/* Deposit Button */}
            <button
              onClick={handleDeposit}
              disabled={!canDeposit || isLoading}
              className="w-full py-4 bg-[#ef4444] hover:bg-[#dc2626] disabled:bg-[#ef4444]/30 disabled:cursor-not-allowed text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Depositing...
                </>
              ) : !amount || parseFloat(amount) <= 0 ? (
                'Enter amount'
              ) : (
                `Deposit $${amountNum.toFixed(2)} USDC`
              )}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

