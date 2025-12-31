'use client'

import { useEffect } from 'react'
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'

// OAuth domains that should open in SFSafariViewController
const OAUTH_DOMAINS = [
  'accounts.google.com',
  'appleid.apple.com',
  'auth.privy.io',
]

function isOAuthUrl(url: string): boolean {
  try {
    const urlObj = new URL(url)
    return OAUTH_DOMAINS.some(
      (domain) => urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain)
    )
  } catch {
    return false
  }
}

/**
 * Handles OAuth for Capacitor apps:
 * 1. Intercepts OAuth navigations → opens in SFSafariViewController (slide-up sheet)
 * 2. Listens for OAuth deep link callbacks → passes params back to web app
 *
 * This component must be rendered BEFORE PrivyProvider.
 */
export function AppUrlListener() {
  useEffect(() => {
    // Only set up in Capacitor environment
    if (typeof window === 'undefined') return
    if (!(window as any).Capacitor?.isNativePlatform?.()) return

    console.log('[AppUrlListener] Setting up OAuth interception for Capacitor')

    // Store originals for cleanup
    const originalWindowOpen = window.open
    const originalLocationAssign = window.location.assign.bind(window.location)
    const originalLocationReplace = window.location.replace.bind(window.location)

    // Helper to open OAuth in SFSafariViewController
    const openInSafariVC = (url: string) => {
      console.log('[AppUrlListener] Intercepted OAuth URL, opening in SFSafariViewController:', url)
      Browser.open({ url, presentationStyle: 'popover' }).catch((err) => {
        console.error('[AppUrlListener] Failed to open browser:', err)
      })
    }

    // 1. Set up deep link listener for OAuth callbacks
    const setupDeepLinkListener = async () => {
      try {
        await App.addListener('appUrlOpen', (event) => {
          console.log('[AppUrlListener] Received deep link:', event.url)
          try {
            const deepLinkUrl = new URL(event.url)

            // Check if this is a Privy OAuth callback
            if (
              deepLinkUrl.search &&
              deepLinkUrl.searchParams.has('privy_oauth_code') &&
              deepLinkUrl.searchParams.has('privy_oauth_state') &&
              deepLinkUrl.searchParams.has('privy_oauth_provider')
            ) {
              console.log('[AppUrlListener] OAuth callback detected, closing browser and passing params')
              // Close the SFSafariViewController
              Browser.close().catch(() => {})

              // Pass the OAuth params to the current page
              const currentUrl = new URL(window.location.href)
              currentUrl.search = deepLinkUrl.search
              originalLocationAssign(currentUrl.toString())
            }
          } catch (error) {
            console.error('[AppUrlListener] Failed to parse deep link URL:', error)
          }
        })
      } catch (error) {
        console.error('[AppUrlListener] Failed to set up app URL listener:', error)
      }
    }

    // 2. Intercept OAuth link clicks
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const anchor = target.closest('a')
      if (!anchor?.href) return

      if (isOAuthUrl(anchor.href)) {
        e.preventDefault()
        e.stopPropagation()
        openInSafariVC(anchor.href)
      }
    }

    // 3. Override window.open
    window.open = function (url?: string | URL, target?: string, features?: string) {
      const urlStr = url?.toString()
      if (urlStr && isOAuthUrl(urlStr)) {
        openInSafariVC(urlStr)
        return null
      }
      return originalWindowOpen.call(window, url, target, features)
    }

    // 4. Override location.assign (Privy likely uses this)
    window.location.assign = function (url: string | URL) {
      const urlStr = url.toString()
      if (isOAuthUrl(urlStr)) {
        openInSafariVC(urlStr)
        return
      }
      originalLocationAssign(urlStr)
    }

    // 5. Override location.replace
    window.location.replace = function (url: string | URL) {
      const urlStr = url.toString()
      if (isOAuthUrl(urlStr)) {
        openInSafariVC(urlStr)
        return
      }
      originalLocationReplace(urlStr)
    }

    // 6. Intercept location.href setter
    const locationDescriptor = Object.getOwnPropertyDescriptor(window, 'location')
    if (locationDescriptor && locationDescriptor.configurable !== false) {
      try {
        let currentHref = window.location.href
        Object.defineProperty(window.location, 'href', {
          get() {
            return currentHref
          },
          set(url: string) {
            if (isOAuthUrl(url)) {
              openInSafariVC(url)
            } else {
              originalLocationAssign(url)
            }
          },
          configurable: true,
        })
      } catch {
        // location.href may not be configurable in all browsers
        console.log('[AppUrlListener] Could not override location.href setter')
      }
    }

    setupDeepLinkListener()
    document.addEventListener('click', handleClick, true)

    return () => {
      App.removeAllListeners()
      document.removeEventListener('click', handleClick, true)
      window.open = originalWindowOpen
      window.location.assign = originalLocationAssign
      window.location.replace = originalLocationReplace
    }
  }, [])

  return null
}
