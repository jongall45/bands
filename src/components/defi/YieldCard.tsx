'use client'

import { useState } from 'react'
import { useWallets } from '@privy-io/react-auth'
import { useYield } from '@/hooks/useYield'
import { YieldVault, RISK_COLORS } from '@/lib/yield-vaults'
import { RefreshCw, ArrowDownToLine, ArrowUpFromLine, TrendingUp, Shield, AlertCircle } from 'lucide-react'

interface YieldCardProps {
  vault: YieldVault
}

export function YieldCard({ vault }: YieldCardProps) {
  const { wallets } = useWallets()
  const privyWallet = wallets.find((w) => w.walletClientType === 'privy')
  
  const {
    deposit,
    withdraw,
    vaultBalance,
    tokenBalance,
    isLoading,
    error,
    step,
  } = useYield(vault, privyWallet?.address as `0x${string}` | undefined)

  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit')
  const [txSuccess, setTxSuccess] = useState(false)

  const riskColors = RISK_COLORS[vault.risk]
  const hasDeposit = parseFloat(vaultBalance) > 0

  const handleAction = async () => {
    if (!amount || parseFloat(amount) <= 0) return

    try {
      setTxSuccess(false)
      if (mode === 'deposit') {
        await deposit(amount)
      } else {
        await withdraw(amount)
      }
      setTxSuccess(true)
      setAmount('')
      setTimeout(() => setTxSuccess(false), 3000)
    } catch (err) {
      console.error(`${mode} failed:`, err)
    }
  }

  const maxAmount = mode === 'deposit' ? tokenBalance : vaultBalance

  const getButtonText = () => {
    if (isLoading) {
      if (step === 'approving') return 'Approving...'
      if (step === 'depositing') return 'Depositing...'
      if (step === 'withdrawing') return 'Withdrawing...'
      return 'Processing...'
    }
    return mode === 'deposit' ? `Deposit ${vault.underlyingSymbol}` : `Withdraw ${vault.underlyingSymbol}`
  }

  return (
    <div className="defi-card bg-[#111111] border border-white/[0.06] rounded-3xl p-5 relative overflow-hidden">
      {/* Red gradient fade from top-left */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#FF3B30]/20 via-[#FF3B30]/5 to-transparent pointer-events-none" />
      
      {/* Content wrapper with z-index */}
      <div className="relative z-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-white/[0.05] rounded-2xl flex items-center justify-center text-xl">
            {vault.protocolLogo}
          </div>
          <div>
            <h3 className="text-white font-semibold">{vault.name}</h3>
            <p className="text-white/40 text-sm">{vault.protocol}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-1 text-[#22c55e] font-semibold">
            <TrendingUp className="w-4 h-4" />
            {vault.apy}% APY
          </div>
          <p className="text-white/40 text-xs">{vault.tvl} TVL</p>
        </div>
      </div>

      {/* Risk Badge */}
      <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium ${riskColors.bg} ${riskColors.text} border ${riskColors.border} mb-4`}>
        <Shield className="w-3 h-3" />
        {vault.risk.charAt(0).toUpperCase() + vault.risk.slice(1)} Risk
      </div>

      {/* Position Display */}
      {hasDeposit && (
        <div className="bg-white/[0.02] rounded-2xl p-4 mb-4 border border-white/[0.04]">
          <div className="flex justify-between items-center">
            <span className="text-white/50 text-sm">Your Position</span>
            <span className="text-white font-semibold">
              {parseFloat(vaultBalance).toLocaleString(undefined, { maximumFractionDigits: 2 })} {vault.underlyingSymbol}
            </span>
          </div>
        </div>
      )}

      {/* Mode Toggle */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setMode('deposit')}
          className={`flex-1 py-3 rounded-2xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${
            mode === 'deposit'
              ? 'bg-[#ef4444] text-white shadow-[0_0_15px_rgba(239,68,68,0.2)]'
              : 'bg-white/[0.03] text-white/50 hover:bg-white/[0.06] border border-white/[0.06]'
          }`}
        >
          <ArrowDownToLine className="w-4 h-4" />
          Deposit
        </button>
        <button
          onClick={() => setMode('withdraw')}
          disabled={!hasDeposit}
          className={`flex-1 py-3 rounded-2xl text-sm font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-30 ${
            mode === 'withdraw'
              ? 'bg-white/[0.1] text-white border border-white/[0.1]'
              : 'bg-white/[0.03] text-white/50 hover:bg-white/[0.06] border border-white/[0.06]'
          }`}
        >
          <ArrowUpFromLine className="w-4 h-4" />
          Withdraw
        </button>
      </div>

      {/* Amount Input */}
      <div className="bg-white/[0.02] rounded-2xl p-4 mb-4 border border-white/[0.04]">
        <div className="flex justify-between items-center mb-2">
          <span className="text-white/40 text-sm">Amount</span>
          <button
            onClick={() => setAmount(maxAmount)}
            className="text-[#ef4444] text-xs hover:text-[#dc2626] transition-colors font-medium"
          >
            Max: {parseFloat(maxAmount).toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="flex-1 bg-transparent text-white text-2xl font-semibold outline-none"
          />
          <span className="text-white/50 font-medium">{vault.underlyingSymbol}</span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm mb-4 bg-red-500/10 rounded-2xl p-4 border border-red-500/20">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Success */}
      {txSuccess && (
        <div className="bg-[#22c55e]/10 border border-[#22c55e]/20 rounded-2xl p-4 mb-4">
          <p className="text-[#22c55e] text-sm font-medium">
            {mode === 'deposit' ? 'Deposited' : 'Withdrawn'} successfully! ✓
          </p>
        </div>
      )}

      {/* Action Button */}
      <button
        onClick={handleAction}
        disabled={isLoading || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > parseFloat(maxAmount)}
        className="w-full py-4 bg-[#ef4444] hover:bg-[#dc2626] disabled:bg-white/10 disabled:text-white/30 text-white font-semibold rounded-2xl transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(239,68,68,0.2)]"
      >
        {isLoading ? (
          <>
            <RefreshCw className="w-4 h-4 animate-spin" />
            {getButtonText()}
          </>
        ) : (
          <>
            {mode === 'deposit' ? <ArrowDownToLine className="w-4 h-4" /> : <ArrowUpFromLine className="w-4 h-4" />}
            {getButtonText()}
          </>
        )}
      </button>

      <p className="text-white/30 text-xs text-center mt-3">
        Requires ETH for gas
      </p>
      </div>
    </div>
  )
}
