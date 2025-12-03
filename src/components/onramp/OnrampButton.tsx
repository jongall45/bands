'use client'

import { useState } from 'react'
import { useAccount } from 'wagmi'
import { Plus, Loader2, AlertCircle } from 'lucide-react'
import { useOnramp } from '@/hooks/useOnramp'

interface OnrampButtonProps {
  variant?: 'primary' | 'secondary'
  size?: 'sm' | 'md' | 'lg'
  className?: string
  onSuccess?: () => void
}

export function OnrampButton({ 
  variant = 'primary', 
  size = 'md',
  className = '',
  onSuccess,
}: OnrampButtonProps) {
  const { isConnected } = useAccount()
  const [showSuccess, setShowSuccess] = useState(false)
  
  const { openOnramp, isLoading, error, isReady, clearError } = useOnramp({
    onSuccess: () => {
      setShowSuccess(true)
      setTimeout(() => setShowSuccess(false), 3000)
      onSuccess?.()
    },
  })

  if (!isConnected) {
    return null
  }

  const sizeClasses = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-3 text-sm',
    lg: 'px-6 py-4 text-base',
  }

  const variantClasses = {
    primary: 'bg-[#ef4444] hover:bg-[#dc2626] text-white',
    secondary: 'bg-white/[0.05] hover:bg-white/[0.08] text-white border border-white/[0.1]',
  }

  return (
    <div className="relative">
      <button
        onClick={() => {
          clearError()
          openOnramp()
        }}
        disabled={!isReady || isLoading}
        className={`
          flex items-center justify-center gap-2 rounded-xl font-semibold transition-all
          disabled:opacity-50 disabled:cursor-not-allowed
          ${sizeClasses[size]}
          ${variantClasses[variant]}
          ${className}
        `}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading...
          </>
        ) : (
          <>
            <Plus className="w-4 h-4" />
            Add Money
          </>
        )}
      </button>

      {/* Success toast */}
      {showSuccess && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-center z-50">
          <p className="text-green-400 text-sm">Purchase complete! USDC on its way.</p>
        </div>
      )}

      {/* Error toast */}
      {error && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3 z-50">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        </div>
      )}
    </div>
  )
}

