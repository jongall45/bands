/**
 * useFomoTransaction - "Fomo-style" transaction state machine
 * 
 * Provides optimistic UI updates for instant-feeling transactions:
 * - Show success immediately when hash received
 * - Reconcile in background
 * - Never block on confirmation unless critical
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { createPublicClient, http, type Hash } from 'viem'
import { arbitrum, base, polygon } from 'viem/chains'
import { runPreflight, logAddresses, type PreflightResult } from '@/lib/privy/preflight'

// UX State Machine
export type FomoState = 
  | 'AUTHENTICATING'  // User logging in
  | 'WALLET_CREATING' // Embedded/smart wallet being created
  | 'READY'           // Ready to transact
  | 'SENDING'         // Transaction in flight
  | 'CONFIRMED'       // Hash received (optimistic success)
  | 'FAILED'          // Transaction failed

export interface FomoTransactionState {
  state: FomoState
  txHash: string | null
  error: string | null
  isOptimistic: boolean // True if we're showing success before chain confirmation
}

const CHAINS: Record<number, typeof arbitrum | typeof base | typeof polygon> = {
  [arbitrum.id]: arbitrum,
  [base.id]: base,
  [polygon.id]: polygon,
}

/**
 * Hook that provides fomo-style transaction UX
 */
export function useFomoTransaction() {
  const { authenticated, ready: privyReady, login } = usePrivy()
  const { wallets, ready: walletsReady } = useWallets()
  const { client: smartWalletClient, getClientForChain } = useSmartWallets()

  const [txState, setTxState] = useState<FomoTransactionState>({
    state: 'AUTHENTICATING',
    txHash: null,
    error: null,
    isOptimistic: false,
  })

  // Track background confirmation
  const confirmationRef = useRef<boolean>(false)

  // Get embedded wallet
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy')
  const signerAddress = embeddedWallet?.address as `0x${string}` | undefined
  const smartWalletAddress = smartWalletClient?.account?.address

  // Update state based on wallet readiness
  useEffect(() => {
    if (!privyReady) {
      setTxState(s => ({ ...s, state: 'AUTHENTICATING' }))
      return
    }

    if (!authenticated) {
      setTxState(s => ({ ...s, state: 'AUTHENTICATING' }))
      return
    }

    if (!walletsReady || !embeddedWallet) {
      setTxState(s => ({ ...s, state: 'WALLET_CREATING' }))
      return
    }

    if (!smartWalletClient || !smartWalletAddress) {
      setTxState(s => ({ ...s, state: 'WALLET_CREATING' }))
      return
    }

    // Only transition to READY if we're not in a transaction flow
    if (txState.state === 'AUTHENTICATING' || txState.state === 'WALLET_CREATING') {
      setTxState(s => ({ ...s, state: 'READY' }))
      
      // Log addresses on ready
      logAddresses(signerAddress, smartWalletAddress)
    }
  }, [privyReady, authenticated, walletsReady, embeddedWallet, smartWalletClient, smartWalletAddress, txState.state, signerAddress])

  /**
   * Run preflight checks
   */
  const preflight = useCallback(async (
    chainId: number,
    tokenAddress?: `0x${string}`,
    requiredAmount?: string
  ): Promise<PreflightResult> => {
    return runPreflight({
      authenticated,
      privyReady,
      embeddedWallet,
      smartWalletClient,
      smartWalletAddress,
      signerAddress,
      targetChainId: chainId,
      tokenAddress,
      requiredAmount,
    })
  }, [authenticated, privyReady, embeddedWallet, smartWalletClient, smartWalletAddress, signerAddress])

  /**
   * Send transaction with optimistic UI
   * 
   * Flow:
   * 1. Immediately set SENDING
   * 2. On hash received -> CONFIRMED (optimistic)
   * 3. Wait for confirmation in background
   * 4. If confirmation fails, revert to FAILED
   */
  const send = useCallback(async (params: {
    to: `0x${string}`
    data?: `0x${string}`
    value?: bigint
    chainId?: number
  }): Promise<{ hash?: string; error?: string }> => {
    const chainId = params.chainId ?? arbitrum.id

    // Preflight
    const preflightResult = await preflight(chainId)
    if (!preflightResult.success) {
      const error = preflightResult.errors[0] || 'Preflight check failed'
      setTxState({
        state: 'FAILED',
        txHash: null,
        error,
        isOptimistic: false,
      })
      return { error }
    }

    // Start sending
    setTxState({
      state: 'SENDING',
      txHash: null,
      error: null,
      isOptimistic: false,
    })

    try {
      const client = await getClientForChain({ id: chainId })
      if (!client) {
        throw new Error('Smart wallet client not available')
      }

      // Send transaction
      const hash = await client.sendTransaction({
        account: client.account!,
        to: params.to,
        data: params.data,
        value: params.value ?? BigInt(0),
      })

      // OPTIMISTIC: Show success immediately
      setTxState({
        state: 'CONFIRMED',
        txHash: hash,
        error: null,
        isOptimistic: true,
      })

      // Background confirmation (don't await in main flow)
      confirmInBackground(hash, chainId)

      return { hash }

    } catch (err: any) {
      const error = err.message || 'Transaction failed'
      setTxState({
        state: 'FAILED',
        txHash: null,
        error,
        isOptimistic: false,
      })
      return { error }
    }
  }, [preflight, getClientForChain])

  /**
   * Confirm transaction in background
   * Updates isOptimistic to false when confirmed on chain
   */
  const confirmInBackground = useCallback(async (hash: Hash, chainId: number) => {
    try {
      const chain = CHAINS[chainId]
      if (!chain) return

      const publicClient = createPublicClient({
        chain,
        transport: http(),
      })

      // Wait for receipt
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
        timeout: 60_000, // 1 minute timeout
      })

      if (receipt.status === 'success') {
        // Transaction confirmed on chain
        setTxState(s => ({
          ...s,
          isOptimistic: false,
        }))
      } else {
        // Transaction reverted
        setTxState({
          state: 'FAILED',
          txHash: hash,
          error: 'Transaction reverted on chain',
          isOptimistic: false,
        })
      }
    } catch (err) {
      console.warn('Background confirmation failed:', err)
      // Don't change state - we already showed success optimistically
      // User can check explorer if needed
    }
  }, [])

  /**
   * Reset to ready state
   */
  const reset = useCallback(() => {
    if (authenticated && embeddedWallet && smartWalletClient) {
      setTxState({
        state: 'READY',
        txHash: null,
        error: null,
        isOptimistic: false,
      })
    }
  }, [authenticated, embeddedWallet, smartWalletClient])

  return {
    // State
    ...txState,
    
    // Derived
    isReady: txState.state === 'READY',
    isSending: txState.state === 'SENDING',
    isSuccess: txState.state === 'CONFIRMED',
    isFailed: txState.state === 'FAILED',
    
    // Addresses
    signerAddress,
    smartWalletAddress,
    
    // Methods
    send,
    reset,
    preflight,
    login,
  }
}

/**
 * State machine transition rules:
 * 
 * AUTHENTICATING
 *   └─> (on login) WALLET_CREATING
 *   └─> (if already logged in) WALLET_CREATING
 * 
 * WALLET_CREATING
 *   └─> (on wallet ready) READY
 * 
 * READY
 *   └─> (on send()) SENDING
 * 
 * SENDING
 *   └─> (on hash) CONFIRMED (optimistic)
 *   └─> (on error) FAILED
 * 
 * CONFIRMED
 *   └─> (on reset) READY
 *   └─> (on chain revert) FAILED
 * 
 * FAILED
 *   └─> (on reset) READY
 *   └─> (on retry) SENDING
 */
