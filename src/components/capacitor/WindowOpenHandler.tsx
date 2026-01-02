'use client'

import { useEffect } from 'react'
import { Browser } from '@capacitor/browser'

// Custom event name for when browser closes
export const BROWSER_CLOSED_EVENT = 'capacitor-browser-closed'

/**
 * WindowOpenHandler - Intercepts popups AND iframes for Capacitor native apps
 *
 * Privy's fundWallet doesn't use window.open - it creates an IFRAME with MoonPay.
 * We use MutationObserver to watch for iframe creation, grab the MoonPay URL,
 * and open it in Safari where Apple Pay actually works.
 */
export function WindowOpenHandler() {
  useEffect(() => {
    // Only run in Capacitor native environment
    const isCapacitor = !!(window as any).Capacitor?.isNativePlatform?.()
    if (!isCapacitor) return

    console.log('[WindowOpenHandler] Setting up iframe interceptor for Capacitor')

    // Store original window.open
    const originalWindowOpen = window.open.bind(window)

    // Listen for browser finished event and dispatch custom event
    const browserFinishedListener = Browser.addListener('browserFinished', () => {
      console.log('[WindowOpenHandler] Browser closed, dispatching event')
      window.dispatchEvent(new CustomEvent(BROWSER_CLOSED_EVENT))
    })

    // Override window.open to use Capacitor Browser
    window.open = (url?: string | URL, target?: string, features?: string): Window | null => {
      const urlString = url?.toString()
      if (!urlString || !urlString.startsWith('http')) {
        return null
      }
      console.log('[WindowOpenHandler] Intercepted window.open:', urlString)
      Browser.open({ url: urlString, presentationStyle: 'popover' })
      return null
    }

    // MutationObserver to watch for iframe additions (Privy/MoonPay uses iframes)
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLIFrameElement) {
            const src = node.src || node.getAttribute('src') || ''
            console.log('[WindowOpenHandler] Iframe detected, src:', src)

            // Check if this is a MoonPay iframe
            if (src.includes('moonpay.com') || src.includes('buy.moonpay')) {
              console.log('[WindowOpenHandler] MoonPay iframe detected! Opening in Safari:', src)

              // Remove the iframe so it doesn't try to load in WebView
              node.remove()

              // Open in Safari
              Browser.open({
                url: src,
                presentationStyle: 'popover',
                toolbarColor: '#000000'
              })
            }

            // Also check for Privy funding URLs
            if (src.includes('privy.io') && (src.includes('fund') || src.includes('moonpay'))) {
              console.log('[WindowOpenHandler] Privy funding iframe detected! Opening in Safari:', src)
              node.remove()
              Browser.open({
                url: src,
                presentationStyle: 'popover',
                toolbarColor: '#000000'
              })
            }
          }
        }
      }
    })

    // Start observing the entire document for iframe additions
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    })

    console.log('[WindowOpenHandler] Iframe observer active')

    // Cleanup on unmount
    return () => {
      window.open = originalWindowOpen
      observer.disconnect()
      browserFinishedListener.then(handle => handle.remove())
      console.log('[WindowOpenHandler] Cleaned up interceptors')
    }
  }, [])

  return null
}
