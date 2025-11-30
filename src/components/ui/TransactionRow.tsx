'use client'

import { ArrowUpRight, ArrowDownLeft } from 'lucide-react'

interface TransactionRowProps {
  type: 'send' | 'receive'
  address: string
  amount: string
  date: string
  status?: 'pending' | 'confirmed'
}

export function TransactionRow({ type, address, amount, date, status = 'confirmed' }: TransactionRowProps) {
  const isSend = type === 'send'

  return (
    <div className="flex items-center gap-4 p-4 rounded-2xl hover:bg-white/[0.02] transition-colors cursor-pointer">
      {/* Icon */}
      <div className={`
        w-10 h-10 rounded-full flex items-center justify-center
        ${isSend ? 'bg-red-500/10' : 'bg-green-500/10'}
      `}>
        {isSend ? (
          <ArrowUpRight className="w-5 h-5 text-red-400" />
        ) : (
          <ArrowDownLeft className="w-5 h-5 text-green-400" />
        )}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <p className="text-white font-medium truncate">
          {isSend ? 'Sent to' : 'Received from'} {address.slice(0, 6)}...{address.slice(-4)}
        </p>
        <p className="text-white/40 text-sm">{date}</p>
      </div>

      {/* Amount */}
      <div className="text-right">
        <p className={`font-semibold ${isSend ? 'text-white' : 'text-green-400'}`}>
          {isSend ? '-' : '+'}{amount}
        </p>
        {status === 'pending' && (
          <p className="text-yellow-500/70 text-xs">Pending</p>
        )}
      </div>
    </div>
  )
}

