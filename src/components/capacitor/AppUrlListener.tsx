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

/**
 * Handles OAuth for Capacitor apps:
 * 1. Intercepts OAuth link clicks → opens in SFSafariViewController (slide-up sheet)
 * 2. Listens for OAuth deep link callbacks → passes params back to web app
 *
 * This component must be rendered BEFORE PrivyProvider.
 */
export function AppUrlListener() {
  useEffect(() => {
    // Only set up in Capacitor environment
    if (typeof window === 'undefined') return
    if (!(window as any).Capacitor?.isNativePlatform?.()) return

    // 1. Set up deep link listener for OAuth callbacks
    const setupDeepLinkListener = async () => {
      try {
        await App.addListener('appUrlOpen', (event) => {
          try {
            const deepLinkUrl = new URL(event.url)

            // Check if this is a Privy OAuth callback
            if (
              deepLinkUrl.search &&
              deepLinkUrl.searchParams.has('privy_oauth_code') &&
              deepLinkUrl.searchParams.has('privy_oauth_state') &&
              deepLinkUrl.searchParams.has('privy_oauth_provider')
            ) {
              // Close the SFSafariViewController
              Browser.close().catch(() => {})

              // Pass the OAuth params to the current page
              const currentUrl = new URL(window.location.href)
              currentUrl.search = deepLinkUrl.search
              window.location.assign(currentUrl.toString())
            }
          } catch (error) {
            console.error('Failed to parse deep link URL:', error)
          }
        })
      } catch (error) {
        console.error('Failed to set up app URL listener:', error)
      }
    }

    // 2. Intercept OAuth link clicks to open in SFSafariViewController
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const anchor = target.closest('a')

      if (!anchor?.href) return

      try {
        const url = new URL(anchor.href)

        // Check if this is an OAuth domain
        if (OAUTH_DOMAINS.some(domain => url.hostname === domain || url.hostname.endsWith('.' + domain))) {
          e.preventDefault()
          e.stopPropagation()

          // Open in SFSafariViewController (slide-up sheet within app)
          Browser.open({ url: anchor.href, presentationStyle: 'popover' })
            .catch((err) => {
              console.error('Failed to open browser:', err)
              // Fallback to normal navigation
              window.location.href = anchor.href
            })
        }
      } catch {
        // Not a valid URL, let it proceed normally
      }
    }

    // 3. Override window.open for OAuth URLs (Privy might use this)
    const originalWindowOpen = window.open
    window.open = function(url?: string | URL, target?: string, features?: string) {
      if (url) {
        try {
          const urlObj = new URL(url.toString(), window.location.origin)

          if (OAUTH_DOMAINS.some(domain => urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain))) {
            Browser.open({ url: urlObj.toString(), presentationStyle: 'popover' })
              .catch(() => {
                originalWindowOpen.call(window, url, target, features)
              })
            return null
          }
        } catch {
          // Not a valid URL
        }
      }
      return originalWindowOpen.call(window, url, target, features)
    }

    setupDeepLinkListener()
    document.addEventListener('click', handleClick, true)

    return () => {
      App.removeAllListeners()
      document.removeEventListener('click', handleClick, true)
      window.open = originalWindowOpen
    }
  }, [])

  return null
}
