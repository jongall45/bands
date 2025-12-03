'use client'

import { useQuery } from '@tanstack/react-query'
import { useAccount, useReadContract } from 'wagmi'
import { formatUnits, parseUnits } from 'viem'
import { fetchBaseUSDCVaults, fetchUserVaultPositions, type MorphoVault } from '@/lib/morpho/api'
import { ERC4626_ABI, MORPHO_ERC20_ABI } from '@/lib/morpho/abi'
import { USDC_BASE } from '@/lib/morpho/constants'
import { base } from 'viem/chains'

// Hook to fetch all USDC vaults
export function useMorphoVaults() {
  return useQuery({
    queryKey: ['morpho-vaults'],
    queryFn: fetchBaseUSDCVaults,
    staleTime: 60000, // 1 minute
    refetchInterval: 60000,
  })
}

// Hook to fetch user's vault positions
export function useUserVaultPositions() {
  const { address } = useAccount()

  return useQuery({
    queryKey: ['user-vault-positions', address],
    queryFn: () => fetchUserVaultPositions(address!),
    enabled: !!address,
    staleTime: 30000, // 30 seconds
    refetchInterval: 30000,
  })
}

// Hook to get user's share balance in a specific vault
export function useVaultBalance(vaultAddress: `0x${string}`) {
  const { address } = useAccount()

  const { data: shares } = useReadContract({
    address: vaultAddress,
    abi: ERC4626_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: base.id,
    query: {
      enabled: !!address,
    },
  })

  const { data: assets } = useReadContract({
    address: vaultAddress,
    abi: ERC4626_ABI,
    functionName: 'convertToAssets',
    args: shares ? [shares] : undefined,
    chainId: base.id,
    query: {
      enabled: !!shares && shares > BigInt(0),
    },
  })

  return {
    shares: shares || BigInt(0),
    assets: assets || BigInt(0),
    assetsFormatted: assets ? formatUnits(assets, 6) : '0',
  }
}

// Hook to get USDC allowance for a vault
export function useUSDCAllowance(vaultAddress: `0x${string}`) {
  const { address } = useAccount()

  const { data: allowance, refetch } = useReadContract({
    address: USDC_BASE,
    abi: MORPHO_ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, vaultAddress] : undefined,
    chainId: base.id,
    query: {
      enabled: !!address,
    },
  })

  return {
    allowance: allowance || BigInt(0),
    refetch,
  }
}

// Hook to preview deposit (how many shares for X assets)
export function usePreviewDeposit(vaultAddress: `0x${string}`, amount: string) {
  const amountBigInt = amount ? parseUnits(amount, 6) : BigInt(0)

  const { data: shares } = useReadContract({
    address: vaultAddress,
    abi: ERC4626_ABI,
    functionName: 'previewDeposit',
    args: [amountBigInt],
    chainId: base.id,
    query: {
      enabled: amountBigInt > BigInt(0),
    },
  })

  return shares || BigInt(0)
}

// Hook to preview redeem (how many assets for X shares)
export function usePreviewRedeem(vaultAddress: `0x${string}`, shares: bigint) {
  const { data: assets } = useReadContract({
    address: vaultAddress,
    abi: ERC4626_ABI,
    functionName: 'previewRedeem',
    args: [shares],
    chainId: base.id,
    query: {
      enabled: shares > BigInt(0),
    },
  })

  return assets || BigInt(0)
}

