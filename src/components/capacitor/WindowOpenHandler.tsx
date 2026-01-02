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

    console.log('[WindowOpenHandler] Setting up comprehensive interceptors for Capacitor')

    // Store original window.open
    const originalWindowOpen = window.open.bind(window)

    // Listen for browser finished event and dispatch custom event
    const browserFinishedListener = Browser.addListener('browserFinished', () => {
      console.log('[WindowOpenHandler] Browser closed, dispatching event')
      window.dispatchEvent(new CustomEvent(BROWSER_CLOSED_EVENT))
    })

    // Override window.open to use Capacitor Browser - log ALL calls
    window.open = (url?: string | URL, target?: string, features?: string): Window | null => {
      console.log('[WindowOpenHandler] window.open called with:', { url: url?.toString(), target, features })
      const urlString = url?.toString()
      if (!urlString || !urlString.startsWith('http')) {
        console.log('[WindowOpenHandler] Ignoring non-http URL')
        return null
      }
      console.log('[WindowOpenHandler] Opening in Safari:', urlString)
      Browser.open({ url: urlString, presentationStyle: 'popover' })
      return null
    }

    // MutationObserver to watch for ALL DOM changes (debug mode)
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement) {
            // Log any element with privy, moonpay, or modal in its class/id
            const className = node.className?.toString?.() || ''
            const id = node.id || ''
            const tagName = node.tagName?.toLowerCase() || ''

            if (className.includes('privy') || id.includes('privy') ||
                className.includes('modal') || className.includes('Modal') ||
                className.includes('moonpay') || id.includes('moonpay')) {
              console.log('[WindowOpenHandler] Privy/Modal element detected:', {
                tag: tagName,
                id,
                className: className.substring(0, 100),
                innerHTML: node.innerHTML?.substring(0, 200)
              })
            }
          }

          if (node instanceof HTMLIFrameElement) {
            const src = node.src || node.getAttribute('src') || ''
            console.log('[WindowOpenHandler] Iframe detected:', {
              src,
              id: node.id,
              className: node.className,
              name: node.name
            })

            // Check if this is a MoonPay iframe
            if (src && (src.includes('moonpay.com') || src.includes('buy.moonpay'))) {
              console.log('[WindowOpenHandler] MoonPay iframe! Opening in Safari:', src)
              node.remove()
              Browser.open({
                url: src,
                presentationStyle: 'popover',
                toolbarColor: '#000000'
              })
            }

            // Check for Privy funding URLs
            if (src && src.includes('privy.io') && (src.includes('fund') || src.includes('moonpay'))) {
              console.log('[WindowOpenHandler] Privy funding iframe! Opening in Safari:', src)
              node.remove()
              Browser.open({
                url: src,
                presentationStyle: 'popover',
                toolbarColor: '#000000'
              })
            }

            // Watch for src changes on iframes (Privy might set src after adding)
            const srcObserver = new MutationObserver(() => {
              const newSrc = node.src || node.getAttribute('src') || ''
              if (newSrc && newSrc !== src) {
                console.log('[WindowOpenHandler] Iframe src changed to:', newSrc)
                if (newSrc.includes('moonpay.com') || newSrc.includes('buy.moonpay')) {
                  console.log('[WindowOpenHandler] MoonPay detected on src change! Opening:', newSrc)
                  node.remove()
                  srcObserver.disconnect()
                  Browser.open({
                    url: newSrc,
                    presentationStyle: 'popover',
                    toolbarColor: '#000000'
                  })
                }
              }
            })
            srcObserver.observe(node, { attributes: true, attributeFilter: ['src'] })
          }
        }
      }
    })

    // Watch entire document, not just body
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    })

    console.log('[WindowOpenHandler] Observers active on document.documentElement')

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
