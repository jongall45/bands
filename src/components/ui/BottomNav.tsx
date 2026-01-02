'use client'

import { Home, PiggyBank, Settings, ArrowUpDown } from 'lucide-react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import haptics from '@/lib/haptics'

const navItems = [
  { href: '/dashboard', icon: Home, label: 'Home' },
  { href: '/save', icon: PiggyBank, label: 'Earn' },
  { href: '/swap', icon: ArrowUpDown, label: 'Swap' },
  // Trade (Polymarket/Ostium) hidden for US regulatory compliance - code preserved in /app/speculate/
  { href: '/settings', icon: Settings, label: 'Settings' },
]

export function BottomNav() {
  const pathname = usePathname()

  const handleNavClick = (isCurrentlyActive: boolean) => {
    if (!isCurrentlyActive) {
      haptics.impact('light')
    }
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 bg-[#0a0a0a]/95 backdrop-blur-xl border-t border-white/[0.06]"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <nav className="flex items-stretch justify-around">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href || pathname?.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              onClick={() => handleNavClick(isActive)}
              className={`
                relative flex flex-col items-center justify-center
                flex-1 py-2 pt-2.5
                transition-colors duration-150
                active:opacity-70
                ${isActive ? 'text-[#FF3B30]' : 'text-white/40'}
              `}
            >
              <Icon
                className="w-6 h-6 mb-0.5"
                strokeWidth={isActive ? 2 : 1.5}
              />
              <span className={`text-[10px] font-medium ${isActive ? 'text-[#FF3B30]' : ''}`}>
                {label}
              </span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
