import { useReadContract } from 'wagmi'
import { formatUnits } from 'viem'
import { base } from 'wagmi/chains'
import { USDC_ADDRESS, USDC_DECIMALS, ERC20_ABI } from '@/lib/wagmi'

interface UseStablecoinBalanceOptions {
  address?: `0x${string}`
  tokenAddress?: `0x${string}`
  decimals?: number
  chainId?: number
  enabled?: boolean
}

export function useStablecoinBalance({
  address,
  tokenAddress = USDC_ADDRESS,
  decimals = USDC_DECIMALS,
  chainId = base.id,
  enabled = true,
}: UseStablecoinBalanceOptions) {
  const { data: rawBalance, isLoading, isError, refetch } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId,
    query: {
      enabled: enabled && !!address,
      refetchInterval: 10000,
    },
  })

  const balance = rawBalance ? parseFloat(formatUnits(rawBalance, decimals)) : 0
  
  const formatted = balance.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  return {
    balance,
    formatted,
    raw: rawBalance,
    isLoading,
    isError,
    refetch,
  }
}

