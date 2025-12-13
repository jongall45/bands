'use client'

import { CheckCircle, ExternalLink, TrendingUp, TrendingDown } from 'lucide-react'
import Image from 'next/image'

const ASSET_ICONS: Record<string, string> = {
  BTC: 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png',
  ETH: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
  SOL: 'https://assets.coingecko.com/coins/images/4128/small/solana.png',
  USDC: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
}

interface CloseSuccessModalProps {
  isOpen: boolean
  onClose: () => void
  txHash: string
  pairSymbol: string
  isLong: boolean
  collateral: number
  leverage: number
  entryPrice: number
  exitPrice: number
  pnl: number
  pnlPercent: number
}

export function CloseSuccessModal({
  isOpen,
  onClose,
  txHash,
  pairSymbol,
  isLong,
  collateral,
  leverage,
  entryPrice,
  exitPrice,
  pnl,
  pnlPercent,
}: CloseSuccessModalProps) {
  if (!isOpen) return null

  const asset = pairSymbol.split('-')[0]
  const positionSize = collateral * leverage
  const assetIcon = ASSET_ICONS[asset] || ASSET_ICONS.BTC
  const isProfitable = pnl >= 0

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      {/* Compact Modal */}
      <div className="relative bg-[#141414] border border-white/10 rounded-2xl w-full max-w-xs overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
        {/* Header */}
        <div className={`px-4 py-3 flex items-center gap-3 ${isProfitable ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center overflow-hidden">
              <Image src={assetIcon} alt={asset} width={32} height={32} />
            </div>
            <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center bg-white/20`}>
              <CheckCircle className="w-3 h-3 text-white" />
            </div>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <CheckCircle className={`w-4 h-4 ${isProfitable ? 'text-green-400' : 'text-red-400'}`} />
              <span className="text-white font-semibold text-sm">Position Closed</span>
            </div>
            <p className="text-white/60 text-xs">
              {leverage}x {isLong ? 'Long' : 'Short'} {asset}
            </p>
          </div>
        </div>

        {/* PNL Banner */}
        <div className={`px-4 py-3 ${isProfitable ? 'bg-green-500/5' : 'bg-red-500/5'} border-b border-white/5`}>
          <div className="flex items-center justify-between">
            <span className="text-white/40 text-xs">Realized P&L</span>
            <div className="text-right">
              <span className={`font-mono font-bold text-lg ${isProfitable ? 'text-green-400' : 'text-red-400'}`}>
                {isProfitable ? '+' : '-'}${Math.abs(pnl).toFixed(2)}
              </span>
              <span className={`ml-2 text-xs font-medium ${isProfitable ? 'text-green-400/70' : 'text-red-400/70'}`}>
                {isProfitable ? '+' : ''}{pnlPercent.toFixed(2)}%
              </span>
            </div>
          </div>
        </div>

        {/* Trade Details */}
        <div className="px-4 py-3 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-white/40">Size</span>
            <span className="text-white font-mono">${positionSize.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-white/40">Collateral</span>
            <div className="flex items-center gap-1">
              <Image src={ASSET_ICONS.USDC} alt="USDC" width={12} height={12} className="rounded-full" />
              <span className="text-white font-mono">${collateral.toFixed(2)}</span>
            </div>
          </div>
          <div className="h-px bg-white/5 my-1" />
          <div className="flex justify-between text-xs">
            <span className="text-white/40">Entry</span>
            <span className="text-white font-mono">${entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-white/40">Exit</span>
            <span className={`font-mono ${isProfitable ? 'text-green-400' : 'text-red-400'}`}>
              ${exitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 pb-4 flex gap-2">
          <a
            href={`https://arbiscan.io/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl text-white/60 hover:text-white text-xs font-medium transition-all"
          >
            <ExternalLink className="w-3 h-3" />
            Arbiscan
          </a>
          <button
            onClick={onClose}
            className={`flex-1 py-2.5 rounded-xl font-semibold text-white text-sm transition-all ${
              isProfitable ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'
            }`}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
