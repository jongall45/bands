'use client'

import { Home, PiggyBank, Settings, ArrowUpDown } from 'lucide-react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

const navItems = [
  { href: '/dashboard', icon: Home, label: 'Home' },
  { href: '/save', icon: PiggyBank, label: 'Save' },
  { href: '/swap', icon: ArrowUpDown, label: 'Swap' },
  // Trade (Polymarket/Ostium) hidden for US regulatory compliance - code preserved in /app/speculate/
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
          flex items-center gap-1 p-1.5
          bg-[#0a0a0a]/98 backdrop-blur-xl
          border border-white/[0.08]
          rounded-2xl
          shadow-[0_8px_32px_rgba(0,0,0,0.5)]
        ">
          {navItems.map(({ href, icon: Icon, label }) => {
            const isActive = pathname === href || pathname?.startsWith(href + '/')
            return (
              <Link
                key={href}
                href={href}
                className={`
                  relative flex flex-col items-center justify-center
                  min-w-[64px] min-h-[52px] px-3 py-2
                  rounded-xl transition-all duration-200
                  active:scale-95 active:opacity-80
                  ${isActive
                    ? 'bg-[#FF3B30]/15 text-white'
                    : 'text-white/40 hover:text-white/70 hover:bg-white/[0.05]'
                  }
                `}
                title={label}
              >
                <Icon
                  className={`w-5 h-5 mb-0.5 ${isActive ? 'text-[#FF3B30]' : ''}`}
                  strokeWidth={isActive ? 2 : 1.5}
                />
                <span className={`text-[10px] font-semibold ${isActive ? 'text-white' : ''}`}>
                  {label}
                </span>
                {/* Active indicator dot */}
                {isActive && (
                  <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-[#FF3B30] rounded-full" />
                )}
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
