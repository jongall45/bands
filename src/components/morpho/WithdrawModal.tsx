'use client'

import { useState } from 'react'
import { formatUnits } from 'viem'
import { X, Loader2, AlertCircle, Check, ArrowDown } from 'lucide-react'
import { useMorphoActions } from '@/hooks/useMorphoActions'
import { useVaultBalance, usePreviewRedeem } from '@/hooks/useMorphoVaults'
import type { MorphoVault } from '@/lib/morpho/api'

interface WithdrawModalProps {
  vault: MorphoVault
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function WithdrawModal({ vault, isOpen, onClose, onSuccess }: WithdrawModalProps) {
  const [percentage, setPercentage] = useState(100)
  const [isSuccess, setIsSuccess] = useState(false)

  // Get current vault position
  const vaultBalance = useVaultBalance(vault.address as `0x${string}`)

  // Calculate shares to withdraw based on percentage
  const sharesToWithdraw = vaultBalance.shares * BigInt(percentage) / BigInt(100)

  // Preview withdrawal
  const assetsToReceive = usePreviewRedeem(vault.address as `0x${string}`, sharesToWithdraw)
  const assetsFormatted = formatUnits(assetsToReceive, 6)

  // Withdraw action
  const { withdraw, isLoading } = useMorphoActions({
    vaultAddress: vault.address as `0x${string}`,
    onSuccess: () => {
      setIsSuccess(true)
      setTimeout(() => {
        onSuccess?.()
        onClose()
        setIsSuccess(false)
        setPercentage(100)
      }, 2000)
    },
  })

  const handleWithdraw = async () => {
    if (sharesToWithdraw <= BigInt(0)) return
    await withdraw(sharesToWithdraw)
  }

  const canWithdraw = sharesToWithdraw > BigInt(0)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-[430px] bg-[#0a0a0a] border border-white/[0.1] rounded-t-3xl sm:rounded-3xl p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-white font-semibold text-lg">Withdraw from {vault.name}</h2>
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
            <h3 className="text-white font-semibold text-lg mb-2">Withdrawal Successful!</h3>
            <p className="text-white/40 text-sm text-center">
              USDC has been returned to your wallet
            </p>
          </div>
        ) : (
          <>
            {/* Current Balance */}
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 mb-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-white/40 text-sm">Your deposit</span>
                <span className="text-white font-semibold">
                  ${parseFloat(vaultBalance.assetsFormatted).toFixed(2)} USDC
                </span>
              </div>
            </div>

            {/* Percentage Slider */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-white/40 text-sm">Withdraw amount</span>
                <span className="text-white font-medium">{percentage}%</span>
              </div>
              
              <input
                type="range"
                min="0"
                max="100"
                value={percentage}
                onChange={(e) => setPercentage(parseInt(e.target.value))}
                className="w-full h-2 bg-white/[0.1] rounded-full appearance-none cursor-pointer
                  [&::-webkit-slider-thumb]:appearance-none
                  [&::-webkit-slider-thumb]:w-5
                  [&::-webkit-slider-thumb]:h-5
                  [&::-webkit-slider-thumb]:bg-[#ef4444]
                  [&::-webkit-slider-thumb]:rounded-full
                  [&::-webkit-slider-thumb]:cursor-pointer"
              />

              {/* Quick percentages */}
              <div className="flex items-center gap-2 mt-3">
                {[25, 50, 75, 100].map((pct) => (
                  <button
                    key={pct}
                    onClick={() => setPercentage(pct)}
                    className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                      percentage === pct
                        ? 'bg-[#ef4444] text-white'
                        : 'bg-white/[0.05] text-white/60 hover:bg-white/[0.08]'
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            {/* Arrow */}
            <div className="flex justify-center my-3">
              <div className="w-10 h-10 bg-white/[0.05] rounded-full flex items-center justify-center">
                <ArrowDown className="w-5 h-5 text-white/40" />
              </div>
            </div>

            {/* Amount to Receive */}
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 mb-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-white/40 text-sm">You&apos;ll receive</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-white text-3xl font-medium">
                  {parseFloat(assetsFormatted).toFixed(2)}
                </span>
                <div className="bg-[#ef4444] rounded-xl px-3 py-1.5">
                  <span className="text-white font-semibold text-sm">USDC</span>
                </div>
              </div>
            </div>

            {/* Info Notice */}
            <div className="flex items-start gap-2 mb-6">
              <AlertCircle className="w-4 h-4 text-white/30 mt-0.5 flex-shrink-0" />
              <p className="text-white/30 text-xs">
                Withdrawals are instant when liquidity is available. 
                During high demand, there may be a short delay.
              </p>
            </div>

            {/* Withdraw Button */}
            <button
              onClick={handleWithdraw}
              disabled={!canWithdraw || isLoading}
              className="w-full py-4 bg-[#ef4444] hover:bg-[#dc2626] disabled:bg-[#ef4444]/30 disabled:cursor-not-allowed text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Withdrawing...
                </>
              ) : !canWithdraw ? (
                'Nothing to withdraw'
              ) : (
                `Withdraw $${parseFloat(assetsFormatted).toFixed(2)} USDC`
              )}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

