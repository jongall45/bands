'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useWallets } from '@privy-io/react-auth'
import { useBalance, useAccount } from 'wagmi'
import { parseUnits, encodeFunctionData, formatUnits } from 'viem'
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
  | 'depositing' 
  | 'bridging' 
  | 'complete' 
  | 'error'

export function useRelayDepositBridge() {
  const { address } = useAccount()
  const { wallets } = useWallets()
  const [status, setStatus] = useState<BridgeStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [quote, setQuote] = useState<DepositQuote | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  
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
  
  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearTimeout(pollingRef.current)
      }
    }
  }, [])
  
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
   * This is a simple ERC20 transfer - no chain switching complexity!
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
    
    setStatus('confirming')
    setStatusMessage('Confirm in your wallet...')
    setError(null)
    
    try {
      const provider = await embeddedWallet.getEthereumProvider()
      const amountWei = parseUnits(amount, 6)
      
      // Encode ERC20 transfer to deposit address
      const data = encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [quote.depositAddress as `0x${string}`, amountWei],
      })
      
      console.log('╔══════════════════════════════════════╗')
      console.log('║     DEPOSIT ADDRESS BRIDGE           ║')
      console.log('╚══════════════════════════════════════╝')
      console.log('📤 Sending USDC to deposit address:', quote.depositAddress)
      console.log('   Amount:', amount, 'USDC')
      console.log('   Request ID:', quote.requestId)
      
      // Attempt to switch to Base first (best effort)
      try {
        console.log('🔄 Attempting to switch to Base...')
        await embeddedWallet.switchChain(8453)
        await new Promise(r => setTimeout(r, 500))
        console.log('✅ Chain switch completed')
      } catch (switchError) {
        console.warn('⚠️ Chain switch warning (may still work):', switchError)
      }
      
      setStatus('depositing')
      setStatusMessage('Sending to bridge...')
      
      // Send the ERC20 transfer transaction
      // Transaction goes to USDC contract on Base, calling transfer()
      const hash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: embeddedWallet.address,
          to: USDC_BASE,  // USDC contract on Base
          data: data,
          value: '0x0',   // No ETH value for ERC20 transfer
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
        errorMessage = 'Insufficient ETH for gas on Base'
      } else if (msg.includes('user rejected') || msg.includes('denied') || msg.includes('cancelled')) {
        errorMessage = 'Transaction cancelled'
      } else if (msg.includes('chain')) {
        errorMessage = 'Network error - try using the external link'
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
          // Timeout - but bridge may still complete
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
    
    // Start polling after a short delay (give time for tx to be indexed)
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
  
  return {
    // State
    status,
    statusMessage,
    error,
    quote,
    txHash,
    walletAddress: embeddedWallet?.address || address,
    
    // Balances
    baseBalance: baseBalance?.formatted || '0',
    arbBalance: arbBalance?.formatted || '0',
    
    // Actions
    getQuote,
    executeBridge,
    reset,
    getFallbackUrl,
    clearError: useCallback(() => setError(null), []),
    
    // Computed
    isLoading: ['quoting', 'confirming', 'depositing', 'bridging'].includes(status),
    canExecute: status === 'ready' && !!quote,
  }
}

