'use client'

interface AmountInputProps {
  value: string
  onChange: (value: string) => void
  currency?: string
  balance?: string
  onMax?: () => void
}

export function AmountInput({ value, onChange, currency = 'USDC', balance, onMax }: AmountInputProps) {
  return (
    <div className="bg-white/[0.02] rounded-2xl border border-white/[0.04] p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-white/40 text-sm">Amount</span>
        {balance && (
          <span className="text-white/40 text-sm">
            Balance: <span className="text-white/60">{balance}</span>
          </span>
        )}
      </div>
      
      <div className="flex items-center gap-4">
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0.00"
          className="flex-1 bg-transparent text-4xl font-semibold text-white placeholder:text-white/20 focus:outline-none"
        />
        
        <div className="flex items-center gap-2">
          {onMax && (
            <button
              onClick={onMax}
              className="px-3 py-1.5 text-xs font-medium text-white/60 bg-white/[0.06] rounded-lg hover:bg-white/[0.1] transition-colors"
            >
              Max
            </button>
          )}
          <div className="flex items-center gap-2 bg-white/[0.06] rounded-full px-4 py-2">
            <div className="w-6 h-6 rounded-full bg-[#2775ca] flex items-center justify-center">
              <span className="text-white text-xs font-bold">$</span>
            </div>
            <span className="text-white font-medium">{currency}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

