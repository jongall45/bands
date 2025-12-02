'use client'

import { Home, TrendingUp, PiggyBank, Settings } from 'lucide-react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

const navItems = [
  { href: '/dashboard', icon: Home, label: 'Home' },
  { href: '/save', icon: PiggyBank, label: 'Save' },
  { href: '/speculate', icon: TrendingUp, label: 'Speculate' },
  { href: '/settings', icon: Settings, label: 'Settings' },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <div 
      className="fixed bottom-0 left-0 right-0 z-50"
      style={{
        paddingBottom: 'max(env(safe-area-inset-bottom, 12px), 12px)',
      }}
    >
      <div className="flex justify-center px-4 pb-2">
        <nav className="
          flex items-center gap-1 p-2
          bg-[#1a1a1a]/90 backdrop-blur-xl
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
                  relative p-3 rounded-full transition-all duration-200 active:scale-95
                  ${isActive 
                    ? 'bg-white/[0.1] text-white' 
                    : 'text-white/40 hover:text-white/70 hover:bg-white/[0.05]'
                  }
                `}
                title={label}
              >
                <Icon className="w-5 h-5" strokeWidth={isActive ? 2 : 1.5} />
                {isActive && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-white rounded-full" />
                )}
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
