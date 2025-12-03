'use client'

import { Home, TrendingUp, PiggyBank, Settings, ArrowUpDown } from 'lucide-react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

const navItems = [
  { href: '/dashboard', icon: Home, label: 'Home' },
  { href: '/save', icon: PiggyBank, label: 'Save' },
  { href: '/swap', icon: ArrowUpDown, label: 'Swap' },
  { href: '/speculate', icon: TrendingUp, label: 'Trade' },
  { href: '/settings', icon: Settings, label: 'Settings' },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <div 
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{
        paddingBottom: 'max(env(safe-area-inset-bottom, 8px), 8px)',
      }}
    >
      <div className="flex justify-center px-3 pb-2">
        <nav className="
          flex items-center gap-0.5 p-1.5
          bg-[#1a1a1a]/95 backdrop-blur-xl
          border border-white/[0.08]
          rounded-full
          shadow-[0_8px_32px_rgba(0,0,0,0.4)]
        ">
          {navItems.map(({ href, icon: Icon, label }) => {
            const isActive = pathname === href || pathname?.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                className={`
                  relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-full transition-all duration-200 active:scale-95
                  ${isActive 
                    ? 'bg-white/[0.1] text-white' 
                    : 'text-white/40 hover:text-white/70 hover:bg-white/[0.05]'
                  }
                `}
                title={label}
              >
                <Icon className="w-5 h-5" strokeWidth={isActive ? 2 : 1.5} />
                <span className="text-[9px] font-medium">{label}</span>
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
