'use client'

import { usePlatform } from '@/hooks/usePlatform'
import { BottomNav } from '@/components/ui/BottomNav'
import { SidebarNav } from '@/components/ui/SidebarNav'
import { InstallPrompt } from '@/components/pwa/InstallPrompt'

interface AppShellProps {
  children: React.ReactNode
  /** Hide navigation (e.g., on landing page) */
  hideNav?: boolean
}

/**
 * AppShell - Responsive layout wrapper
 *
 * - Mobile/Tablet: Bottom navigation (BottomNav)
 * - Desktop: Sidebar navigation (SidebarNav)
 * - Handles safe areas and proper spacing
 */
export function AppShell({ children, hideNav = false }: AppShellProps) {
  const { showMobileUI, showDesktopUI, isCapacitor } = usePlatform()

  // Desktop layout with sidebar
  if (showDesktopUI && !hideNav) {
    return (
      <div className="min-h-screen">
        <SidebarNav />
        <main className="ml-64 min-h-screen">
          {children}
        </main>
      </div>
    )
  }

  // Mobile layout with bottom nav
  return (
    <div className="min-h-screen">
      <main
        className="min-h-screen"
        style={{
          // Add padding for bottom nav on mobile
          paddingBottom: hideNav ? 0 : 'calc(80px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {children}
      </main>

      {/* Bottom Navigation - Mobile only */}
      {!hideNav && <BottomNav />}

      {/* PWA Install Prompt - Web only (not in Capacitor) */}
      {!isCapacitor && <InstallPrompt />}
    </div>
  )
}

/**
 * AppContent - Wrapper for page content with proper max-width and padding
 * Use inside pages that use AppShell
 */
interface AppContentProps {
  children: React.ReactNode
  className?: string
  /** Full width (no max-width constraint) */
  fullWidth?: boolean
}

export function AppContent({ children, className = '', fullWidth = false }: AppContentProps) {
  const { showDesktopUI } = usePlatform()

  return (
    <div
      className={`
        px-4 py-4
        ${showDesktopUI
          ? fullWidth
            ? 'w-full'
            : 'max-w-4xl mx-auto'
          : 'max-w-[430px] mx-auto'
        }
        ${className}
      `}
      style={{
        paddingTop: 'calc(16px + env(safe-area-inset-top, 0px))',
      }}
    >
      {children}
    </div>
  )
}
