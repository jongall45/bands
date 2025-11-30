'use client'

interface BalanceDisplayProps {
  balance: string
  change?: { 
    value: string
    positive: boolean 
  }
}

export function BalanceDisplay({ balance, change }: BalanceDisplayProps) {
  return (
    <div className="text-center py-8">
      <p className="text-white/40 text-sm mb-2">Total Balance</p>
      <h1 className="text-5xl md:text-6xl font-semibold text-white tracking-tight">
        ${balance}
      </h1>
      {change && (
        <p className={`mt-2 text-sm ${change.positive ? 'text-green-400' : 'text-red-400'}`}>
          {change.positive ? '+' : ''}{change.value} today
        </p>
      )}
    </div>
  )
}

