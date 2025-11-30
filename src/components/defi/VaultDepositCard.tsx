'use client'

import { useState } from 'react'
import { useWallets } from '@privy-io/react-auth'
import { usePorto } from '@/providers/PortoProvider'
import { useVaultDeposit } from '@/hooks/useVaultDeposit'
import { CONTRACTS } from '@/lib/contracts'
import { Loader2, TrendingUp, Percent } from 'lucide-react'

const VAULTS = [
  {
    name: 'Moonwell USDC',
    address: CONTRACTS.MOONWELL_USDC,
    token: CONTRACTS.USDC,
    tokenSymbol: 'USDC',
    decimals: 6,
    apy: '4.2%',
    protocol: 'Moonwell',
  },
]

export function VaultDepositCard() {
  const { wallets } = useWallets()
  const { isUpgraded } = usePorto()
  const { deposit, isLoading, error } = useVaultDeposit()

  const [selectedVault] = useState(VAULTS[0])
  const [amount, setAmount] = useState('')
  const [txId, setTxId] = useState<string | null>(null)

  const privyWallet = wallets.find((w) => w.walletClientType === 'privy')

  const handleDeposit = async () => {
    if (!privyWallet?.address || !amount) return

    try {
      const id = await deposit({
        vaultAddress: selectedVault.address,
        tokenAddress: selectedVault.token,
        amount,
        decimals: selectedVault.decimals,
        receiverAddress: privyWallet.address as `0x${string}`,
      })
      setTxId(id)
      setAmount('')
    } catch (err) {
      console.error('Deposit failed:', err)
    }
  }

  return (
    <div className="bg-[#111111] border border-white/[0.06] rounded-3xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold text-lg">Earn Yield</h3>
        <div className="flex items-center gap-1 bg-green-500/10 text-green-400 px-3 py-1 rounded-full text-sm">
          <Percent className="w-3 h-3" />
          {selectedVault.apy} APY
        </div>
      </div>

      {/* Vault Info */}
      <div className="bg-white/[0.03] rounded-2xl p-4 mb-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-white font-medium">{selectedVault.name}</p>
            <p className="text-white/40 text-sm">{selectedVault.protocol}</p>
          </div>
        </div>

        <div className="flex justify-between items-center mb-2">
          <span className="text-white/40 text-sm">Deposit Amount</span>
          <span className="text-white/40 text-sm">{selectedVault.tokenSymbol}</span>
        </div>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          className="w-full bg-transparent text-white text-2xl font-semibold outline-none"
        />
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Success Display */}
      {txId && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 mb-4">
          <p className="text-green-400 text-sm">Deposit submitted! ID: {txId.slice(0, 10)}...</p>
        </div>
      )}

      {/* Deposit Button */}
      {!isUpgraded ? (
        <div className="text-center py-4">
          <p className="text-white/50 text-sm">Upgrade your wallet to enable deposits</p>
        </div>
      ) : (
        <button
          onClick={handleDeposit}
          disabled={isLoading || !amount || parseFloat(amount) <= 0}
          className="w-full py-4 bg-[#ef4444] hover:bg-[#dc2626] disabled:bg-white/10 disabled:text-white/30 text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Processing...
            </>
          ) : (
            'Deposit & Earn'
          )}
        </button>
      )}

      <p className="text-white/30 text-xs text-center mt-3">
        1-click: Approve + Deposit • Gas in USDC
      </p>
    </div>
  )
}

