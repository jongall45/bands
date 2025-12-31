'use client'

import { useState, useEffect, useCallback } from 'react'

// Capacitor detection
const isCapacitorNative = (): boolean => {
  if (typeof window === 'undefined') return false
  return !!(window as any).Capacitor?.isNativePlatform?.()
}

// Screen breakpoints (matches Tailwind defaults)
const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const

export interface PlatformState {
  // Environment
  isCapacitor: boolean      // Running in native Capacitor shell
  isWeb: boolean            // Running in browser (not Capacitor)
  isPWA: boolean            // Installed as PWA (standalone mode)

  // Device
  isIOS: boolean
  isAndroid: boolean
  isMobile: boolean         // iOS or Android (user agent)
  isDesktop: boolean        // Not mobile user agent

  // Screen size (responsive)
  screenWidth: number
  isMobileScreen: boolean   // < 768px (md breakpoint)
  isTabletScreen: boolean   // 768px - 1024px
  isDesktopScreen: boolean  // >= 1024px

  // Combined helpers
  showMobileUI: boolean     // Should show mobile UI (native OR mobile screen)
  showDesktopUI: boolean    // Should show desktop UI
}

export function usePlatform(): PlatformState {
  const [state, setState] = useState<PlatformState>({
    isCapacitor: false,
    isWeb: true,
    isPWA: false,
    isIOS: false,
    isAndroid: false,
    isMobile: false,
    isDesktop: true,
    screenWidth: typeof window !== 'undefined' ? window.innerWidth : 1024,
    isMobileScreen: false,
    isTabletScreen: false,
    isDesktopScreen: true,
    showMobileUI: false,
    showDesktopUI: true,
  })

  const updateScreenSize = useCallback(() => {
    const width = window.innerWidth
    const isMobileScreen = width < BREAKPOINTS.md
    const isTabletScreen = width >= BREAKPOINTS.md && width < BREAKPOINTS.lg
    const isDesktopScreen = width >= BREAKPOINTS.lg

    setState(prev => {
      // Only update if values actually changed
      if (
        prev.screenWidth === width &&
        prev.isMobileScreen === isMobileScreen &&
        prev.isTabletScreen === isTabletScreen &&
        prev.isDesktopScreen === isDesktopScreen
      ) {
        return prev
      }

      const showMobileUI = prev.isCapacitor || prev.isMobile || isMobileScreen
      const showDesktopUI = !showMobileUI

      return {
        ...prev,
        screenWidth: width,
        isMobileScreen,
        isTabletScreen,
        isDesktopScreen,
        showMobileUI,
        showDesktopUI,
      }
    })
  }, [])

  useEffect(() => {
    // Detect platform on mount
    const isCapacitor = isCapacitorNative()
    const isWeb = !isCapacitor

    // PWA standalone mode
    const isPWA =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true

    // User agent detection
    const userAgent = window.navigator.userAgent.toLowerCase()
    const isIOS = /iphone|ipad|ipod/.test(userAgent)
    const isAndroid = /android/.test(userAgent)
    const isMobile = isIOS || isAndroid
    const isDesktop = !isMobile

    // Initial screen size
    const width = window.innerWidth
    const isMobileScreen = width < BREAKPOINTS.md
    const isTabletScreen = width >= BREAKPOINTS.md && width < BREAKPOINTS.lg
    const isDesktopScreen = width >= BREAKPOINTS.lg

    // Determine UI mode
    // Show mobile UI if: running in Capacitor, OR on mobile device, OR small screen
    const showMobileUI = isCapacitor || isMobile || isMobileScreen
    const showDesktopUI = !showMobileUI

    setState({
      isCapacitor,
      isWeb,
      isPWA,
      isIOS,
      isAndroid,
      isMobile,
      isDesktop,
      screenWidth: width,
      isMobileScreen,
      isTabletScreen,
      isDesktopScreen,
      showMobileUI,
      showDesktopUI,
    })

    // Listen for screen size changes
    window.addEventListener('resize', updateScreenSize)
    window.addEventListener('orientationchange', updateScreenSize)

    return () => {
      window.removeEventListener('resize', updateScreenSize)
      window.removeEventListener('orientationchange', updateScreenSize)
    }
  }, [updateScreenSize])

  return state
}

// Simple hook for just checking if we should show mobile UI
export function useIsMobile(): boolean {
  const { showMobileUI } = usePlatform()
  return showMobileUI
}

// Hook for checking if running in native app
export function useIsNative(): boolean {
  const { isCapacitor } = usePlatform()
  return isCapacitor
}
