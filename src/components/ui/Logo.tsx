'use client'

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: { container: 'h-8', icon: 'text-sm', text: 'text-lg' },
    md: { container: 'h-10', icon: 'text-lg', text: 'text-xl' },
    lg: { container: 'h-12', icon: 'text-xl', text: 'text-2xl' },
  }

  const s = sizes[size]

  return (
    <div className={`flex items-center gap-3 ${s.container}`}>
      {/* Dollar sign icon in red rounded square */}
      <div className={`aspect-square h-full bg-[#ef4444] rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.3)]`}>
        <span className={`text-white font-bold ${s.icon}`}>$</span>
      </div>
      {/* Wordmark */}
      <span className={`text-white font-semibold ${s.text} tracking-tight`}>bands</span>
    </div>
  )
}

