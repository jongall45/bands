'use client'

import React from 'react'

// The "Noise" texture to prevent the glass from looking like plastic
const noiseBg = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.05'/%3E%3C/svg%3E")`

// Technical grid background for the void
export const gridBg = `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg stroke='%23ffffff' stroke-opacity='0.03'%3E%3Cpath d='M0 0h60v60H0z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`

// 1. THE MAIN CONTAINER (Wraps your specific sections)
interface GlassCardProps {
  children: React.ReactNode
  className?: string
  noPadding?: boolean
  variant?: 'default' | 'green' | 'red'
}

export const GlassCard = ({ children, className = "", noPadding = false, variant = 'default' }: GlassCardProps) => {
  const variantStyles = {
    default: "linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)",
    green: "linear-gradient(145deg, rgba(46, 184, 92, 0.15) 0%, rgba(46, 184, 92, 0.05) 100%)",
    red: "linear-gradient(145deg, rgba(255, 59, 48, 0.15) 0%, rgba(255, 59, 48, 0.05) 100%)",
  }

  return (
    <div
      className={`relative overflow-hidden rounded-3xl border border-white/10 shadow-2xl ${className}`}
      style={{
        background: variantStyles[variant],
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        padding: noPadding ? 0 : "24px"
      }}
    >
      {/* Noise Texture Overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-50 mix-blend-overlay z-0"
        style={{ backgroundImage: noiseBg }}
      />

      {/* Top "Cut Glass" Edge Highlight */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent z-10" />

      {/* Content */}
      <div className="relative z-20 text-white">
        {children}
      </div>
    </div>
  )
}

// 2. THE TECH BADGE (Wraps your metadata like "7 assets" or network names)
interface TechBadgeProps {
  children: React.ReactNode
  color?: string
}

export const TechBadge = ({ children, color = "rgba(255,255,255,0.5)" }: TechBadgeProps) => (
  <div
    className="inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-widest"
    style={{
      color: color,
      border: `1px solid ${color}`,
      background: "rgba(0,0,0,0.2)"
    }}
  >
    {children}
  </div>
)

// 3. THE ACTION BUTTON (Wraps your existing button text/icons)
interface GlassButtonProps {
  children: React.ReactNode
  onClick?: () => void
  primary?: boolean
  className?: string
  disabled?: boolean
  type?: 'button' | 'submit'
}

export const GlassButton = ({ children, onClick, primary = false, className = "", disabled = false, type = 'button' }: GlassButtonProps) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    className={`relative w-full py-4 rounded-full font-bold uppercase tracking-wider text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 ${className}`}
    style={{
      background: primary
        ? "linear-gradient(135deg, rgba(255, 59, 48, 0.9) 0%, rgba(255, 59, 48, 0.7) 100%)"
        : "rgba(255,255,255,0.05)",
      border: primary ? "1px solid #FF3B30" : "1px solid rgba(255,255,255,0.1)",
      color: "white",
      backdropFilter: "blur(12px)"
    }}
  >
    {children}
  </button>
)

// 4. INNER CARD (For nested sections within a GlassCard)
interface GlassInnerProps {
  children: React.ReactNode
  className?: string
}

export const GlassInner = ({ children, className = "" }: GlassInnerProps) => (
  <div
    className={`bg-black/30 border border-white/10 rounded-2xl p-4 ${className}`}
  >
    {children}
  </div>
)

// 5. PAGE WRAPPER (Sets up the dark void background with grid)
interface IndustrialPageProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  className?: string
}

export const IndustrialPage = ({ children, className = "", ...props }: IndustrialPageProps) => (
  <div
    className={`min-h-screen w-full relative overflow-x-hidden ${className}`}
    style={{
      background: '#050505',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Helvetica Neue', sans-serif",
    }}
    {...props}
  >
    {/* Technical Grid Background */}
    <div
      className="fixed inset-0 pointer-events-none z-0 opacity-100"
      style={{ backgroundImage: gridBg }}
    />

    {/* Grain Texture Overlay */}
    <div
      className="fixed inset-0 pointer-events-none z-[10000] opacity-[0.06] mix-blend-overlay"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
      }}
    />

    {/* Content */}
    <div className="relative z-10">
      {children}
    </div>
  </div>
)

// 6. SECTION HEADER (For section titles)
interface SectionHeaderProps {
  children: React.ReactNode
  badge?: string
  className?: string
}

export const SectionHeader = ({ children, badge, className = "" }: SectionHeaderProps) => (
  <div className={`flex items-center justify-between mb-4 ${className}`}>
    <h2 className="text-white font-extrabold text-lg tracking-tight" style={{ fontWeight: 800 }}>
      {children}
    </h2>
    {badge && <TechBadge>{badge}</TechBadge>}
  </div>
)
