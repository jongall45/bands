'use client'

import { useEffect } from 'react'
import { Browser } from '@capacitor/browser'

// Custom event name for when browser closes
export const BROWSER_CLOSED_EVENT = 'capacitor-browser-closed'

/**
 * WindowOpenHandler - Patches window.open for Capacitor native apps
 *
 * iOS WebView (WKWebView) blocks window.open() calls by default.
 * This component intercepts those calls and uses Capacitor's Browser plugin
 * to open URLs in the native Safari browser instead.
 *
 * This is essential for:
 * - Privy's fundWallet (MoonPay) which opens in a popup
 * - OAuth flows that need external browser
 * - Any third-party integrations using window.open
 */
export function WindowOpenHandler() {
  useEffect(() => {
    // Only run in Capacitor native environment
    const isCapacitor = !!(window as any).Capacitor?.isNativePlatform?.()
    if (!isCapacitor) return

    // Store original window.open
    const originalWindowOpen = window.open.bind(window)

    // Listen for browser finished event and dispatch custom event
    const browserFinishedListener = Browser.addListener('browserFinished', () => {
      console.log('[WindowOpenHandler] Browser closed, dispatching event')
      window.dispatchEvent(new CustomEvent(BROWSER_CLOSED_EVENT))
    })

    // Override window.open to use Capacitor Browser
    window.open = (
      url?: string | URL,
      target?: string,
      features?: string
    ): Window | null => {
      const urlString = url?.toString()

      // If no URL, fall back to original behavior
      if (!urlString) {
        return originalWindowOpen(url, target, features)
      }

      console.log('[WindowOpenHandler] Intercepted window.open:', urlString)

      // Open URL using Capacitor Browser plugin (native Safari)
      Browser.open({
        url: urlString,
        presentationStyle: 'popover', // iOS: slides up from bottom like native
        toolbarColor: '#000000',
      }).then(() => {
        console.log('[WindowOpenHandler] Successfully opened in native browser')
      }).catch((err) => {
        console.error('[WindowOpenHandler] Failed to open URL:', err)
        // Fallback: try original window.open
        originalWindowOpen(url, target, features)
      })

      // Return null since we're handling this externally
      // Some code may check the return value, but MoonPay/Privy don't require it
      return null
    }

    console.log('[WindowOpenHandler] Patched window.open for Capacitor')

    // Cleanup on unmount
    return () => {
      window.open = originalWindowOpen
      browserFinishedListener.then(handle => handle.remove())
      console.log('[WindowOpenHandler] Restored original window.open')
    }
  }, [])

  return null // This component doesn't render anything
}
