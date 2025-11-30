'use client'

import { forwardRef, useState } from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  suffix?: React.ReactNode
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, suffix, error, className = '', ...props }, ref) => {
    const [focused, setFocused] = useState(false)

    return (
      <div className="relative">
        {label && (
          <label className="block text-white/40 text-sm mb-2 font-medium">
            {label}
          </label>
        )}
        <div className={`
          relative flex items-center
          bg-white/[0.03] rounded-2xl
          border transition-all duration-200
          ${focused ? 'border-white/20 bg-white/[0.05]' : 'border-white/[0.06]'}
          ${error ? 'border-red-500/50' : ''}
        `}>
          <input
            ref={ref}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className={`
              w-full bg-transparent px-5 py-4
              text-white text-lg font-medium
              placeholder:text-white/30
              focus:outline-none
              ${className}
            `}
            {...props}
          />
          {suffix && (
            <div className="pr-4 flex items-center">
              {suffix}
            </div>
          )}
        </div>
        {error && (
          <p className="mt-2 text-sm text-red-400">{error}</p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'

