'use client'

import { useEffect } from 'react'
import { usePWA } from '@/hooks/usePWA'

interface PWALayoutProps {
  children: React.ReactNode
}

export function PWALayout({ children }: PWALayoutProps) {
  const { isStandalone, isIOS } = usePWA()

  useEffect(() => {
    // Handle iOS-specific viewport issues
    const setVH = () => {
      const vh = window.innerHeight * 0.01
      document.documentElement.style.setProperty('--vh', `${vh}px`)
    }
    
    setVH()
    window.addEventListener('resize', setVH)
    window.addEventListener('orientationchange', setVH)

    return () => {
      window.removeEventListener('resize', setVH)
      window.removeEventListener('orientationchange', setVH)
    }
  }, [isStandalone, isIOS])

  return (
    <div 
      id="main-content"
      className="min-h-screen"
      style={{
        minHeight: 'calc(var(--vh, 1vh) * 100)',
      }}
    >
      {children}
    </div>
  )
}

