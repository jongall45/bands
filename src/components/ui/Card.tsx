'use client'

interface CardProps {
  children: React.ReactNode
  className?: string
  variant?: 'default' | 'elevated' | 'interactive'
}

export function Card({ children, className = '', variant = 'default' }: CardProps) {
  const variants = {
    // Standard card
    default: `
      bg-[#111111] 
      border border-white/[0.06] 
      rounded-3xl
    `,
    // Elevated with subtle shadow
    elevated: `
      bg-[#111111] 
      border border-white/[0.06] 
      rounded-3xl
      shadow-[0_4px_24px_rgba(0,0,0,0.4)]
    `,
    // Interactive with hover state
    interactive: `
      bg-[#111111] 
      border border-white/[0.06] 
      rounded-3xl
      transition-all duration-200
      hover:bg-[#161616] hover:border-white/[0.1]
      hover:shadow-[0_4px_24px_rgba(0,0,0,0.5)]
      cursor-pointer
    `,
  }

  return (
    <div className={`${variants[variant]} ${className}`}>
      {children}
    </div>
  )
}

// Inner card section (for nested depth like swap interface)
export function CardInner({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white/[0.02] rounded-2xl border border-white/[0.04] ${className}`}>
      {children}
    </div>
  )
}
