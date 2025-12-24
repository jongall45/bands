'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { PiggyBank, TrendingUp, RefreshCw, Plus, ExternalLink, Shield, ChevronDown } from 'lucide-react'
import { useMorphoVaults, useUserVaultPositions } from '@/hooks/useMorphoVaults'
import { calculateProjectedEarnings, type MorphoVault } from '@/lib/morpho/api'
import { MORPHO_CHAINS } from '@/lib/morpho/constants'
import { base } from 'viem/chains'
import { VaultCard } from '@/components/morpho/VaultCard'
import { DepositModal } from '@/components/morpho/DepositModal'
import { WithdrawModal } from '@/components/morpho/WithdrawModal'
import { BottomNav } from '@/components/ui/BottomNav'
import { LogoInline } from '@/components/ui/Logo'
import { IndustrialPage, GlassCard, GlassButton, GlassInner, TechBadge, SectionHeader } from '@/components/ui/IndustrialGlass'
import { useAuth } from '@/hooks/useAuth'

// USDC Logo URL
const USDC_LOGO = 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png'

export default function SavePage() {
  const router = useRouter()
  // Use smart wallet address from useAuth (not EOA from useAccount)
  const { address, isAuthenticated, isSmartWalletReady, balances } = useAuth()
  const [selectedVault, setSelectedVault] = useState<MorphoVault | null>(null)
  const [modalType, setModalType] = useState<'deposit' | 'withdraw' | null>(null)
  const [selectedChainId, setSelectedChainId] = useState<number>(base.id)
  const [isChainDropdownOpen, setIsChainDropdownOpen] = useState(false)

  // Get current selected chain info
  const selectedChain = MORPHO_CHAINS.find(c => c.id === selectedChainId) || MORPHO_CHAINS[0]

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) router.push('/')
  }, [isAuthenticated, router])

  // Fetch vaults for selected chain
  const { data: vaults, isLoading: vaultsLoading, refetch } = useMorphoVaults(selectedChainId)

  // Fetch user positions for selected chain
  const { data: positions, isLoading: positionsLoading } = useUserVaultPositions(selectedChainId)

  // Calculate total deposited
  const totalDeposited = positions?.reduce((sum, pos) => sum + (pos.assetsUsd || 0), 0) || 0

  // Calculate total projected yearly earnings
  const totalYearlyEarnings = positions?.reduce((sum, pos) => {
    const vault = vaults?.find(v => v.address.toLowerCase() === pos.vault.address.toLowerCase())
    if (vault) {
      return sum + calculateProjectedEarnings(pos.assetsUsd || 0, vault.state.netApy * 100, 365)
    }
    return sum
  }, 0) || 0

  // Get highest APY
  const highestApy = vaults?.reduce((max, v) => Math.max(max, v.state.netApy * 100), 0) || 0

  // Get user's USDC balance on Base
  const usdcBalance = parseFloat(balances.usdcBase || '0')

  const handleSelectVault = (vault: MorphoVault) => {
    setSelectedVault(vault)
    setModalType('deposit')
  }

  const handleWithdraw = (vault: MorphoVault) => {
    setSelectedVault(vault)
    setModalType('withdraw')
  }

  const handleCloseModal = () => {
    setSelectedVault(null)
    setModalType(null)
  }

  if (!isAuthenticated) {
    return (
      <IndustrialPage>
        <div className="min-h-screen flex items-center justify-center">
          <RefreshCw className="w-8 h-8 text-[#FF3B30] animate-spin" />
        </div>
      </IndustrialPage>
    )
  }

  return (
    <IndustrialPage>
      <div className="max-w-[430px] mx-auto relative z-10 pb-24">
        {/* Header */}
        <header
          className="flex items-center justify-between px-5 py-4"
          style={{ paddingTop: 'calc(16px + env(safe-area-inset-top, 0px))' }}
        >
          <div>
            <h1 className="text-white font-extrabold text-xl" style={{ fontWeight: 800 }}>Yield Vaults</h1>
            <p className="text-white/50 text-sm">Earn yield on your USDC</p>
          </div>
          <LogoInline size="sm" />
        </header>

        {/* Chain Selector */}
        <div className="px-5 mb-4">
          <div className="relative">
            <button
              onClick={() => setIsChainDropdownOpen(!isChainDropdownOpen)}
              className="w-full flex items-center justify-between bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3 hover:bg-white/[0.06] transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{selectedChain.icon}</span>
                <span className="text-white font-medium">{selectedChain.name}</span>
              </div>
              <ChevronDown className={`w-4 h-4 text-white/40 transition-transform ${isChainDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isChainDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-[#0a0a0a] border border-white/[0.1] rounded-xl overflow-hidden z-50 shadow-xl">
                {MORPHO_CHAINS.map((chain) => (
                  <button
                    key={chain.id}
                    onClick={() => {
                      setSelectedChainId(chain.id)
                      setIsChainDropdownOpen(false)
                    }}
                    className={`w-full flex items-center gap-2 px-4 py-3 hover:bg-white/[0.05] transition-colors ${
                      chain.id === selectedChainId ? 'bg-white/[0.03]' : ''
                    }`}
                  >
                    <span className="text-lg">{chain.icon}</span>
                    <span className="text-white">{chain.name}</span>
                    {chain.id === selectedChainId && (
                      <span className="ml-auto text-[#FF3B30] text-sm">✓</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Portfolio Summary - Only show if user has deposits */}
        {totalDeposited > 0 && (
          <div className="px-5 mb-4">
            <GlassCard variant="red">
              <div className="flex items-center gap-2 mb-3">
                <PiggyBank className="w-5 h-5 text-[#FF3B30]" />
                <span className="text-[#FF3B30] text-sm font-medium">Your Savings</span>
              </div>

              <div className="mb-4">
                <span className="text-white text-3xl font-extrabold" style={{ fontWeight: 800 }}>
                  ${totalDeposited.toFixed(2)}
                </span>
                <span className="text-white/40 text-sm ml-2">deposited</span>
              </div>

              <GlassInner>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-green-400" />
                    <span className="text-white/60 text-sm">Projected yearly</span>
                  </div>
                  <span className="text-green-400 font-semibold">
                    +${totalYearlyEarnings.toFixed(2)}
                  </span>
                </div>
              </GlassInner>
            </GlassCard>
          </div>
        )}

        {/* APY Summary Card - Show when no deposits */}
        {totalDeposited === 0 && (
          <div className="px-5 mb-4">
            <GlassCard variant="green">
              <div className="flex items-center gap-3 mb-3">
                {/* USDC Logo with % overlay */}
                <div className="relative w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center border border-green-500/30 overflow-hidden">
                  <img
                    src={USDC_LOGO}
                    alt="USDC"
                    className="w-8 h-8"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                    <span className="text-[8px] font-bold text-white">%</span>
                  </div>
                </div>
                <div>
                  <p className="text-white/50 text-sm">Earn up to</p>
                  <p className="text-green-400 text-2xl font-extrabold" style={{ fontWeight: 800 }}>{highestApy.toFixed(1)}% APY</p>
                </div>
                <div className="ml-auto">
                  <img
                    src="https://pbs.twimg.com/profile_images/1930600293915410432/dgTU7UNU_400x400.jpg"
                    alt="Morpho"
                    className="w-8 h-8 rounded-full border border-white/20"
                  />
                </div>
              </div>
              <p className="text-white/40 text-sm">
                Deposit USDC into curated vaults to earn yield from overcollateralized lending.
              </p>
            </GlassCard>
          </div>
        )}

        {/* Available USDC Balance */}
        {usdcBalance > 0 && (
          <div className="px-5 mb-4">
            <GlassInner className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <img src={USDC_LOGO} alt="USDC" className="w-5 h-5" />
                <span className="text-white/60 text-sm">Available USDC</span>
              </div>
              <span className="text-white font-semibold">${usdcBalance.toFixed(2)}</span>
            </GlassInner>
          </div>
        )}


        {/* Your Positions */}
        {positions && positions.length > 0 && (
          <div className="px-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-white font-extrabold" style={{ fontWeight: 800 }}>Your Positions</h2>
              <button
                onClick={() => refetch()}
                className="p-2 hover:bg-white/5 rounded-full transition-colors"
              >
                <RefreshCw className="w-4 h-4 text-white/40" />
              </button>
            </div>

            <div className="space-y-3">
              {positions.map((position) => {
                const vault = vaults?.find(
                  v => v.address.toLowerCase() === position.vault.address.toLowerCase()
                )
                if (!vault) return null

                return (
                  <GlassCard key={position.vault.address} className="!p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <img src={USDC_LOGO} alt="USDC" className="w-8 h-8" />
                        <div>
                          <h3 className="text-white font-semibold text-sm">{position.vault.name}</h3>
                          <p className="text-green-400 text-xs">
                            {(vault.state.netApy * 100).toFixed(2)}% APY
                          </p>
                        </div>
                      </div>
                      <span className="text-white font-bold">
                        ${position.assetsUsd?.toFixed(2) || '0.00'}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <GlassButton
                        primary
                        onClick={() => handleSelectVault(vault)}
                        className="!py-2 !text-xs"
                      >
                        <Plus className="w-3 h-3" />
                        Add
                      </GlassButton>
                      <GlassButton
                        onClick={() => handleWithdraw(vault)}
                        className="!py-2 !text-xs"
                      >
                        Withdraw
                      </GlassButton>
                    </div>
                  </GlassCard>
                )
              })}
            </div>
          </div>
        )}

        {/* Available Vaults */}
        <div className="px-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-extrabold" style={{ fontWeight: 800 }}>Earn Yield</h2>
            <a
              href="https://app.morpho.org/base?type=vault"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-white/40 text-xs hover:text-white/60 transition-colors"
            >
              View all <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {vaultsLoading ? (
            <div className="flex items-center justify-center h-40">
              <RefreshCw className="w-6 h-6 text-white/40 animate-spin" />
            </div>
          ) : vaults && vaults.length > 0 ? (
            <div className="space-y-3">
              {vaults.slice(0, 5).map((vault) => {
                const position = positions?.find(
                  p => p.vault.address.toLowerCase() === vault.address.toLowerCase()
                )

                return (
                  <VaultCard
                    key={vault.address}
                    vault={vault}
                    userBalance={position ? {
                      shares: BigInt(position.shares || 0),
                      assets: BigInt(Math.floor((position.assetsUsd || 0) * 1e6)),
                      assetsFormatted: (position.assetsUsd || 0).toString(),
                    } : undefined}
                    onSelect={handleSelectVault}
                  />
                )
              })}
            </div>
          ) : (
            <GlassCard>
              <p className="text-white/40 text-sm text-center">No vaults available at this time</p>
            </GlassCard>
          )}
        </div>

        {/* Safety Info */}
        <div className="px-5 mt-6">
          <GlassCard>
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-white/60" />
              <h4 className="text-white font-semibold text-sm">Protocol Security</h4>
            </div>
            <p className="text-white/40 text-sm">
              Morpho vaults use overcollateralized lending. Curators like Spark, Gauntlet, and Steakhouse manage risk. Withdraw anytime.
            </p>
          </GlassCard>
        </div>

        {/* Powered By */}
        <div className="flex items-center justify-center gap-2 text-white/30 text-xs mt-6">
          Powered by Morpho Protocol
        </div>
      </div>

      {/* Modals */}
      {selectedVault && modalType === 'deposit' && (
        <DepositModal
          vault={selectedVault}
          isOpen={true}
          onClose={handleCloseModal}
          onSuccess={() => refetch()}
        />
      )}

      {selectedVault && modalType === 'withdraw' && (
        <WithdrawModal
          vault={selectedVault}
          isOpen={true}
          onClose={handleCloseModal}
          onSuccess={() => refetch()}
        />
      )}

      {/* Bottom Navigation */}
      <BottomNav />
    </IndustrialPage>
  )
}
