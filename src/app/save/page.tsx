'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount } from 'wagmi'
import { PiggyBank, TrendingUp, RefreshCw, Plus, ExternalLink, Shield, Info } from 'lucide-react'
import { useMorphoVaults, useUserVaultPositions } from '@/hooks/useMorphoVaults'
import { calculateProjectedEarnings, type MorphoVault } from '@/lib/morpho/api'
import { VaultCard } from '@/components/morpho/VaultCard'
import { DepositModal } from '@/components/morpho/DepositModal'
import { WithdrawModal } from '@/components/morpho/WithdrawModal'
import { BottomNav } from '@/components/ui/BottomNav'
import { LogoInline } from '@/components/ui/Logo'

export default function SavePage() {
  const router = useRouter()
  const { address, isConnected } = useAccount()
  const [selectedVault, setSelectedVault] = useState<MorphoVault | null>(null)
  const [modalType, setModalType] = useState<'deposit' | 'withdraw' | null>(null)

  // Redirect if not connected
  useEffect(() => {
    if (!isConnected) router.push('/')
  }, [isConnected, router])

  // Fetch vaults
  const { data: vaults, isLoading: vaultsLoading, refetch } = useMorphoVaults()
  
  // Fetch user positions
  const { data: positions, isLoading: positionsLoading } = useUserVaultPositions()

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

  if (!isConnected) {
    return (
      <div className="save-page">
        <div className="noise-overlay" />
        <div className="aura aura-1" />
        <div className="aura aura-2" />
        <div className="min-h-screen flex items-center justify-center">
          <RefreshCw className="w-8 h-8 text-[#ef4444] animate-spin" />
        </div>
        <style jsx global>{saveStyles}</style>
      </div>
    )
  }

  return (
    <div className="save-page">
      {/* Grain Texture Overlay */}
      <div className="noise-overlay" />

      {/* Atmospheric Red Auras */}
      <div className="aura aura-1" />
      <div className="aura aura-2" />
      <div className="aura aura-3" />

      <div className="max-w-[430px] mx-auto relative z-10 pb-24">
        {/* Header */}
        <header 
          className="flex items-center justify-between px-5 py-4"
          style={{ paddingTop: 'calc(16px + env(safe-area-inset-top, 0px))' }}
        >
          <div>
            <h1 className="text-gray-900 font-semibold text-xl">Save</h1>
            <p className="text-gray-500 text-sm">Earn yield on your USDC</p>
          </div>
          <LogoInline size="sm" />
        </header>

        {/* Portfolio Summary - Only show if user has deposits */}
        {totalDeposited > 0 && (
          <div className="px-5 mb-4">
            <div className="bg-[#111111] border border-white/[0.06] rounded-3xl p-5 relative overflow-hidden">
              {/* Red gradient accent */}
              <div className="absolute inset-0 bg-gradient-to-br from-[#ef4444]/15 via-transparent to-transparent pointer-events-none" />
              
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-3">
                  <PiggyBank className="w-5 h-5 text-[#ef4444]" />
                  <span className="text-[#ef4444] text-sm font-medium">Your Savings</span>
                </div>
                
                <div className="mb-4">
                  <span className="text-white text-3xl font-bold">
                    ${totalDeposited.toFixed(2)}
                  </span>
                  <span className="text-white/40 text-sm ml-2">deposited</span>
                </div>

                <div className="flex items-center justify-between bg-white/[0.03] rounded-xl p-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-green-400" />
                    <span className="text-white/60 text-sm">Projected yearly</span>
                  </div>
                  <span className="text-green-400 font-semibold">
                    +${totalYearlyEarnings.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* APY Summary Card - Show when no deposits */}
        {totalDeposited === 0 && (
          <div className="px-5 mb-4">
            <div className="bg-[#111111] border border-white/[0.06] rounded-3xl p-5 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 via-transparent to-transparent pointer-events-none" />
              
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <p className="text-white/50 text-sm">Earn up to</p>
                    <p className="text-green-400 text-2xl font-bold">{highestApy.toFixed(1)}% APY</p>
                  </div>
                </div>
                <p className="text-white/40 text-sm">
                  Deposit USDC into curated Morpho vaults to earn yield from overcollateralized lending.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Info Banner */}
        <div className="px-5 mb-4">
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-3 flex items-start gap-3">
            <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
            <p className="text-blue-400 text-sm">
              Gas is paid in USDC via your Porto wallet. No ETH needed.
            </p>
          </div>
        </div>

        {/* Your Positions */}
        {positions && positions.length > 0 && (
          <div className="px-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-gray-900 font-semibold">Your Positions</h2>
              <button 
                onClick={() => refetch()}
                className="p-2 hover:bg-black/5 rounded-full transition-colors"
              >
                <RefreshCw className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            <div className="space-y-3">
              {positions.map((position) => {
                const vault = vaults?.find(
                  v => v.address.toLowerCase() === position.vault.address.toLowerCase()
                )
                if (!vault) return null

                return (
                  <div
                    key={position.vault.address}
                    className="bg-[#111] border border-white/[0.06] rounded-2xl p-4"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="text-white font-medium text-sm">{position.vault.name}</h3>
                        <p className="text-green-400 text-xs">
                          {(vault.state.netApy * 100).toFixed(2)}% APY
                        </p>
                      </div>
                      <span className="text-white font-semibold">
                        ${position.assetsUsd?.toFixed(2) || '0.00'}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSelectVault(vault)}
                        className="flex-1 py-2 bg-[#ef4444] hover:bg-[#dc2626] text-white text-sm font-medium rounded-xl transition-colors flex items-center justify-center gap-1"
                      >
                        <Plus className="w-4 h-4" />
                        Add
                      </button>
                      <button
                        onClick={() => handleWithdraw(vault)}
                        className="flex-1 py-2 bg-white/[0.05] hover:bg-white/[0.08] text-white/80 text-sm font-medium rounded-xl transition-colors"
                      >
                        Withdraw
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Available Vaults */}
        <div className="px-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-gray-900 font-semibold">Earn Yield</h2>
            <a
              href="https://app.morpho.org/base?type=vault"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-gray-500 text-xs hover:text-gray-700"
            >
              View all <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {vaultsLoading ? (
            <div className="flex items-center justify-center h-40">
              <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
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
            <div className="bg-[#111] border border-white/[0.06] rounded-2xl p-6 text-center">
              <p className="text-white/40 text-sm">No vaults available at this time</p>
            </div>
          )}
        </div>

        {/* Safety Info */}
        <div className="px-5 mt-6">
          <div className="bg-white/[0.5] backdrop-blur-lg border border-white/[0.1] rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-gray-700" />
              <h4 className="text-gray-800 font-medium text-sm">Protocol Security</h4>
            </div>
            <p className="text-gray-600 text-sm">
              Morpho vaults use overcollateralized lending. Curators like Spark, Gauntlet, and Steakhouse manage risk. Withdraw anytime.
            </p>
          </div>
        </div>

        {/* Powered By */}
        <div className="flex items-center justify-center gap-2 text-gray-500 text-xs mt-6">
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

      <style jsx global>{saveStyles}</style>
    </div>
  )
}

const saveStyles = `
  .save-page {
    min-height: 100vh;
    width: 100%;
    background: #F4F4F5;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif;
    overflow-x: hidden;
    position: relative;
  }

  /* Grain texture */
  .save-page .noise-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 10000;
    opacity: 0.08;
    mix-blend-mode: overlay;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
  }

  /* Red auras */
  .save-page .aura {
    position: fixed;
    border-radius: 50%;
    z-index: 0;
    animation: aura-float 20s ease-in-out infinite;
  }

  .save-page .aura-1 {
    width: 800px;
    height: 800px;
    top: -250px;
    left: -200px;
    background: #FF3B30;
    filter: blur(150px);
    opacity: 0.5;
  }

  .save-page .aura-2 {
    width: 700px;
    height: 700px;
    bottom: -200px;
    right: -150px;
    background: #D70015;
    filter: blur(140px);
    opacity: 0.45;
    animation-delay: 7s;
  }

  .save-page .aura-3 {
    width: 400px;
    height: 400px;
    top: 40%;
    right: 20%;
    background: #FF6B35;
    filter: blur(120px);
    opacity: 0.3;
    animation-delay: 14s;
  }

  @keyframes aura-float {
    0%, 100% { transform: translate(0, 0) scale(1); }
    33% { transform: translate(50px, -40px) scale(1.05); }
    66% { transform: translate(-30px, 40px) scale(0.95); }
  }
`
