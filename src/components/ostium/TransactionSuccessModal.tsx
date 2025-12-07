'use client'

import { CheckCircle, ExternalLink, X } from 'lucide-react'

interface TransactionSuccessModalProps {
  isOpen: boolean
  onClose: () => void
  txHash: string
  pairSymbol: string
  isLong: boolean
  collateral: string
  leverage: number
  entryPrice: number
}

export function TransactionSuccessModal({
  isOpen,
  onClose,
  txHash,
  pairSymbol,
  isLong,
  collateral,
  leverage,
  entryPrice,
}: TransactionSuccessModalProps) {
  if (!isOpen) return null

  const positionSize = parseFloat(collateral) * leverage

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-[#0f0f0f] border border-white/10 rounded-2xl max-w-sm w-full mx-4 overflow-hidden">
        {/* Success Header */}
        <div className={`p-6 text-center ${isLong ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
          <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${
            isLong ? 'bg-green-500/20' : 'bg-red-500/20'
          }`}>
            <CheckCircle className={`w-10 h-10 ${isLong ? 'text-green-400' : 'text-red-400'}`} />
          </div>
          <h2 className="text-xl font-bold text-white">Trade Executed!</h2>
          <p className="text-white/60 text-sm mt-1">Your position is now open</p>
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/40 hover:text-white/60 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Trade Details */}
        <div className="p-6 space-y-4">
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-white/40 text-sm">Position</span>
              <span className={`font-semibold ${isLong ? 'text-green-400' : 'text-red-400'}`}>
                {isLong ? 'Long' : 'Short'} {pairSymbol.split('-')[0]}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/40 text-sm">Size</span>
              <span className="text-white font-mono">${positionSize.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/40 text-sm">Collateral</span>
              <span className="text-white font-mono">${parseFloat(collateral).toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/40 text-sm">Leverage</span>
              <span className="text-white font-mono">{leverage}x</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/40 text-sm">Entry Price</span>
              <span className="text-white font-mono">${entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>

          {/* View on Explorer */}
          <a
            href={`https://arbiscan.io/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl text-white/60 hover:text-white text-sm font-medium transition-all"
          >
            <ExternalLink className="w-4 h-4" />
            View on Arbiscan
          </a>

          {/* Done Button */}
          <button
            onClick={onClose}
            className={`w-full py-4 rounded-xl font-semibold text-white transition-all ${
              isLong ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'
            }`}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
