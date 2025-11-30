'use client'

import { forwardRef } from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'glass'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ children, variant = 'primary', size = 'md', isLoading, className = '', disabled, ...props }, ref) => {
    const base = 'relative inline-flex items-center justify-center font-medium transition-all duration-200 ease-out disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden'
    
    const variants = {
      // Solid red - main CTA like "JOIN" button
      primary: `
        bg-[#ef4444] text-white rounded-2xl
        shadow-[0_0_20px_rgba(239,68,68,0.3)]
        hover:bg-[#dc2626] hover:shadow-[0_0_30px_rgba(239,68,68,0.4)]
        active:scale-[0.98]
      `,
      // Glass/outline style for secondary actions
      secondary: `
        bg-white/[0.03] text-white rounded-2xl
        border border-white/[0.08]
        backdrop-blur-sm
        hover:bg-white/[0.06] hover:border-white/[0.15]
        active:scale-[0.98]
      `,
      // Minimal ghost
      ghost: `
        bg-transparent text-white/70 rounded-xl
        hover:text-white hover:bg-white/[0.05]
        active:scale-[0.98]
      `,
      // Frosted glass pill (like EigenExplorer nav buttons)
      glass: `
        bg-white/[0.05] text-white rounded-full
        border border-white/[0.08]
        backdrop-blur-md
        hover:bg-white/[0.08] hover:border-white/[0.12]
        active:scale-[0.98]
      `,
    }
    
    const sizes = {
      sm: 'px-4 py-2 text-sm gap-2',
      md: 'px-6 py-3 text-base gap-2',
      lg: 'px-8 py-4 text-lg gap-3',
    }

    return (
      <button
        ref={ref}
        className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && (
          <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        )}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
