// components/OstiumTradeButton.tsx

'use client'

import { useState } from 'react'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { arbitrum } from 'viem/chains'
import { encodeFunctionData, maxUint256 } from 'viem'

const USDC = '0xaf88d065e77c8cc2239327c5edb3a432268e5831' as const
const STORAGE = '0xcCd5891083A8acD2074690F65d3024E7D13d66E7' as const
const TRADING = '0x6D0bA1f9996DBD8885827e1b2e8f6593e7702411' as const

// ERC20 ABI for approve and transfer
const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const

export function OstiumTradeButton() {
  const { client } = useSmartWallets()
  const [loading, setLoading] = useState(false)

  const ready = !!client

  const trade = async () => {
    if (!ready || !client) return alert('Wallet not ready')
    setLoading(true)

    try {
      // Switch to Arbitrum if needed
      const chainId = await client.getChainId()
      if (chainId !== arbitrum.id) {
        await client.switchChain({ id: arbitrum.id })
      }

      const calls = [
        // 1. Approve Storage (max)
        {
          to: USDC,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [STORAGE, maxUint256],
          }),
          value: BigInt(0),
        },
        // 2. Transfer $5 USDC to Storage
        {
          to: USDC,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'transfer',
            args: [STORAGE, BigInt(5_000_000)], // 5 USDC = 5e6
          }),
          value: BigInt(0),
        },
        // 3. Open trade — BTC long 10x $50 exposure
        {
          to: TRADING,
          data: '0x46adf7aa00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000077e772392b6000000000000000000000000000000000000000000000000000000000000000000640000000000000000000000000000000000000000000000000000000069324f33' as `0x${string}`,
          value: BigInt(0),
        },
      ]

      const hash = await client.sendTransaction({ calls })

      alert(`SUCCESS! https://arbiscan.io/tx/${hash}`)
    } catch (e: any) {
      alert('Failed: ' + (e.shortMessage || e.message || 'Unknown'))
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={trade}
      disabled={loading || !ready}
      className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-6 rounded-2xl text-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? 'Executing (1 sig)...' : 'LONG BTC 10x • $5'}
    </button>
  )
}
