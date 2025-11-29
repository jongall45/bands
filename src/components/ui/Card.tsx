'use client'

import { HTMLAttributes, forwardRef } from 'react'
import { clsx } from 'clsx'
import { motion, HTMLMotionProps } from 'framer-motion'

interface CardProps extends HTMLMotionProps<'div'> {
  variant?: 'glass' | 'gradient' | 'solid'
  hoverable?: boolean
}

const variantStyles = {
  glass: 'glass',
  gradient: 'gradient-border',
  solid: 'bg-zinc-900/80 border border-zinc-800',
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'glass', hoverable = false, children, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        whileHover={hoverable ? { y: -4, transition: { duration: 0.2 } } : undefined}
        className={clsx(
          'rounded-2xl p-6',
          variantStyles[variant],
          hoverable && 'hover:border-emerald-500/20 hover:shadow-lg hover:shadow-emerald-500/5 transition-all duration-300',
          className
        )}
        {...props}
      >
        {children}
      </motion.div>
    )
  }
)

Card.displayName = 'Card'

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={clsx('mb-4', className)} {...props} />
  )
)
CardHeader.displayName = 'CardHeader'

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={clsx('text-lg font-semibold', className)} {...props} />
  )
)
CardTitle.displayName = 'CardTitle'

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={clsx('', className)} {...props} />
  )
)
CardContent.displayName = 'CardContent'

