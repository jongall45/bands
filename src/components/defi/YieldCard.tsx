'use client'

import { useState } from 'react'
import { useWallets } from '@privy-io/react-auth'
import { usePorto } from '@/providers/PortoProvider'
import { useYield } from '@/hooks/useYield'
import { YieldVault, RISK_COLORS } from '@/lib/yield-vaults'
import { Loader2, TrendingUp, ArrowDownToLine, ArrowUpFromLine, Percent, Shield, AlertCircle } from 'lucide-react'

interface YieldCardProps {
  vault: YieldVault
}

export function YieldCard({ vault }: YieldCardProps) {
  const { wallets } = useWallets()
  const { isUpgraded } = usePorto()
  const privyWallet = wallets.find((w) => w.walletClientType === 'privy')
  
  const {
    deposit,
    withdraw,
    vaultBalance,
    tokenBalance,
    isLoading,
    error,
  } = useYield(vault, privyWallet?.address as `0x${string}` | undefined)

  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit')
  const [txId, setTxId] = useState<string | null>(null)

  const riskColors = RISK_COLORS[vault.risk]
  const hasDeposit = parseFloat(vaultBalance) > 0

  const handleAction = async () => {
    if (!amount || parseFloat(amount) <= 0) return

    try {
      const id = mode === 'deposit' 
        ? await deposit(amount)
        : await withdraw(amount)
      setTxId(id)
      setAmount('')
    } catch (err) {
      console.error(`${mode} failed:`, err)
    }
  }

  const maxAmount = mode === 'deposit' ? tokenBalance : vaultBalance

  return (
    <div className="bg-[#111111] border border-white/[0.06] rounded-2xl p-4 hover:border-white/[0.12] transition-all">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-xl flex items-center justify-center text-xl">
            {vault.protocolLogo}
          </div>
          <div>
            <h3 className="text-white font-medium">{vault.name}</h3>
            <p className="text-white/40 text-sm">{vault.protocol}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-1 text-green-400 font-semibold">
            <Percent className="w-3 h-3" />
            {vault.apy}% APY
          </div>
          <p className="text-white/40 text-xs">{vault.tvl} TVL</p>
        </div>
      </div>

      {/* Risk Badge */}
      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${riskColors.bg} ${riskColors.text} ${riskColors.border} border mb-4`}>
        <Shield className="w-3 h-3" />
        {vault.risk.charAt(0).toUpperCase() + vault.risk.slice(1)} Risk
      </div>

      {/* User Position */}
      {hasDeposit && (
        <div className="bg-white/[0.03] rounded-xl p-3 mb-4">
          <div className="flex justify-between items-center">
            <span className="text-white/50 text-sm">Your Position</span>
            <span className="text-white font-medium">
              {parseFloat(vaultBalance).toLocaleString(undefined, { maximumFractionDigits: 2 })} {vault.underlyingSymbol}
            </span>
          </div>
        </div>
      )}

      {/* Mode Toggle */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setMode('deposit')}
          className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${
            mode === 'deposit'
              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
              : 'bg-white/[0.03] text-white/50 hover:bg-white/[0.06]'
          }`}
        >
          <ArrowDownToLine className="w-4 h-4" />
          Deposit
        </button>
        <button
          onClick={() => setMode('withdraw')}
          disabled={!hasDeposit}
          className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-30 ${
            mode === 'withdraw'
              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
              : 'bg-white/[0.03] text-white/50 hover:bg-white/[0.06]'
          }`}
        >
          <ArrowUpFromLine className="w-4 h-4" />
          Withdraw
        </button>
      </div>

      {/* Amount Input */}
      <div className="bg-white/[0.03] rounded-xl p-3 mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-white/40 text-sm">Amount</span>
          <button
            onClick={() => setAmount(maxAmount)}
            className="text-[#ef4444] text-xs hover:text-[#dc2626] transition-colors"
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
            className="flex-1 bg-transparent text-white text-xl font-semibold outline-none"
          />
          <span className="text-white/50 font-medium">{vault.underlyingSymbol}</span>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm mb-4 bg-red-500/10 rounded-xl p-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Success Display */}
      {txId && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 mb-4">
          <p className="text-green-400 text-sm">
            {mode === 'deposit' ? 'Deposited' : 'Withdrawn'}! TX: {txId.slice(0, 10)}...
          </p>
        </div>
      )}

      {/* Action Button */}
      {!isUpgraded ? (
        <div className="text-center py-3">
          <p className="text-white/50 text-sm">Upgrade wallet to earn yield</p>
        </div>
      ) : (
        <button
          onClick={handleAction}
          disabled={isLoading || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > parseFloat(maxAmount)}
          className={`w-full py-3 font-semibold rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 ${
            mode === 'deposit'
              ? 'bg-green-500 hover:bg-green-600 text-white'
              : 'bg-red-500 hover:bg-red-600 text-white'
          }`}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              {mode === 'deposit' ? <ArrowDownToLine className="w-4 h-4" /> : <ArrowUpFromLine className="w-4 h-4" />}
              {mode === 'deposit' ? 'Deposit' : 'Withdraw'} {vault.underlyingSymbol}
            </>
          )}
        </button>
      )}

      <p className="text-white/30 text-xs text-center mt-3">
        1-click • Gas paid in USDC
      </p>
    </div>
  )
}

