'use client'

import { useState, useCallback } from 'react'
import { X, Fuel, Loader2, Check, AlertCircle } from 'lucide-react'
import { useAccount, useBalance, useWalletClient, usePublicClient } from 'wagmi'
import { arbitrum } from 'viem/chains'
import { parseUnits, encodeFunctionData } from 'viem'

// Arbitrum addresses
const USDC_ARBITRUM = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
const WETH_ARBITRUM = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1'

// Uniswap V3 Router on Arbitrum
const UNISWAP_ROUTER = '0xE592427A0AEce92De3Edee1F18E0157C05861564'

const SWAP_ROUTER_ABI = [
  {
    inputs: [
      {
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'recipient', type: 'address' },
          { name: 'deadline', type: 'uint256' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOutMinimum', type: 'uint256' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
        name: 'params',
        type: 'tuple',
      },
    ],
    name: 'exactInputSingle',
    outputs: [{ name: 'amountOut', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function',
  },
] as const

const ERC20_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  suggestedAmount?: string
}

export function SwapForGasModal({ isOpen, onClose, onSuccess, suggestedAmount = '1' }: Props) {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient({ chainId: arbitrum.id })
  const publicClient = usePublicClient({ chainId: arbitrum.id })
  
  const [amount, setAmount] = useState(suggestedAmount)
  const [isSwapping, setIsSwapping] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)

  // Get USDC balance on Arbitrum
  const { data: usdcBalance, refetch: refetchUsdc } = useBalance({
    address,
    token: USDC_ARBITRUM as `0x${string}`,
    chainId: arbitrum.id,
  })

  // Get ETH balance on Arbitrum
  const { data: ethBalance, refetch: refetchEth } = useBalance({
    address,
    chainId: arbitrum.id,
  })

  const handleSwap = useCallback(async () => {
    if (!address || !walletClient || !publicClient) {
      setError('Wallet not connected')
      return
    }

    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Invalid amount')
      return
    }

    setIsSwapping(true)
    setError(null)
    setStatus('Preparing swap...')

    try {
      const amountIn = parseUnits(amount, 6) // USDC has 6 decimals

      // Check allowance
      setStatus('Checking allowance...')
      const allowance = await publicClient.readContract({
        address: USDC_ARBITRUM as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [address, UNISWAP_ROUTER],
      })

      // Approve if needed
      if (allowance < amountIn) {
        setStatus('Approving USDC...')
        const approveTx = await walletClient.writeContract({
          address: USDC_ARBITRUM as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [UNISWAP_ROUTER, amountIn],
          chain: arbitrum,
        })
        
        await publicClient.waitForTransactionReceipt({ hash: approveTx })
      }

      // Execute swap
      setStatus('Swapping USDC → ETH...')
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600) // 10 min deadline
      
      const swapTx = await walletClient.writeContract({
        address: UNISWAP_ROUTER,
        abi: SWAP_ROUTER_ABI,
        functionName: 'exactInputSingle',
        args: [{
          tokenIn: USDC_ARBITRUM as `0x${string}`,
          tokenOut: WETH_ARBITRUM as `0x${string}`,
          fee: 500, // 0.05% pool
          recipient: address,
          deadline,
          amountIn,
          amountOutMinimum: BigInt(0), // Accept any amount (for simplicity)
          sqrtPriceLimitX96: BigInt(0),
        }],
        chain: arbitrum,
      })

      setStatus('Confirming...')
      await publicClient.waitForTransactionReceipt({ hash: swapTx })

      // Refresh balances
      await refetchUsdc()
      await refetchEth()

      setIsSuccess(true)
      setStatus('Swap complete!')
      
      setTimeout(() => {
        onSuccess()
      }, 2000)

    } catch (err: any) {
      console.error('Swap error:', err)
      setError(err?.message || 'Swap failed')
    } finally {
      setIsSwapping(false)
    }
  }, [address, walletClient, publicClient, amount, refetchUsdc, refetchEth, onSuccess])

  const amountNum = parseFloat(amount) || 0
  const balanceNum = parseFloat(usdcBalance?.formatted || '0')
  const canSwap = amountNum > 0 && amountNum <= balanceNum && !isSwapping

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 99999 }}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      <div 
        className="relative w-full max-w-[380px] bg-[#0a0a0a] border border-white/10 rounded-3xl p-6"
        style={{ zIndex: 100000 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-500/20 rounded-xl flex items-center justify-center">
              <Fuel className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h2 className="text-white font-semibold">Get Gas on Arbitrum</h2>
              <p className="text-white/40 text-xs">Swap USDC → ETH for fees</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full">
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>

        {isSuccess ? (
          <div className="flex flex-col items-center py-8">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mb-4">
              <Check className="w-8 h-8 text-green-400" />
            </div>
            <h3 className="text-white font-semibold text-lg mb-2">Gas Acquired! ⛽</h3>
            <p className="text-white/40 text-sm text-center">
              You now have ETH on Arbitrum for transactions
            </p>
          </div>
        ) : (
          <>
            {/* Current balances */}
            <div className="bg-white/[0.03] rounded-xl p-3 mb-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-white/50">USDC on Arbitrum</span>
                <span className="text-white font-mono">${balanceNum.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/50">ETH on Arbitrum</span>
                <span className="text-white font-mono">
                  {parseFloat(ethBalance?.formatted || '0').toFixed(5)} ETH
                </span>
              </div>
            </div>

            {/* Amount input */}
            <div className="mb-4">
              <label className="text-white/40 text-xs mb-2 block">Swap amount (USDC)</label>
              <div className="flex gap-2">
                {['0.50', '1', '2'].map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setAmount(preset)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      amount === preset
                        ? 'bg-orange-500 text-white'
                        : 'bg-white/[0.05] text-white/60 hover:bg-white/[0.08]'
                    }`}
                  >
                    ${preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Info */}
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3 mb-4">
              <p className="text-orange-400/80 text-xs">
                💡 ~$0.50-1 of ETH is usually enough for 10-20 trades on Arbitrum
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span className="text-red-400 text-sm">{error}</span>
              </div>
            )}

            {/* Swap button */}
            <button
              onClick={handleSwap}
              disabled={!canSwap}
              className="w-full py-4 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/30 disabled:cursor-not-allowed text-white font-semibold rounded-2xl flex items-center justify-center gap-2"
            >
              {isSwapping ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {status}
                </>
              ) : balanceNum <= 0 ? (
                'No USDC on Arbitrum'
              ) : (
                `Swap $${amount} USDC → ETH`
              )}
            </button>

            <p className="text-white/20 text-xs text-center mt-3">
              Swap via Uniswap on Arbitrum
            </p>
          </>
        )}
      </div>
    </div>
  )
}

