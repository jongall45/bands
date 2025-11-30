'use client'

import { Home, Send, QrCode, Wallet, Settings } from 'lucide-react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

const navItems = [
  { href: '/dashboard', icon: Home, label: 'Home' },
  { href: '/send', icon: Send, label: 'Send' },
  { href: '/receive', icon: QrCode, label: 'Receive' },
  { href: '/wallet', icon: Wallet, label: 'Wallet' },
  { href: '/settings', icon: Settings, label: 'Settings' },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <nav className="
        flex items-center gap-1 p-2
        bg-[#1a1a1a]/80 backdrop-blur-xl
        border border-white/[0.08]
        rounded-full
        shadow-[0_8px_32px_rgba(0,0,0,0.4)]
      ">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={`
                relative p-3 rounded-full transition-all duration-200
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
  )
}

