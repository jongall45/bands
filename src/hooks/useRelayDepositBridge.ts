'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useWallets } from '@privy-io/react-auth'
import { useBalance, useAccount } from 'wagmi'
import { parseUnits, encodeFunctionData } from 'viem'
import { base, arbitrum } from 'viem/chains'
import { 
  getDepositAddressQuote, 
  getBridgeStatus, 
  getRelayDeepLink,
  type DepositQuote 
} from '@/lib/relay-bridge'

const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const USDC_ARB = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'

// Simple ERC20 transfer ABI
const ERC20_TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const

export type BridgeStatus = 
  | 'idle' 
  | 'quoting' 
  | 'ready' 
  | 'confirming'
  | 'switching'
  | 'depositing' 
  | 'bridging' 
  | 'complete' 
  | 'error'
  | 'wrong_chain'

export function useRelayDepositBridge() {
  const { address } = useAccount()
  const { wallets } = useWallets()
  const [status, setStatus] = useState<BridgeStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [quote, setQuote] = useState<DepositQuote | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [currentChainId, setCurrentChainId] = useState<number | null>(null)
  
  const pollingRef = useRef<NodeJS.Timeout | null>(null)
  
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy')
  
  // Balances
  const { data: baseBalance, refetch: refetchBase } = useBalance({
    address,
    token: USDC_BASE as `0x${string}`,
    chainId: base.id,
  })

  const { data: arbBalance, refetch: refetchArb } = useBalance({
    address,
    token: USDC_ARB as `0x${string}`,
    chainId: arbitrum.id,
  })
  
  // Check current chain on mount and when wallet changes
  useEffect(() => {
    const checkChain = async () => {
      if (!embeddedWallet) return
      try {
        const provider = await embeddedWallet.getEthereumProvider()
        const chainIdHex = await provider.request({ method: 'eth_chainId' })
        const chainId = parseInt(chainIdHex as string, 16)
        setCurrentChainId(chainId)
        console.log('📍 Current wallet chain:', chainId, chainId === 8453 ? '(Base)' : chainId === 42161 ? '(Arbitrum)' : '')
      } catch (e) {
        console.error('Failed to get chain:', e)
      }
    }
    checkChain()
  }, [embeddedWallet])
  
  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearTimeout(pollingRef.current)
      }
    }
  }, [])
  
  /**
   * Switch wallet to Base network
   */
  const switchToBase = useCallback(async (): Promise<boolean> => {
    if (!embeddedWallet) return false
    
    setStatus('switching')
    setStatusMessage('Switching to Base network...')
    
    try {
      console.log('🔄 Switching to Base (8453)...')
      await embeddedWallet.switchChain(8453)
      
      // Wait for switch to propagate
      await new Promise(r => setTimeout(r, 1000))
      
      // Verify the switch
      const provider = await embeddedWallet.getEthereumProvider()
      const chainIdHex = await provider.request({ method: 'eth_chainId' })
      const chainId = parseInt(chainIdHex as string, 16)
      
      console.log('📍 Chain after switch:', chainId)
      setCurrentChainId(chainId)
      
      if (chainId === 8453) {
        console.log('✅ Successfully switched to Base')
        setStatus('ready')
        return true
      } else {
        console.error('❌ Switch failed, still on chain:', chainId)
        return false
      }
    } catch (e) {
      console.error('❌ Chain switch error:', e)
      return false
    }
  }, [embeddedWallet])
  
  /**
   * Get a fresh quote with deposit address
   */
  const getQuote = useCallback(async (amount: string) => {
    const walletAddress = embeddedWallet?.address || address
    
    if (!walletAddress) {
      setError('Wallet not connected')
      return null
    }
    
    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      return null
    }
    
    setStatus('quoting')
    setError(null)
    
    try {
      const newQuote = await getDepositAddressQuote(amount, walletAddress)
      setQuote(newQuote)
      setStatus('ready')
      console.log('✅ Quote received:', newQuote)
      return newQuote
    } catch (err: any) {
      console.error('Quote error:', err)
      setError(err.message || 'Failed to get quote')
      setStatus('error')
      return null
    }
  }, [embeddedWallet?.address, address])
  
  /**
   * Execute the bridge by sending USDC to the deposit address
   * IMPORTANT: Wallet MUST be on Base for this to work!
   */
  const executeBridge = useCallback(async (amount: string) => {
    if (!embeddedWallet || !quote?.depositAddress) {
      setError('No quote or wallet available')
      return false
    }
    
    // Check if quote is still valid (30 second window)
    if (Date.now() > quote.expiresAt) {
      setError('Quote expired. Getting new quote...')
      setStatus('quoting')
      const newQuote = await getQuote(amount)
      if (!newQuote) return false
    }
    
    // Get current chain
    const provider = await embeddedWallet.getEthereumProvider()
    let chainIdHex = await provider.request({ method: 'eth_chainId' })
    let chainId = parseInt(chainIdHex as string, 16)
    
    console.log('╔══════════════════════════════════════╗')
    console.log('║     DEPOSIT ADDRESS BRIDGE           ║')
    console.log('╚══════════════════════════════════════╝')
    console.log('📍 Current chain:', chainId, chainId === 8453 ? '(Base ✓)' : '(NOT Base ✗)')
    
    // If not on Base, try to switch
    if (chainId !== 8453) {
      console.log('⚠️ Wallet is NOT on Base, attempting to switch...')
      setStatus('switching')
      setStatusMessage('Switching to Base network...')
      
      try {
        await embeddedWallet.switchChain(8453)
        await new Promise(r => setTimeout(r, 1000))
        
        // Check again
        chainIdHex = await provider.request({ method: 'eth_chainId' })
        chainId = parseInt(chainIdHex as string, 16)
        console.log('📍 Chain after switch attempt:', chainId)
        setCurrentChainId(chainId)
        
        if (chainId !== 8453) {
          // Switch failed - show error with instructions
          console.error('❌ Chain switch failed!')
          setError('Wallet is on wrong network. Please log out and log back in to reset to Base network.')
          setStatus('wrong_chain')
          return false
        }
      } catch (e) {
        console.error('❌ Chain switch error:', e)
        setError('Unable to switch to Base. Please log out and log back in.')
        setStatus('wrong_chain')
        return false
      }
    }
    
    // Now we should be on Base - proceed with the transfer
    setStatus('confirming')
    setStatusMessage('Confirm in your wallet...')
    setError(null)
    
    try {
      const amountWei = parseUnits(amount, 6)
      
      // Encode ERC20 transfer to deposit address
      const data = encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [quote.depositAddress as `0x${string}`, amountWei],
      })
      
      console.log('📤 Sending USDC to deposit address:', quote.depositAddress)
      console.log('   Amount:', amount, 'USDC')
      console.log('   Request ID:', quote.requestId)
      console.log('   Contract:', USDC_BASE, '(Base USDC)')
      
      setStatus('depositing')
      setStatusMessage('Sending to bridge...')
      
      // Send the ERC20 transfer transaction ON BASE
      const hash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: embeddedWallet.address,
          to: USDC_BASE,  // Base USDC contract
          data: data,
          value: '0x0',
        }],
      })
      
      console.log('✅ Deposit transaction submitted:', hash)
      setTxHash(hash as string)
      setStatus('bridging')
      setStatusMessage('Bridge in progress...')
      
      // Start polling for completion
      pollBridgeStatus(quote.requestId)
      
      return true
    } catch (err: any) {
      console.error('Bridge execution error:', err)
      
      // Parse the error for better messaging
      let errorMessage = err.message || 'Bridge failed'
      const msg = errorMessage.toLowerCase()
      
      if (msg.includes('insufficient') && msg.includes('fund')) {
        errorMessage = 'Insufficient ETH for gas. You need ETH on Base to pay for this transaction.'
      } else if (msg.includes('user rejected') || msg.includes('denied') || msg.includes('cancelled')) {
        errorMessage = 'Transaction cancelled'
      } else if (msg.includes('chain') || msg.includes('network')) {
        errorMessage = 'Network error. Please log out and log back in to reset your wallet to Base.'
      }
      
      setError(errorMessage)
      setStatus('error')
      return false
    }
  }, [embeddedWallet, quote, getQuote])
  
  /**
   * Poll Relay API for bridge completion status
   */
  const pollBridgeStatus = useCallback(async (requestId: string) => {
    const maxAttempts = 120 // 10 minutes at 5s intervals
    let attempts = 0
    
    const poll = async () => {
      try {
        const result = await getBridgeStatus(requestId)
        console.log('🔄 Bridge status:', result.status)
        
        if (result.status === 'success' || result.status === 'completed') {
          setStatus('complete')
          setStatusMessage('Bridge complete!')
          
          // Refresh balances
          setTimeout(() => {
            refetchBase()
            refetchArb()
          }, 2000)
          return
        }
        
        if (result.status === 'failed' || result.status === 'refunded') {
          setError('Bridge failed - funds will be refunded to your wallet')
          setStatus('error')
          return
        }
        
        // Still pending, continue polling
        attempts++
        if (attempts < maxAttempts) {
          pollingRef.current = setTimeout(poll, 5000)
        } else {
          console.warn('Status polling timeout - bridge may still complete')
          setStatusMessage('Taking longer than expected... bridge may still complete')
        }
      } catch (e) {
        console.error('Status check error:', e)
        attempts++
        if (attempts < maxAttempts) {
          pollingRef.current = setTimeout(poll, 5000)
        }
      }
    }
    
    // Start polling after a short delay
    pollingRef.current = setTimeout(poll, 3000)
  }, [refetchBase, refetchArb])
  
  /**
   * Reset the bridge state
   */
  const reset = useCallback(() => {
    setStatus('idle')
    setError(null)
    setQuote(null)
    setTxHash(null)
    setStatusMessage('')
    if (pollingRef.current) {
      clearTimeout(pollingRef.current)
    }
  }, [])
  
  /**
   * Get fallback URL to Relay's UI
   */
  const getFallbackUrl = useCallback((amount: string) => {
    const walletAddress = embeddedWallet?.address || address
    if (!walletAddress) return ''
    return getRelayDeepLink(amount, walletAddress)
  }, [embeddedWallet?.address, address])
  
  // Check if on wrong chain
  const isOnWrongChain = currentChainId !== null && currentChainId !== 8453
  
  return {
    // State
    status,
    statusMessage,
    error,
    quote,
    txHash,
    walletAddress: embeddedWallet?.address || address,
    
    // Chain state
    currentChainId,
    isOnWrongChain,
    
    // Balances
    baseBalance: baseBalance?.formatted || '0',
    arbBalance: arbBalance?.formatted || '0',
    
    // Actions
    getQuote,
    executeBridge,
    switchToBase,
    reset,
    getFallbackUrl,
    clearError: useCallback(() => setError(null), []),
    
    // Computed
    isLoading: ['quoting', 'confirming', 'switching', 'depositing', 'bridging'].includes(status),
    canExecute: status === 'ready' && !!quote,
  }
}
