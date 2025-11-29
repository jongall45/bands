'use client'

import { HTMLAttributes, forwardRef } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'glass' | 'gradient' | 'solid'
  hoverable?: boolean
}

const variantStyles = {
  glass: 'glass',
  gradient: 'gradient-border',
  solid: 'bg-zinc-900/80 border border-zinc-800',
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className = '', variant = 'glass', hoverable = false, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`rounded-2xl p-6 ${variantStyles[variant]} ${
          hoverable ? 'hover:border-emerald-500/20 hover:shadow-lg hover:shadow-emerald-500/5 hover:-translate-y-1 transition-all duration-300' : ''
        } ${className}`}
        {...props}
      >
        {children}
      </div>
    )
  }
)

Card.displayName = 'Card'

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className = '', ...props }, ref) => (
    <div ref={ref} className={`mb-4 ${className}`} {...props} />
  )
)
CardHeader.displayName = 'CardHeader'

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className = '', ...props }, ref) => (
    <h3 ref={ref} className={`text-lg font-semibold ${className}`} {...props} />
  )
)
CardTitle.displayName = 'CardTitle'

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className = '', ...props }, ref) => (
    <div ref={ref} className={className} {...props} />
  )
)
CardContent.displayName = 'CardContent'
