'use client'

import { useEffect } from 'react'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

/**
 * Handles OAuth callbacks for Capacitor apps
 *
 * Per Privy's official docs (https://docs.privy.io/recipes/capacitor-oauth):
 * - Privy automatically opens OAuth in Safari via @capacitor/browser
 * - After auth, Safari redirects to customOAuthRedirectUrl
 * - Universal Links bring user back to app with privy_oauth_* params
 * - This component captures those params and passes them to Privy
 *
 * NO interception needed - Privy handles the browser opening automatically.
 */
export function AppUrlListener() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!Capacitor.isNativePlatform()) return

    console.log('[AppUrlListener] Setting up deep link handler for OAuth callbacks')

    // Listen for deep links / Universal Links
    const setupListener = async () => {
      await App.addListener('appUrlOpen', (event) => {
        console.log('[AppUrlListener] Received URL:', event.url)

        try {
          const deepLinkUrl = new URL(event.url)

          // Check for Privy OAuth callback params
          if (
            deepLinkUrl.searchParams.has('privy_oauth_code') &&
            deepLinkUrl.searchParams.has('privy_oauth_state') &&
            deepLinkUrl.searchParams.has('privy_oauth_provider')
          ) {
            console.log('[AppUrlListener] OAuth callback detected, passing to Privy')

            // Pass OAuth params to current page for Privy to process
            const currentUrl = new URL(window.location.href)
            currentUrl.search = deepLinkUrl.search
            window.location.assign(currentUrl.toString())
          }
        } catch (error) {
          console.error('[AppUrlListener] Failed to parse deep link URL:', error)
        }
      })
    }

    setupListener()

    return () => {
      App.removeAllListeners()
    }
  }, [])

  return null
}
