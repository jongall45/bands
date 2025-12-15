#!/usr/bin/env npx ts-node

/**
 * Debug Script: Polymarket Position Verification
 * 
 * This script validates the positions indexer by:
 * 1. Loading a transaction receipt
 * 2. Parsing ERC-1155 transfers
 * 3. Querying onchain balances
 * 
 * Usage:
 *   npx ts-node scripts/debug_polymarket_positions.ts [txHash] [walletAddress]
 * 
 * Example with the provided transaction:
 *   npx ts-node scripts/debug_polymarket_positions.ts \
 *     0x1c8f5b62a24b017bd88df3247a7e32ffec02b04343971e1a42b37379e67504b8 \
 *     0x6907a5FD...8e77FEc4
 */

import { createPublicClient, http, formatUnits } from 'viem'
import { polygon } from 'viem/chains'

// Constants
const CONDITIONAL_TOKENS = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045'

// ERC1155 ABI for balances
const ERC1155_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'id', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'balanceOfBatch',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'accounts', type: 'address[]' },
      { name: 'ids', type: 'uint256[]' },
    ],
    outputs: [{ name: '', type: 'uint256[]' }],
  },
] as const

// TransferSingle topic
const TRANSFER_SINGLE_TOPIC = '0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62'
// TransferBatch topic
const TRANSFER_BATCH_TOPIC = '0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb'

interface ParsedTransfer {
  tokenContract: string
  tokenId: string
  amount: string
  from: string
  to: string
}

async function main() {
  // Parse CLI args
  const args = process.argv.slice(2)
  
  // Default to the provided transaction
  const txHash = args[0] || '0x1c8f5b62a24b017bd88df3247a7e32ffec02b04343971e1a42b37379e67504b8'
  
  // The wallet that received the tokens - from the user's context
  // Note: User should provide their actual trading wallet address
  const walletAddress = args[1] || '0x6907a5FD8e77FEc4' // Placeholder - need full address

  console.log('\n=== Polymarket Position Debug Script ===\n')
  console.log('Transaction Hash:', txHash)
  console.log('Wallet Address:', walletAddress)
  console.log('')

  // Create client
  const client = createPublicClient({
    chain: polygon,
    transport: http(),
  })

  // Fetch receipt
  console.log('📋 Fetching transaction receipt...')
  let receipt
  try {
    receipt = await client.getTransactionReceipt({
      hash: txHash as `0x${string}`,
    })
  } catch (e) {
    console.error('❌ Failed to fetch receipt:', e)
    return
  }

  console.log('✅ Transaction Status:', receipt.status)
  console.log('   Block Number:', receipt.blockNumber.toString())
  console.log('   Gas Used:', receipt.gasUsed.toString())
  console.log('   Logs Count:', receipt.logs.length)
  console.log('')

  // Filter for Conditional Tokens logs
  const ctfLogs = receipt.logs.filter(
    l => l.address.toLowerCase() === CONDITIONAL_TOKENS.toLowerCase()
  )
  console.log('📋 Conditional Tokens (ERC-1155) Logs:', ctfLogs.length)

  // Parse transfers
  const transfers: ParsedTransfer[] = []

  for (const log of ctfLogs) {
    console.log('\n  Log at index', log.logIndex)
    console.log('    Topic0:', log.topics[0])
    
    if (log.topics[0] === TRANSFER_SINGLE_TOPIC) {
      console.log('    Type: TransferSingle')
      
      // Decode indexed params
      const from = '0x' + log.topics[2]?.slice(26)
      const to = '0x' + log.topics[3]?.slice(26)
      
      // Decode data (id, value)
      if (log.data && log.data.length >= 130) {
        const idHex = log.data.slice(2, 66)
        const valueHex = log.data.slice(66, 130)
        
        const tokenId = BigInt('0x' + idHex).toString()
        const amount = BigInt('0x' + valueHex)
        
        console.log('    From:', from)
        console.log('    To:', to)
        console.log('    Token ID:', tokenId)
        console.log('    Amount (raw):', amount.toString())
        console.log('    Amount (formatted):', formatUnits(amount, 6), 'shares')
        
        transfers.push({
          tokenContract: log.address,
          tokenId,
          amount: formatUnits(amount, 6),
          from,
          to,
        })
      }
    } else if (log.topics[0] === TRANSFER_BATCH_TOPIC) {
      console.log('    Type: TransferBatch')
      // More complex parsing would go here
    }
  }

  console.log('\n=== Summary ===\n')
  console.log('Parsed', transfers.length, 'ERC-1155 transfers:')
  
  for (const t of transfers) {
    console.log('')
    console.log('  Token ID:', t.tokenId)
    console.log('  Amount:', t.amount, 'shares')
    console.log('  From:', t.from)
    console.log('  To:', t.to)
  }

  // If wallet address provided, query current balances
  if (walletAddress && walletAddress.length === 42) {
    console.log('\n=== Current Balances ===\n')
    
    const uniqueTokenIds = [...new Set(transfers.map(t => t.tokenId))]
    
    for (const tokenId of uniqueTokenIds) {
      try {
        const balance = await client.readContract({
          address: CONDITIONAL_TOKENS as `0x${string}`,
          abi: ERC1155_ABI,
          functionName: 'balanceOf',
          args: [walletAddress as `0x${string}`, BigInt(tokenId)],
        }) as bigint
        
        console.log('Token ID:', tokenId)
        console.log('  Balance (raw):', balance.toString())
        console.log('  Balance (formatted):', formatUnits(balance, 6), 'shares')
        console.log('  Has Position:', balance > BigInt(0) ? '✅ YES' : '❌ NO')
        console.log('')
      } catch (e) {
        console.log('Token ID:', tokenId)
        console.log('  ❌ Failed to query balance:', e)
        console.log('')
      }
    }
  } else {
    console.log('\n⚠️ Provide full wallet address (42 chars) to query current balances')
    console.log('   Usage: npx ts-node scripts/debug_polymarket_positions.ts <txHash> <walletAddress>')
  }

  console.log('\n=== Action Items ===\n')
  console.log('1. The token IDs above should be stored in the positions indexer')
  console.log('2. The UI should query balanceOf() for these token IDs')
  console.log('3. If balance > 0, the SELL button should be enabled')
  console.log('')
}

main().catch(console.error)
