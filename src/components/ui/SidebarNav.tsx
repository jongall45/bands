'use client'

import { Home, PiggyBank, Settings, ArrowUpDown, LogOut } from 'lucide-react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { LogoInline } from './Logo'

const navItems = [
  { href: '/dashboard', icon: Home, label: 'Home' },
  { href: '/save', icon: PiggyBank, label: 'Save' },
  { href: '/swap', icon: ArrowUpDown, label: 'Swap' },
  { href: '/settings', icon: Settings, label: 'Settings' },
]

export function SidebarNav() {
  const pathname = usePathname()
  const { logout } = useAuth()

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 bg-[#0a0a0a]/95 border-r border-white/[0.06] flex flex-col z-40">
      {/* Logo */}
      <div className="p-6 border-b border-white/[0.06]">
        <LogoInline size="md" />
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href || pathname?.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`
                flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200
                ${isActive
                  ? 'bg-[#FF3B30]/10 text-white border border-[#FF3B30]/20'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/[0.03]'
                }
              `}
            >
              <Icon
                className={`w-5 h-5 ${isActive ? 'text-[#FF3B30]' : ''}`}
                strokeWidth={isActive ? 2 : 1.5}
              />
              <span className={`font-medium ${isActive ? 'text-white' : ''}`}>
                {label}
              </span>
            </Link>
          )
        })}
      </nav>

      {/* User Section / Logout */}
      <div className="p-4 border-t border-white/[0.06]">
        <button
          onClick={() => logout()}
          className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-white/40 hover:text-white/70 hover:bg-white/[0.03] transition-all"
        >
          <LogOut className="w-5 h-5" strokeWidth={1.5} />
          <span className="font-medium">Sign Out</span>
        </button>
      </div>
    </aside>
  )
}
