'use client'

import { 
  useTransactionHistory, 
  formatTxAmount, 
  formatRelativeTime, 
  shortenAddress,
  type Transaction 
} from '@/hooks/useTransactionHistory'
import { 
  ArrowUpRight, ArrowDownLeft, RefreshCw, ExternalLink, 
  CheckCircle, XCircle, Loader2 
} from 'lucide-react'

interface TransactionListProps {
  address: string | undefined
  limit?: number
}

export function TransactionList({ address, limit = 10 }: TransactionListProps) {
  const { data: transactions, isLoading, isError, refetch } = useTransactionHistory(address)

  if (!address) {
    return <EmptyState message="Connect wallet to see activity" />
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-gray-500 animate-spin mb-3" />
        <p className="text-gray-500 text-sm">Loading transactions...</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-gray-500 text-sm mb-3">Failed to load transactions</p>
        <button 
          onClick={() => refetch()}
          className="text-[#ef4444] text-sm hover:text-[#dc2626] flex items-center gap-1"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    )
  }

  if (!transactions || transactions.length === 0) {
    return <EmptyState message="No transactions yet" submessage="Send or receive to get started" />
  }

  const displayedTxs = transactions.slice(0, limit)

  return (
    <div className="space-y-2">
      {displayedTxs.map((tx) => (
        <TransactionRow key={tx.hash} tx={tx} userAddress={address} />
      ))}
      
      {transactions.length > limit && (
        <a
          href={`https://basescan.org/address/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center py-3 text-[#ef4444] text-sm hover:text-[#dc2626] transition-colors"
        >
          View all on BaseScan →
        </a>
      )}
    </div>
  )
}

function TransactionRow({ tx, userAddress }: { tx: Transaction; userAddress: string }) {
  const isReceive = tx.type === 'receive'
  const amount = formatTxAmount(tx.value, tx.tokenDecimals)
  const timeAgo = formatRelativeTime(tx.timestamp)
  
  // Determine counterparty
  const counterparty = isReceive ? tx.from : tx.to

  return (
    <a
      href={`https://basescan.org/tx/${tx.hash}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between p-3 bg-white/[0.02] hover:bg-white/[0.04] rounded-2xl transition-colors group"
    >
      <div className="flex items-center gap-3">
        {/* Icon */}
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
          isReceive 
            ? 'bg-green-500/10' 
            : 'bg-white/[0.05]'
        }`}>
          {isReceive ? (
            <ArrowDownLeft className="w-5 h-5 text-green-400" />
          ) : (
            <ArrowUpRight className="w-5 h-5 text-gray-400" />
          )}
        </div>

        {/* Details */}
        <div>
          <div className="flex items-center gap-2">
            <p className="text-white font-medium text-sm">
              {isReceive ? 'Received' : 'Sent'}
            </p>
            {tx.status === 'failed' && (
              <XCircle className="w-3.5 h-3.5 text-red-400" />
            )}
          </div>
          <p className="text-white/40 text-xs">
            {isReceive ? 'From ' : 'To '}
            {shortenAddress(counterparty)}
          </p>
        </div>
      </div>

      {/* Amount & Time */}
      <div className="text-right flex items-center gap-2">
        <div>
          <p className={`font-mono font-medium text-sm ${
            isReceive ? 'text-green-400' : 'text-white'
          }`}>
            {isReceive ? '+' : '-'}{amount} {tx.tokenSymbol}
          </p>
          <p className="text-white/30 text-xs">{timeAgo}</p>
        </div>
        <ExternalLink className="w-3.5 h-3.5 text-white/20 group-hover:text-white/40 transition-colors" />
      </div>
    </a>
  )
}

function EmptyState({ message, submessage }: { message: string; submessage?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-12 h-12 bg-white/[0.03] rounded-full flex items-center justify-center mb-4">
        <ArrowUpRight className="w-6 h-6 text-gray-600" strokeWidth={1.5} />
      </div>
      <p className="text-gray-400 text-sm">{message}</p>
      {submessage && (
        <p className="text-gray-600 text-xs mt-1">{submessage}</p>
      )}
    </div>
  )
}

