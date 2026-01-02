'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { PiggyBank, TrendingUp, RefreshCw, Plus, ExternalLink, Shield, ChevronDown, Minus } from 'lucide-react'
import { useMorphoVaults, useUserVaultPositions } from '@/hooks/useMorphoVaults'
import { calculateProjectedEarnings, type MorphoVault } from '@/lib/morpho/api'
import { MORPHO_CHAINS, MAX_REALISTIC_APY } from '@/lib/morpho/constants'
import { base } from 'viem/chains'
import { VaultCard } from '@/components/morpho/VaultCard'
import { DepositModal } from '@/components/morpho/DepositModal'
import { WithdrawModal } from '@/components/morpho/WithdrawModal'
import { SavingsProjectionChart } from '@/components/morpho/SavingsProjectionChart'
import { LogoInline } from '@/components/ui/Logo'
import { AppShell, AppContent } from '@/components/layout/AppShell'
import { IndustrialPage, GlassCard, GlassButton, GlassInner } from '@/components/ui/IndustrialGlass'
import { useAuth } from '@/hooks/useAuth'
import haptics from '@/lib/haptics'

// USDC Logo URL
const USDC_LOGO = 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png'

export default function SavePage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { address, isAuthenticated, isSmartWalletReady, balances, refetchBalances, isReady } = useAuth()
  const [selectedVault, setSelectedVault] = useState<MorphoVault | null>(null)
  const [modalType, setModalType] = useState<'deposit' | 'withdraw' | null>(null)
  const [selectedChainId, setSelectedChainId] = useState<number>(base.id)
  const [isChainDropdownOpen, setIsChainDropdownOpen] = useState(false)
  const [isSavingsExpanded, setIsSavingsExpanded] = useState(false)
  const hasNavigatedRef = useRef(false)

  // Get current selected chain info
  const selectedChain = MORPHO_CHAINS.find(c => c.id === selectedChainId) || MORPHO_CHAINS[0]

  // Redirect if not authenticated (only after auth is ready)
  useEffect(() => {
    if (isReady && !isAuthenticated && !hasNavigatedRef.current) {
      hasNavigatedRef.current = true
      router.push('/')
    }
  }, [isAuthenticated, isReady, router])

  // Enable scrolling for this page on iOS
  useEffect(() => {
    document.body.classList.add('allow-scroll')
    return () => {
      document.body.classList.remove('allow-scroll')
    }
  }, [])

  // Fetch vaults for selected chain
  const { data: vaults, isLoading: vaultsLoading, refetch: refetchVaults } = useMorphoVaults(selectedChainId)

  // Fetch user positions for selected chain
  const { data: positions, isLoading: positionsLoading, refetch: refetchPositions } = useUserVaultPositions(selectedChainId)

  // Aggressive refetch after transaction - invalidate cache and refetch
  const refetchAfterTransaction = useCallback(async () => {
    // Invalidate all position queries to force fresh fetch
    await queryClient.invalidateQueries({ queryKey: ['user-vault-positions'] })

    // Refetch balances immediately
    refetchBalances()

    // First refetch attempt immediately
    await Promise.all([refetchVaults(), refetchPositions()])

    // Second refetch after short delay (on-chain state propagation)
    setTimeout(async () => {
      await queryClient.invalidateQueries({ queryKey: ['user-vault-positions'] })
      refetchBalances()
      await Promise.all([refetchVaults(), refetchPositions()])
    }, 2000)

    // Third refetch after longer delay for safety
    setTimeout(async () => {
      await queryClient.invalidateQueries({ queryKey: ['user-vault-positions'] })
      refetchBalances()
      await Promise.all([refetchVaults(), refetchPositions()])
    }, 5000)
  }, [queryClient, refetchVaults, refetchPositions, refetchBalances])

  // Simple refetch all data
  const refetch = async () => {
    await Promise.all([refetchVaults(), refetchPositions()])
  }

  // Calculate total deposited
  const totalDeposited = positions?.reduce((sum, pos) => sum + (pos.assetsUsd || 0), 0) || 0

  // Calculate total projected yearly earnings and average APY
  const { totalYearlyEarnings, avgApy } = useMemo(() => {
    if (!positions || !vaults || positions.length === 0) {
      return { totalYearlyEarnings: 0, avgApy: 0 }
    }

    let totalEarnings = 0
    let weightedApySum = 0
    let totalWeight = 0

    positions.forEach(pos => {
      const vault = vaults.find(v => v.address.toLowerCase() === pos.vault.address.toLowerCase())
      if (vault && pos.assetsUsd) {
        const apy = Math.min(vault.state.netApy, MAX_REALISTIC_APY)
        totalEarnings += calculateProjectedEarnings(pos.assetsUsd, apy * 100, 365)
        weightedApySum += apy * pos.assetsUsd
        totalWeight += pos.assetsUsd
      }
    })

    return {
      totalYearlyEarnings: totalEarnings,
      avgApy: totalWeight > 0 ? weightedApySum / totalWeight : 0,
    }
  }, [positions, vaults])

  // Minimum liquidity threshold ($1M)
  const MIN_LIQUIDITY_USD = 1_000_000

  // Sort and filter vaults by APY (descending), with minimum liquidity
  const sortedVaults = useMemo(() => {
    if (!vaults) return []
    return [...vaults]
      .filter(v => v.state.netApy <= MAX_REALISTIC_APY)
      .filter(v => v.state.totalAssetsUsd >= MIN_LIQUIDITY_USD) // Minimum $1M liquidity
      .sort((a, b) => {
        // Sort by APY first, but favor vaults with more liquidity
        // Score = APY * log10(liquidity) to balance yield and safety
        const scoreA = a.state.netApy * Math.log10(a.state.totalAssetsUsd + 1)
        const scoreB = b.state.netApy * Math.log10(b.state.totalAssetsUsd + 1)
        return scoreB - scoreA
      })
      .slice(0, 5)
  }, [vaults])

  // Get highest APY
  const highestApy = sortedVaults.length > 0 ? sortedVaults[0].state.netApy * 100 : 0

  // Get user's USDC balance for selected chain
  const getUsdcBalanceForChain = (chainId: number) => {
    switch (chainId) {
      case base.id:
        return balances.usdcBase
      case 42161: // Arbitrum
        return balances.usdcArb
      case 137: // Polygon
        return balances.usdcPolygon
      default:
        return '0'
    }
  }
  const usdcBalance = parseFloat(getUsdcBalanceForChain(selectedChainId) || '0')

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

  // Show loading while auth is initializing or user is not authenticated
  if (!isReady || !isAuthenticated) {
    return (
      <IndustrialPage>
        <div className="min-h-screen flex items-center justify-center">
          <RefreshCw className="w-8 h-8 text-[#FF3B30] animate-spin" />
        </div>
      </IndustrialPage>
    )
  }

  return (
    <AppShell>
      <IndustrialPage>
        <AppContent>
          {/* Header */}
          <header className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-white font-extrabold text-xl" style={{ fontWeight: 800 }}>Yield Vaults</h1>
              <p className="text-white/50 text-sm">Earn yield on your USDC</p>
            </div>
            <LogoInline size="sm" />
          </header>

          {/* Combined Your Savings Card - Only show if user has deposits */}
          {totalDeposited > 0 && (
            <div className="mb-4">
            <button
              onClick={() => setIsSavingsExpanded(!isSavingsExpanded)}
              className="w-full text-left"
            >
              {/* Subtle red-tinted card - more transparent */}
              <div
                className="relative overflow-hidden rounded-3xl border border-[#FF3B30]/20 shadow-2xl p-4"
                style={{
                  background: 'linear-gradient(135deg, rgba(255, 59, 48, 0.08) 0%, rgba(255, 59, 48, 0.03) 100%)',
                  backdropFilter: 'blur(20px)',
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#FF3B30]/20 rounded-xl flex items-center justify-center">
                      <PiggyBank className="w-5 h-5 text-[#FF3B30]" />
                    </div>
                    <div>
                      <p className="text-[#FF3B30] text-xs font-medium">Your Savings</p>
                      <p className="text-white text-xl font-extrabold" style={{ fontWeight: 800 }}>
                        ${totalDeposited.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-white/50 text-xs">{(avgApy * 100).toFixed(2)}% APY</p>
                      <p className="text-green-400 text-sm font-semibold">+${totalYearlyEarnings.toFixed(2)}/yr</p>
                    </div>
                    <ChevronDown className={`w-5 h-5 text-white/40 transition-transform duration-200 ${isSavingsExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </div>

                {/* Expanded Content */}
                <div className={`overflow-hidden transition-all duration-300 ${isSavingsExpanded ? 'max-h-[500px] opacity-100 mt-4' : 'max-h-0 opacity-0'}`}>
                  {/* Positions List */}
                  {positions && positions.length > 0 && (
                    <div className="space-y-2 mb-4">
                      {positions.map((position) => {
                        const vault = vaults?.find(
                          v => v.address.toLowerCase() === position.vault.address.toLowerCase()
                        )
                        if (!vault) return null

                        return (
                          <div
                            key={position.vault.address}
                            className="bg-black/20 rounded-xl p-3 flex items-center justify-between"
                          >
                            <div className="flex items-center gap-2">
                              <img src={USDC_LOGO} alt="USDC" className="w-6 h-6" />
                              <div>
                                <p className="text-white text-sm font-medium">{position.vault.name}</p>
                                <p className="text-green-400 text-xs">{(vault.state.netApy * 100).toFixed(2)}% APY</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-white font-semibold">${position.assetsUsd?.toFixed(2)}</span>
                              <div className="flex gap-1">
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleSelectVault(vault) }}
                                  className="w-7 h-7 bg-[#FF3B30] rounded-lg flex items-center justify-center hover:bg-[#dc2626] transition-colors"
                                >
                                  <Plus className="w-4 h-4 text-white" />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleWithdraw(vault) }}
                                  className="w-7 h-7 bg-white/10 rounded-lg flex items-center justify-center hover:bg-white/20 transition-colors"
                                >
                                  <Minus className="w-4 h-4 text-white" />
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Projection Chart */}
                  <SavingsProjectionChart
                    totalDeposited={totalDeposited}
                    avgApy={avgApy}
                  />
                </div>
              </div>
            </button>
          </div>
        )}

          {/* APY Summary Card - Show when no deposits */}
          {totalDeposited === 0 && (
            <div className="mb-4">
            <GlassCard variant="green">
              <div className="flex items-center gap-3 mb-3">
                <div className="relative w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center border border-green-500/30 overflow-hidden">
                  <img src={USDC_LOGO} alt="USDC" className="w-8 h-8" />
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

          {/* Available USDC Balance for selected chain */}
          {usdcBalance > 0 && (
            <div className="mb-4">
            <GlassInner className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <img src={USDC_LOGO} alt="USDC" className="w-5 h-5" />
                <span className="text-white/60 text-sm">Available on {selectedChain.name}</span>
              </div>
              <span className="text-white font-semibold">${usdcBalance.toFixed(2)}</span>
            </GlassInner>
          </div>
        )}

          {/* Earn Yield Section with Chain Selector */}
          <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-extrabold" style={{ fontWeight: 800 }}>Earn Yield</h2>
            <div className="flex items-center gap-2">
              {/* Chain Selector - Now inside Earn Yield */}
              <div className="relative">
                <button
                  onClick={() => setIsChainDropdownOpen(!isChainDropdownOpen)}
                  className="flex items-center gap-1.5 bg-white/[0.05] border border-white/[0.1] rounded-lg px-2.5 py-1.5 hover:bg-white/[0.08] transition-colors"
                >
                  <img
                    src={selectedChain.icon}
                    alt={selectedChain.name}
                    className="w-4 h-4 rounded-full"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                  <span className="text-white text-xs font-medium">{selectedChain.name}</span>
                  <ChevronDown className={`w-3 h-3 text-white/40 transition-transform ${isChainDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {isChainDropdownOpen && (
                  <div className="absolute top-full right-0 mt-1 bg-[#0a0a0a] border border-white/[0.1] rounded-lg overflow-hidden z-50 shadow-xl min-w-[120px]">
                    {MORPHO_CHAINS.map((chain) => (
                      <button
                        key={chain.id}
                        onClick={() => {
                          setSelectedChainId(chain.id)
                          setIsChainDropdownOpen(false)
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-white/[0.05] transition-colors text-left ${
                          chain.id === selectedChainId ? 'bg-white/[0.03]' : ''
                        }`}
                      >
                        <img
                          src={chain.icon}
                          alt={chain.name}
                          className="w-4 h-4 rounded-full"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                        <span className="text-white text-xs">{chain.name}</span>
                        {chain.id === selectedChainId && (
                          <span className="ml-auto text-[#FF3B30] text-xs">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <a
                href="https://app.morpho.org/base?type=vault"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-white/40 text-xs hover:text-white/60 transition-colors"
              >
                View all <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {vaultsLoading ? (
            <div className="flex items-center justify-center h-40">
              <RefreshCw className="w-6 h-6 text-white/40 animate-spin" />
            </div>
          ) : sortedVaults.length > 0 ? (
            <div className="space-y-3">
              {sortedVaults.map((vault, index) => {
                const position = positions?.find(
                  p => p.vault.address.toLowerCase() === vault.address.toLowerCase()
                )

                return (
                  <div
                    key={vault.address}
                    className="transition-all duration-300 ease-out"
                    style={{
                      animationDelay: `${index * 50}ms`,
                    }}
                  >
                    <VaultCard
                      vault={vault}
                      userBalance={position ? {
                        shares: BigInt(position.shares || 0),
                        assets: BigInt(Math.floor((position.assetsUsd || 0) * 1e6)),
                        assetsFormatted: (position.assetsUsd || 0).toString(),
                      } : undefined}
                      onSelect={handleSelectVault}
                    />
                  </div>
                )
              })}
            </div>
          ) : (
            <GlassCard>
              <p className="text-white/40 text-sm text-center">No vaults available on {selectedChain.name}</p>
            </GlassCard>
          )}
        </div>

          {/* Safety Info */}
          <div className="mt-6">
          <GlassCard variant="redAccent">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-[#FF3B30]/60" />
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

          {/* Modals */}
          {selectedVault && modalType === 'deposit' && (
            <DepositModal
              vault={selectedVault}
              isOpen={true}
              onClose={handleCloseModal}
              onSuccess={refetchAfterTransaction}
            />
          )}

          {selectedVault && modalType === 'withdraw' && (
            <WithdrawModal
              vault={selectedVault}
              isOpen={true}
              onClose={handleCloseModal}
              onSuccess={refetchAfterTransaction}
            />
          )}
        </AppContent>
      </IndustrialPage>
    </AppShell>
  )
}
