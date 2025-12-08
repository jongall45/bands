'use client'

import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useAccount, useBalance, useWalletClient, usePublicClient, useSwitchChain } from 'wagmi'
import { base, arbitrum } from 'viem/chains'
import { formatUnits } from 'viem'

// USDC addresses
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const USDC_ARBITRUM = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'

export function useAuth() {
  // Privy hooks
  const { 
    login, 
    logout, 
    authenticated, 
    ready, 
    user,
    linkEmail,
    linkGoogle,
  } = usePrivy()
  
  const { wallets } = useWallets()
  
  // Wagmi hooks
  const { address, isConnected, chain } = useAccount()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()
  const { switchChain } = useSwitchChain()
  
  // Get the embedded wallet specifically
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy')
  
  // ETH Balances
  const { data: ethBalanceBase, refetch: refetchEthBase } = useBalance({ 
    address, 
    chainId: base.id,
  })
  const { data: ethBalanceArb, refetch: refetchEthArb } = useBalance({ 
    address, 
    chainId: arbitrum.id,
  })
  
  // USDC Balances
  const { data: usdcBalanceBase, refetch: refetchUsdcBase } = useBalance({ 
    address, 
    chainId: base.id,
    token: USDC_BASE as `0x${string}`,
  })
  const { data: usdcBalanceArb, refetch: refetchUsdcArb } = useBalance({ 
    address, 
    chainId: arbitrum.id,
    token: USDC_ARBITRUM as `0x${string}`,
  })
  
  // Helper to switch chains
  const switchToBase = async () => {
    if (embeddedWallet) {
      await embeddedWallet.switchChain(base.id)
    } else if (switchChain) {
      switchChain({ chainId: base.id })
    }
  }
  
  /**
   * WARNING: Privy embedded wallet switchChain is BROKEN!
   * Calling this will "succeed" but the wallet stays on its current chain.
   * Once on Arbitrum, the wallet cannot switch back to Base, breaking the bridge.
   * 
   * DO NOT CALL THIS AUTOMATICALLY - only use for external wallet users if needed.
   * For embedded wallets, user must logout/login to reset to Base (defaultChain).
   */
  const switchToArbitrum = async () => {
    console.warn('⚠️ switchToArbitrum called - this is broken for Privy embedded wallets!')
    if (embeddedWallet) {
      await embeddedWallet.switchChain(arbitrum.id)
    } else if (switchChain) {
      switchChain({ chainId: arbitrum.id })
    }
  }
  
  // Refetch all balances
  const refetchBalances = () => {
    refetchEthBase()
    refetchEthArb()
    refetchUsdcBase()
    refetchUsdcArb()
  }
  
  // Format display values
  const displayAddress = address 
    ? `${address.slice(0, 6)}...${address.slice(-4)}` 
    : null
    
  const displayEmail = user?.email?.address
  
  // Get login method info
  const loginMethod = user?.linkedAccounts?.[0]?.type || null
  
  return {
    // State
    isReady: ready,
    isLoading: !ready, // Auth is loading until ready
    isAuthenticated: authenticated,
    isConnected: authenticated && isConnected,
    user,
    address,
    displayAddress,
    displayEmail,
    loginMethod,
    chain,
    chainId: chain?.id,
    
    // Wallets
    walletClient,
    publicClient,
    embeddedWallet,
    wallets,
    
    // Balances (formatted)
    balances: {
      ethBase: ethBalanceBase ? formatUnits(ethBalanceBase.value, 18) : '0',
      ethArb: ethBalanceArb ? formatUnits(ethBalanceArb.value, 18) : '0',
      usdcBase: usdcBalanceBase ? formatUnits(usdcBalanceBase.value, 6) : '0',
      usdcArb: usdcBalanceArb ? formatUnits(usdcBalanceArb.value, 6) : '0',
    },
    
    // Raw balances
    rawBalances: {
      ethBase: ethBalanceBase?.value ?? BigInt(0),
      ethArb: ethBalanceArb?.value ?? BigInt(0),
      usdcBase: usdcBalanceBase?.value ?? BigInt(0),
      usdcArb: usdcBalanceArb?.value ?? BigInt(0),
    },
    
    // Actions
    login,
    logout,
    switchToBase,
    switchToArbitrum,
    linkEmail,
    linkGoogle,
    refetchBalances,
  }
}

