'use client'

import { useEffect } from 'react'
import { App } from '@capacitor/app'

/**
 * Handles OAuth deep link redirects for Capacitor apps.
 * This component must be rendered BEFORE PrivyProvider.
 *
 * When OAuth completes, the redirect URL includes privy_oauth_* params.
 * This listener catches those deep links and passes them to the web app.
 */
export function AppUrlListener() {
  useEffect(() => {
    // Only set up listener in Capacitor environment
    if (typeof window === 'undefined') return
    if (!(window as any).Capacitor?.isNativePlatform?.()) return

    const setupListener = async () => {
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

    setupListener()

    return () => {
      App.removeAllListeners()
    }
  }, [])

  return null
}
