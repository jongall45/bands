'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useWallets } from '@privy-io/react-auth'
import { usePublicClient, useChainId } from 'wagmi'
import { formatUnits, parseUnits, encodeFunctionData } from 'viem'
import { base, arbitrum, optimism, mainnet } from 'viem/chains'
import {
  Loader2,
  ArrowDown,
  AlertCircle,
  Check,
  ChevronDown,
  Wallet,
  ArrowRightLeft,
  ExternalLink
} from 'lucide-react'
import { useSolanaAuth } from '@/hooks/useSolanaAuth'

// ============================================
// CONSTANTS
// ============================================

// Solana chain ID for Relay API
const SOLANA_CHAIN_ID = 792703809 // Relay uses this ID for Solana mainnet

const CHAINS = [
  { id: base.id, name: 'Base', icon: '🔵', chain: base, isSolana: false },
  { id: arbitrum.id, name: 'Arbitrum', icon: '🔷', chain: arbitrum, isSolana: false },
  { id: optimism.id, name: 'Optimism', icon: '🔴', chain: optimism, isSolana: false },
  { id: mainnet.id, name: 'Ethereum', icon: '⟠', chain: mainnet, isSolana: false },
  { id: SOLANA_CHAIN_ID, name: 'Solana', icon: '◎', chain: null, isSolana: true },
]

// EVM tokens
const EVM_TOKENS: Record<string, Record<number, { address: string; decimals: number; symbol: string; name: string }>> = {
  USDC: {
    [base.id]: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, symbol: 'USDC', name: 'USD Coin' },
    [arbitrum.id]: { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', decimals: 6, symbol: 'USDC', name: 'USD Coin' },
    [optimism.id]: { address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', decimals: 6, symbol: 'USDC', name: 'USD Coin' },
    [mainnet.id]: { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', decimals: 6, symbol: 'USDC', name: 'USD Coin' },
  },
  ETH: {
    [base.id]: { address: '0x0000000000000000000000000000000000000000', decimals: 18, symbol: 'ETH', name: 'Ethereum' },
    [arbitrum.id]: { address: '0x0000000000000000000000000000000000000000', decimals: 18, symbol: 'ETH', name: 'Ethereum' },
    [optimism.id]: { address: '0x0000000000000000000000000000000000000000', decimals: 18, symbol: 'ETH', name: 'Ethereum' },
    [mainnet.id]: { address: '0x0000000000000000000000000000000000000000', decimals: 18, symbol: 'ETH', name: 'Ethereum' },
  },
}

// Solana tokens
const SOLANA_TOKENS: Record<string, { address: string; decimals: number; symbol: string; name: string }> = {
  SOL: { address: '11111111111111111111111111111111', decimals: 9, symbol: 'SOL', name: 'Solana' },
  USDC: { address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6, symbol: 'USDC', name: 'USD Coin' },
}

// Combined tokens helper
const TOKENS: Record<string, Record<number, { address: string; decimals: number; symbol: string; name: string }>> = {
  USDC: {
    ...EVM_TOKENS.USDC,
    [SOLANA_CHAIN_ID]: SOLANA_TOKENS.USDC,
  },
  ETH: {
    ...EVM_TOKENS.ETH,
  },
  SOL: {
    [SOLANA_CHAIN_ID]: SOLANA_TOKENS.SOL,
  },
}

// ERC20 ABI for balance and transfer
const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

// ============================================
// TYPES
// ============================================
type SwapState = 'idle' | 'quoting' | 'ready' | 'executing' | 'polling' | 'success' | 'error'

interface Quote {
  amountOut: string
  amountOutFormatted: string
  gasFeeUsd: string
  relayFeeUsd: string
  totalFeeUsd: string
  depositAddress: string | null // Deposit address for cross-chain
  requestId: string | null
  steps: any[]
}

interface PrivyRelaySwapProps {
  defaultFromChain?: number
  defaultToChain?: number
  defaultFromToken?: 'USDC' | 'ETH' | 'SOL'
  defaultToToken?: 'USDC' | 'ETH' | 'SOL'
  onSuccess?: (txHash: string) => void
  onError?: (error: string) => void
}

// Helper to get available tokens for a chain
const getTokensForChain = (chainId: number): string[] => {
  if (chainId === SOLANA_CHAIN_ID) {
    return ['SOL', 'USDC']
  }
  return ['USDC', 'ETH']
}

// ============================================
// COMPONENT
// ============================================
export function PrivyRelaySwap({
  defaultFromChain = base.id,
  defaultToChain = base.id,
  defaultFromToken = 'USDC',
  defaultToToken = 'ETH',
  onSuccess,
  onError,
}: PrivyRelaySwapProps) {
  const { wallets } = useWallets()
  const publicClient = usePublicClient({ chainId: base.id })

  // Solana wallet hook
  const { solanaAddress, hasSolanaWallet } = useSolanaAuth()

  // Get the embedded wallet (Privy)
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy')
  const address = embeddedWallet?.address as `0x${string}` | undefined

  // State
  const [state, setState] = useState<SwapState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)

  // Form state
  const [fromChainId, setFromChainId] = useState(defaultFromChain)
  const [toChainId, setToChainId] = useState(defaultToChain)
  const [fromToken, setFromToken] = useState<'USDC' | 'ETH' | 'SOL'>(defaultFromToken)
  const [toToken, setToToken] = useState<'USDC' | 'ETH' | 'SOL'>(defaultToToken)

  // Check if destination is Solana
  const isToSolana = toChainId === SOLANA_CHAIN_ID
  const isFromSolana = fromChainId === SOLANA_CHAIN_ID

  // Get the appropriate recipient address based on destination chain
  const recipientAddress = isToSolana ? solanaAddress : address
  const [amount, setAmount] = useState('')
  const [quote, setQuote] = useState<Quote | null>(null)

  // Balances
  const [fromBalance, setFromBalance] = useState<string>('0')
  const [toBalance, setToBalance] = useState<string>('0')

  // Dropdowns
  const [showFromChainSelect, setShowFromChainSelect] = useState(false)
  const [showToChainSelect, setShowToChainSelect] = useState(false)
  const [showFromTokenSelect, setShowFromTokenSelect] = useState(false)
  const [showToTokenSelect, setShowToTokenSelect] = useState(false)

  // Reset tokens when chain changes to ensure valid combinations
  useEffect(() => {
    const availableTokens = getTokensForChain(toChainId)
    if (!availableTokens.includes(toToken)) {
      setToToken(availableTokens[0] as 'USDC' | 'ETH' | 'SOL')
    }
  }, [toChainId, toToken])

  useEffect(() => {
    const availableTokens = getTokensForChain(fromChainId)
    if (!availableTokens.includes(fromToken)) {
      setFromToken(availableTokens[0] as 'USDC' | 'ETH' | 'SOL')
    }
  }, [fromChainId, fromToken])

  // ============================================
  // FETCH BALANCES
  // ============================================
  const fetchBalances = useCallback(async () => {
    if (!address || !embeddedWallet) return

    try {
      const provider = await embeddedWallet.getEthereumProvider()
      
      // From token balance
      const fromTokenInfo = TOKENS[fromToken][fromChainId]
      if (fromTokenInfo) {
        if (fromTokenInfo.address === '0x0000000000000000000000000000000000000000') {
          // Native ETH
          const balance = await provider.request({
            method: 'eth_getBalance',
            params: [address, 'latest'],
          }) as string
          setFromBalance(formatUnits(BigInt(balance), 18))
        } else {
          // ERC20
          const chainConfig = CHAINS.find(c => c.id === fromChainId)
          if (chainConfig && publicClient) {
            const balance = await publicClient.readContract({
              address: fromTokenInfo.address as `0x${string}`,
              abi: ERC20_ABI,
              functionName: 'balanceOf',
              args: [address],
            })
            setFromBalance(formatUnits(balance as bigint, fromTokenInfo.decimals))
          }
        }
      }

      // To token balance (on destination chain)
      const toTokenInfo = TOKENS[toToken][toChainId]
      if (toTokenInfo) {
        if (toTokenInfo.address === '0x0000000000000000000000000000000000000000') {
          const balance = await provider.request({
            method: 'eth_getBalance',
            params: [address, 'latest'],
          }) as string
          setToBalance(formatUnits(BigInt(balance), 18))
        } else {
          // For simplicity, we'll show 0 for other chains
          setToBalance('0')
        }
      }
    } catch (error) {
      console.error('Error fetching balances:', error)
    }
  }, [address, embeddedWallet, fromChainId, toChainId, fromToken, toToken, publicClient])

  // Fetch balances on mount and when params change
  useEffect(() => {
    fetchBalances()
  }, [fetchBalances])

  // Track if this is a cross-chain swap (bridge)
  const isCrossChain = fromChainId !== toChainId

  // Generate fallback URL for Relay website
  const getRelayFallbackUrl = useCallback(() => {
    const fromTokenInfo = TOKENS[fromToken][fromChainId]
    const toTokenInfo = TOKENS[toToken][toChainId]
    if (!fromTokenInfo || !toTokenInfo || !address) return 'https://relay.link'
    
    const amountWei = amount ? parseUnits(amount, fromTokenInfo.decimals).toString() : '0'
    const params = new URLSearchParams({
      fromChainId: fromChainId.toString(),
      toChainId: toChainId.toString(),
      fromCurrency: fromTokenInfo.address,
      toCurrency: toTokenInfo.address,
      amount: amountWei,
      toAddress: address,
    })
    return `https://relay.link/swap?${params.toString()}`
  }, [fromChainId, toChainId, fromToken, toToken, amount, address])

  // ============================================
  // FETCH QUOTE FROM RELAY
  // ============================================
  const fetchQuote = useCallback(async () => {
    // For Solana destination, we need both EVM and Solana addresses
    const userAddress = address
    const destAddress = isToSolana ? solanaAddress : address

    if (!userAddress || !amount || parseFloat(amount) <= 0) {
      setQuote(null)
      return
    }

    // Check if swapping to Solana but no Solana wallet
    if (isToSolana && !solanaAddress) {
      setErrorMessage('Solana wallet not available. Please log in again.')
      setState('error')
      return
    }

    setState('quoting')
    setErrorMessage(null)

    try {
      const fromTokenInfo = TOKENS[fromToken]?.[fromChainId]
      const toTokenInfo = TOKENS[toToken]?.[toChainId]

      if (!fromTokenInfo || !toTokenInfo) {
        throw new Error('Invalid token configuration')
      }

      const amountWei = parseUnits(amount, fromTokenInfo.decimals).toString()
      const isSameChain = fromChainId === toChainId

      // Build request - different params for same-chain vs cross-chain
      // IMPORTANT: For Solana destination, recipient must be the Solana wallet address
      const requestBody: Record<string, any> = {
        user: userAddress,
        recipient: destAddress, // Use Solana address for Solana destination
        originChainId: fromChainId,
        destinationChainId: toChainId,
        originCurrency: fromTokenInfo.address,
        destinationCurrency: toTokenInfo.address,
        amount: amountWei,
        tradeType: 'EXACT_INPUT',
        referrer: 'bands.cash',
      }

      // Only use deposit address for EVM-to-EVM cross-chain swaps
      // Per Relay docs: Deposit addresses are NOT supported for Solana routes (canonical bridges)
      if (!isSameChain && !isToSolana && !isFromSolana) {
        requestBody.useDepositAddress = true
        requestBody.refundTo = userAddress // Refund to EVM wallet
        requestBody.usePermit = false
        requestBody.useExternalLiquidity = true // Use external liquidity for EVM-to-EVM
      }

      // For Solana routes: Let Relay handle routing automatically
      // Don't set useDepositAddress, useExternalLiquidity, etc.
      if (isToSolana || isFromSolana) {
        console.log('[PrivyRelaySwap] Solana cross-chain route - using minimal params')
      }

      console.log(`🔍 Fetching ${isSameChain ? 'same-chain' : 'cross-chain'}${isToSolana ? ' (to Solana)' : ''} quote:`, requestBody)
      console.log(`📍 Recipient address: ${destAddress} (${isToSolana ? 'Solana' : 'EVM'})`)

      const response = await fetch('https://api.relay.link/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `Quote failed: ${response.status}`)
      }

      const data = await response.json()
      console.log('📊 Quote received:', data)

      const amountOut = data.details?.currencyOut?.amount || '0'
      const gasFee = parseFloat(data.fees?.gas?.amountUsd || '0')
      const relayFee = parseFloat(data.fees?.relayer?.amountUsd || '0')

      // Extract deposit address (should always be present with useDepositAddress: true)
      const step = data.steps?.[0]
      const depositAddress = step?.depositAddress || null
      const requestId = step?.requestId || data.requestId || null

      if (!depositAddress) {
        console.warn('⚠️ No deposit address in quote response')
      }

      setQuote({
        amountOut,
        amountOutFormatted: formatUnits(BigInt(amountOut), toTokenInfo.decimals),
        gasFeeUsd: gasFee.toFixed(2),
        relayFeeUsd: relayFee.toFixed(2),
        totalFeeUsd: (gasFee + relayFee).toFixed(2),
        depositAddress,
        requestId,
        steps: data.steps || [],
      })
      setState('ready')
    } catch (error: any) {
      console.error('❌ Quote error:', error)
      setErrorMessage(error.message || 'Failed to get quote')
      setState('error')
      setQuote(null)
    }
  }, [address, amount, fromChainId, toChainId, fromToken, toToken, isToSolana, solanaAddress])

  // ============================================
  // CHECK BRIDGE STATUS (for cross-chain via deposit address)
  // ============================================
  const checkBridgeStatus = useCallback(async (requestId: string): Promise<'pending' | 'success' | 'failed'> => {
    try {
      const response = await fetch(
        `https://api.relay.link/intents/status?requestId=${requestId}`,
        { method: 'GET', headers: { 'Content-Type': 'application/json' } }
      )
      
      if (!response.ok) return 'pending'
      
      const data = await response.json()
      console.log('📊 Bridge status:', data.status)
      
      if (data.status === 'success' || data.status === 'completed') return 'success'
      if (data.status === 'failed' || data.status === 'refunded') return 'failed'
      return 'pending'
    } catch {
      return 'pending'
    }
  }, [])

  // ============================================
  // EXECUTE SWAP
  // ============================================
  const executeSwap = useCallback(async () => {
    if (!embeddedWallet || !address || !quote || !amount) return

    setState('executing')
    setErrorMessage(null)

    try {
      const fromTokenInfo = TOKENS[fromToken][fromChainId]
      const toTokenInfo = TOKENS[toToken][toChainId]

      if (!fromTokenInfo || !toTokenInfo) {
        throw new Error('Invalid token configuration')
      }

      const amountWei = parseUnits(amount, fromTokenInfo.decimals)
      const isCrossChainSwap = fromChainId !== toChainId

      // Get provider from embedded wallet
      const provider = await embeddedWallet.getEthereumProvider()

      // Ensure we're on the correct source chain
      const currentChainId = await provider.request({ method: 'eth_chainId' })
      const expectedChainHex = `0x${fromChainId.toString(16)}`
      
      if (currentChainId !== expectedChainHex) {
        console.log('🔄 Switching chain from', currentChainId, 'to', expectedChainHex)
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: expectedChainHex }],
        })
      }

      // ============================================
      // EXECUTE BASED ON SWAP TYPE
      // ============================================
      
      if (isCrossChainSwap && quote.depositAddress) {
        // ============================================
        // CROSS-CHAIN: Use deposit address method
        // ============================================
        console.log('╔════════════════════════════════════════╗')
        console.log('║     CROSS-CHAIN BRIDGE (Deposit)       ║')
        console.log('╚════════════════════════════════════════╝')
        console.log('📍 Deposit address:', quote.depositAddress)
        console.log('💰 Amount:', amount, fromToken)
        console.log('🔗 Request ID:', quote.requestId)

        let hash: string

        if (fromTokenInfo.address === '0x0000000000000000000000000000000000000000') {
          hash = await provider.request({
            method: 'eth_sendTransaction',
            params: [{
              from: address,
              to: quote.depositAddress,
              value: `0x${amountWei.toString(16)}`,
            }],
          }) as string
        } else {
          const transferData = encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'transfer',
            args: [quote.depositAddress as `0x${string}`, amountWei],
          })

          hash = await provider.request({
            method: 'eth_sendTransaction',
            params: [{
              from: address,
              to: fromTokenInfo.address,
              data: transferData,
            }],
          }) as string
        }

        console.log('✅ Deposit transaction submitted:', hash)
        setTxHash(hash)

        // Poll for completion
        if (quote.requestId) {
          setState('polling')
          
          let attempts = 0
          const maxAttempts = 60
          
          while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000))
            const status = await checkBridgeStatus(quote.requestId)
            
            if (status === 'success') {
              console.log('✅ Bridge completed!')
              setState('success')
              onSuccess?.(hash)
              setTimeout(fetchBalances, 3000)
              return
            }
            
            if (status === 'failed') {
              throw new Error('Bridge failed - funds may be refunded')
            }
            
            attempts++
          }
          
          console.log('⏰ Status check timed out, but transaction was sent')
          setState('success')
          onSuccess?.(hash)
        } else {
          setState('success')
          onSuccess?.(hash)
        }
        
        setTimeout(fetchBalances, 3000)
        
      } else {
        // ============================================
        // STEPS-BASED SWAP: Same-chain OR cross-chain to Solana
        // For EVM → Solana: Execute EVM deposit, Relay bridges automatically
        // ============================================
        const isEvmToSolana = isToSolana && !isFromSolana

        if (isEvmToSolana) {
          console.log('╔════════════════════════════════════════╗')
          console.log('║     EVM → SOLANA CROSS-CHAIN           ║')
          console.log('╚════════════════════════════════════════╝')
          console.log('🌉 Bridging from EVM to Solana')
          console.log('📍 Solana recipient:', solanaAddress)
        } else {
          console.log('╔════════════════════════════════════════╗')
          console.log('║     SAME-CHAIN SWAP                    ║')
          console.log('╚════════════════════════════════════════╝')
        }
        console.log('💰 Amount:', amount, fromToken, '→', toToken)
        console.log('📋 Steps from quote:', quote.steps)

        // ERC20 approve function selector
        const APPROVE_SELECTOR = '0x095ea7b3'

        // Execute each step/transaction from the quote
        let lastTxHash: string | null = null
        let stepIndex = 0

        for (const step of quote.steps || []) {
          console.log(`📌 Processing step ${++stepIndex}:`, step.id, step.action || '')
          
          for (const item of step.items || []) {
            if (item.status === 'incomplete' && item.data) {
              let txData = item.data.data

              // Check if this is an approve transaction and fix the amount
              const isApproveStep = step.id === 'approve' || 
                                    step.action?.toLowerCase().includes('approve') ||
                                    (txData && txData.startsWith(APPROVE_SELECTOR))

              if (isApproveStep && txData && txData.startsWith(APPROVE_SELECTOR)) {
                // Override approval amount to exact swap amount for security
                // approve(address spender, uint256 amount)
                // Data format: 0x095ea7b3 + 32 bytes spender + 32 bytes amount
                const spender = txData.slice(10, 74) // Keep the spender address
                const exactAmount = amountWei.toString(16).padStart(64, '0')
                txData = APPROVE_SELECTOR + spender + exactAmount
                console.log('🔒 Fixed approval amount to exact swap amount:', amount, fromToken)
              }

              console.log('📤 Sending transaction:', {
                to: item.data.to,
                chainId: item.data.chainId,
                description: step.description || step.action,
                isApprove: isApproveStep,
              })

              const txParams: Record<string, string> = {
                from: address,
                to: item.data.to,
                data: txData,
              }

              if (item.data.value && item.data.value !== '0') {
                txParams.value = `0x${BigInt(item.data.value).toString(16)}`
              }

              // Add gas if provided
              if (item.data.gas) {
                txParams.gas = `0x${BigInt(item.data.gas).toString(16)}`
              }

              const hash = await provider.request({
                method: 'eth_sendTransaction',
                params: [txParams],
              }) as string

              console.log('✅ Transaction sent:', hash)
              lastTxHash = hash
              setTxHash(hash)

              // Wait a moment between transactions for approval to propagate
              if (isApproveStep) {
                console.log('⏳ Waiting for approval to confirm...')
                await new Promise(resolve => setTimeout(resolve, 3000))
              }
            }
          }
        }

        if (lastTxHash) {
          // For EVM → Solana cross-chain: poll for bridge completion
          if (isEvmToSolana && quote.requestId) {
            console.log('🌉 EVM deposit sent, polling for Solana bridge completion...')
            setState('polling')

            let attempts = 0
            const maxAttempts = 90 // 3 minutes (90 * 2s)

            while (attempts < maxAttempts) {
              await new Promise(resolve => setTimeout(resolve, 2000))
              const status = await checkBridgeStatus(quote.requestId)

              if (status === 'success') {
                console.log('✅ EVM → Solana bridge completed!')
                setState('success')
                onSuccess?.(lastTxHash)
                setTimeout(fetchBalances, 3000)
                return
              }

              if (status === 'failed') {
                throw new Error('Bridge to Solana failed - funds may be refunded')
              }

              attempts++
              if (attempts % 10 === 0) {
                console.log(`⏳ Still waiting for bridge... (${attempts * 2}s elapsed)`)
              }
            }

            console.log('⏰ Bridge status check timed out, but EVM deposit was sent')
            setState('success')
            onSuccess?.(lastTxHash)
          } else {
            setState('success')
            onSuccess?.(lastTxHash)
          }
          setTimeout(fetchBalances, 3000)
        } else {
          throw new Error('No transaction was executed - check quote steps')
        }
      }

    } catch (error: any) {
      console.error('❌ Swap error:', error)
      setErrorMessage(error.message || 'Swap failed')
      setState('error')
      onError?.(error.message)
    }
  }, [embeddedWallet, address, quote, amount, fromChainId, toChainId, fromToken, toToken, fetchBalances, onSuccess, onError, checkBridgeStatus, isToSolana, isFromSolana, solanaAddress])

  // ============================================
  // HELPERS
  // ============================================
  const handleAmountChange = (value: string) => {
    setAmount(value)
    setQuote(null)
    setState('idle')
  }

  const handleMax = () => {
    setAmount(fromBalance)
    setQuote(null)
    setState('idle')
  }

  const swapDirection = () => {
    // Don't allow swapping if source would become Solana (not supported yet)
    if (toChainId === SOLANA_CHAIN_ID) {
      console.log('Swapping from Solana is not yet supported')
      return
    }
    setFromChainId(toChainId)
    setToChainId(fromChainId)
    setFromToken(toToken)
    setToToken(fromToken)
    setQuote(null)
    setState('idle')
  }

  // Check if swap direction is allowed
  const canSwapDirection = toChainId !== SOLANA_CHAIN_ID

  const hasInsufficientBalance = parseFloat(amount || '0') > parseFloat(fromBalance)
  const amountNum = parseFloat(amount || '0')

  // ============================================
  // RENDER
  // ============================================
  if (!embeddedWallet || !address) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-[#111] border border-white/[0.06] rounded-3xl gap-3">
        <Wallet className="w-8 h-8 text-white/30" />
        <p className="text-white/40 text-sm">Connect wallet to swap</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Wallet Badge */}
      <div className="flex items-center justify-between p-3 bg-[#111] border border-white/[0.06] rounded-2xl">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-400 rounded-full" />
          <span className="text-white/60 text-xs font-mono">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
          {/* Show Solana wallet if swapping to Solana */}
          {isToSolana && solanaAddress && (
            <>
              <span className="text-white/30">→</span>
              <div className="w-2 h-2 bg-gradient-to-br from-[#9945FF] to-[#14F195] rounded-full" />
              <span className="text-white/60 text-xs font-mono">
                {solanaAddress.slice(0, 4)}...{solanaAddress.slice(-4)}
              </span>
            </>
          )}
        </div>
        <span className="text-green-400 text-xs font-medium">
          Privy Wallet
        </span>
      </div>

      {/* Warning if Solana selected but no Solana wallet */}
      {isToSolana && !solanaAddress && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
          <span className="text-yellow-400 text-xs">
            Solana wallet not found. Please log out and log in again to create one.
          </span>
        </div>
      )}

      {/* FROM Section */}
      <div className="bg-[#111] border border-white/[0.06] rounded-3xl p-5 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#ef4444]/10 via-transparent to-transparent pointer-events-none" />
        
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-3">
            <span className="text-white/50 text-sm font-medium">Sell</span>
            <button
              onClick={() => setShowFromChainSelect(!showFromChainSelect)}
              className="flex items-center gap-1 text-white/40 text-xs hover:text-white/60"
            >
              {CHAINS.find(c => c.id === fromChainId)?.icon} {CHAINS.find(c => c.id === fromChainId)?.name}
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>

          {/* Chain selector dropdown */}
          {showFromChainSelect && (
            <div className="absolute top-12 right-4 bg-[#1a1a1a] border border-white/10 rounded-xl p-2 z-20 min-w-[140px]">
              {/* Filter out Solana from source chains - only EVM -> Solana supported */}
              {CHAINS.filter(c => !c.isSolana).map(chain => (
                <button
                  key={chain.id}
                  onClick={() => {
                    setFromChainId(chain.id)
                    setShowFromChainSelect(false)
                    setQuote(null)
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${
                    fromChainId === chain.id ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5'
                  }`}
                >
                  {chain.icon} {chain.name}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3">
            <input
              type="number"
              value={amount}
              onChange={(e) => handleAmountChange(e.target.value)}
              placeholder="0"
              className="flex-1 bg-transparent text-white text-4xl font-bold outline-none placeholder:text-white/20 min-w-0"
            />

            <button
              onClick={() => setShowFromTokenSelect(!showFromTokenSelect)}
              className="flex items-center gap-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold rounded-2xl px-4 py-2.5 transition-colors"
            >
              <span>{fromToken}</span>
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {/* Token selector dropdown */}
          {showFromTokenSelect && (
            <div className="absolute top-24 right-4 bg-[#1a1a1a] border border-white/10 rounded-xl p-2 z-20 min-w-[120px]">
              {getTokensForChain(fromChainId).map(token => (
                <button
                  key={token}
                  onClick={() => {
                    setFromToken(token as 'USDC' | 'ETH' | 'SOL')
                    setShowFromTokenSelect(false)
                    setQuote(null)
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm ${
                    fromToken === token ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5'
                  }`}
                >
                  {token}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between mt-3">
            <span className="text-white/40 text-sm">
              ${amountNum > 0 ? amountNum.toFixed(2) : '0.00'}
            </span>
            <button
              onClick={handleMax}
              className="text-[#ef4444] text-sm font-medium hover:underline"
            >
              Balance: {parseFloat(fromBalance).toFixed(4)} {fromToken}
            </button>
          </div>
        </div>
      </div>

      {/* Swap Direction Button */}
      <div className="flex justify-center -my-1 relative z-10">
        <button
          onClick={swapDirection}
          disabled={!canSwapDirection}
          className={`w-12 h-12 border-4 border-[#F4F4F5] rounded-2xl flex items-center justify-center transition-all ${
            canSwapDirection
              ? 'bg-[#7C3AED] hover:bg-[#6D28D9] hover:scale-105 active:scale-95'
              : 'bg-[#7C3AED]/30 cursor-not-allowed'
          }`}
          title={!canSwapDirection ? 'Swapping from Solana is not yet supported' : 'Swap direction'}
        >
          <ArrowDown className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* TO Section */}
      <div className="bg-[#111] border border-white/[0.06] rounded-3xl p-5 relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-3">
            <span className="text-white/50 text-sm font-medium">Buy</span>
            <button
              onClick={() => setShowToChainSelect(!showToChainSelect)}
              className="flex items-center gap-1 text-white/40 text-xs hover:text-white/60"
            >
              {CHAINS.find(c => c.id === toChainId)?.icon} {CHAINS.find(c => c.id === toChainId)?.name}
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>

          {/* Chain selector dropdown */}
          {showToChainSelect && (
            <div className="absolute top-12 right-4 bg-[#1a1a1a] border border-white/10 rounded-xl p-2 z-20 min-w-[140px]">
              {CHAINS.map(chain => (
                <button
                  key={chain.id}
                  onClick={() => {
                    setToChainId(chain.id)
                    setShowToChainSelect(false)
                    setQuote(null)
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${
                    toChainId === chain.id ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5'
                  }`}
                >
                  {chain.icon} {chain.name}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="flex-1">
              {state === 'quoting' ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-white/40" />
                  <span className="text-white/40 text-lg">Getting quote...</span>
                </div>
              ) : (
                <span className="text-white text-4xl font-bold">
                  {quote ? parseFloat(quote.amountOutFormatted).toFixed(6) : '0'}
                </span>
              )}
            </div>

            <button
              onClick={() => setShowToTokenSelect(!showToTokenSelect)}
              className="flex items-center gap-2 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold rounded-2xl px-4 py-2.5 transition-colors"
            >
              <span>{toToken}</span>
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {/* Token selector dropdown */}
          {showToTokenSelect && (
            <div className="absolute top-24 right-4 bg-[#1a1a1a] border border-white/10 rounded-xl p-2 z-20 min-w-[120px]">
              {getTokensForChain(toChainId).map(token => (
                <button
                  key={token}
                  onClick={() => {
                    setToToken(token as 'USDC' | 'ETH' | 'SOL')
                    setShowToTokenSelect(false)
                    setQuote(null)
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm ${
                    toToken === token ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5'
                  }`}
                >
                  {token}
                </button>
              ))}
            </div>
          )}

          <div className="mt-3">
            <span className="text-white/40 text-sm">
              ${quote ? (parseFloat(quote.amountOutFormatted) * (toToken === 'USDC' ? 1 : toToken === 'SOL' ? 180 : 3500)).toFixed(2) : '0.00'}
            </span>
          </div>
        </div>
      </div>

      {/* Quote Details */}
      {quote && state === 'ready' && (
        <div className="bg-[#111] border border-white/[0.06] rounded-2xl p-4 space-y-2">
          {isCrossChain && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/40">Route</span>
              <span className="text-green-400/80 text-xs font-medium">
                {quote.depositAddress ? '✓ Deposit Address' : 'Execute API'}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/40">Rate</span>
            <span className="text-white/60">
              1 {fromToken} ≈ {(parseFloat(quote.amountOutFormatted) / amountNum).toFixed(6)} {toToken}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/40">Network Fee</span>
            <span className="text-white/60">${quote.gasFeeUsd}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/40">Relay Fee</span>
            <span className="text-white/60">${quote.relayFeeUsd}</span>
          </div>
          <div className="border-t border-white/[0.06] pt-2 flex items-center justify-between text-sm">
            <span className="text-white/60 font-medium">Total Fees</span>
            <span className="text-white font-medium">${quote.totalFeeUsd}</span>
          </div>
          {isCrossChain && (
            <div className="text-xs text-white/30 pt-1">
              ≈30 seconds via Relay
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {errorMessage && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <div>
              <span className="text-red-400 text-sm">{errorMessage}</span>
              <a
                href={getRelayFallbackUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="text-red-400/60 text-xs hover:underline flex items-center gap-1 mt-1"
              >
                Try on Relay.link <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Insufficient Balance */}
      {hasInsufficientBalance && amountNum > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
          <span className="text-yellow-400 text-sm">Insufficient {fromToken} balance</span>
        </div>
      )}

      {/* Polling (waiting for bridge) */}
      {state === 'polling' && txHash && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
            <span className="text-blue-400 font-medium">Bridge in progress...</span>
          </div>
          <p className="text-blue-400/60 text-xs mb-2">
            Your {fromToken} is being bridged to {CHAINS.find(c => c.id === toChainId)?.name}. This usually takes ~30 seconds.
          </p>
          <a
            href={`https://relay.link/transaction/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400/70 text-xs hover:underline font-mono inline-flex items-center gap-1"
          >
            Track on Relay <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      {/* Success */}
      {state === 'success' && txHash && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Check className="w-5 h-5 text-green-400" />
            <span className="text-green-400 font-medium">
              {isCrossChain ? 'Bridge Complete!' : 'Swap Complete!'}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <a
              href={`https://${fromChainId === base.id ? 'basescan.org' : fromChainId === arbitrum.id ? 'arbiscan.io' : 'etherscan.io'}/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-400/70 text-xs hover:underline font-mono inline-flex items-center gap-1"
            >
              View on Explorer <ExternalLink className="w-3 h-3" />
            </a>
            {isCrossChain && (
              <a
                href={`https://relay.link/transaction/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-400/70 text-xs hover:underline font-mono inline-flex items-center gap-1"
              >
                Track on Relay <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      )}

      {/* Action Button */}
      {state === 'success' ? (
        <button
          onClick={() => {
            setState('idle')
            setAmount('')
            setQuote(null)
            setTxHash(null)
          }}
          className="w-full py-4 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-2xl transition-all flex items-center justify-center gap-2"
        >
          <ArrowRightLeft className="w-5 h-5" />
          New {isCrossChain ? 'Bridge' : 'Swap'}
        </button>
      ) : state === 'polling' ? (
        <button
          disabled
          className="w-full py-4 bg-blue-500/30 text-white/60 font-semibold rounded-2xl flex items-center justify-center gap-2 cursor-not-allowed"
        >
          <Loader2 className="w-5 h-5 animate-spin" />
          Bridging in progress...
        </button>
      ) : (
        <button
          onClick={quote ? executeSwap : fetchQuote}
          disabled={
            !amount || 
            amountNum <= 0 || 
            hasInsufficientBalance || 
            state === 'quoting' || 
            state === 'executing'
          }
          className="w-full py-4 bg-[#7C3AED] hover:bg-[#6D28D9] disabled:bg-[#7C3AED]/30 disabled:cursor-not-allowed text-white font-semibold rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20 disabled:shadow-none"
        >
          {state === 'quoting' ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Getting Quote...
            </>
          ) : state === 'executing' ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {isCrossChain ? 'Bridging...' : 'Swapping...'}
            </>
          ) : !amount || amountNum <= 0 ? (
            'Enter Amount'
          ) : hasInsufficientBalance ? (
            'Insufficient Balance'
          ) : !quote ? (
            'Get Quote'
          ) : isCrossChain ? (
            `Bridge ${fromToken} to ${CHAINS.find(c => c.id === toChainId)?.name}`
          ) : (
            `Swap ${fromToken} for ${toToken}`
          )}
        </button>
      )}

      {/* Info */}
      <p className="text-white/30 text-xs text-center">
        Powered by Relay • Gas paid automatically
      </p>
    </div>
  )
}

