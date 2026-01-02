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

      // If URL provided, open directly in Safari
      if (urlString && urlString.startsWith('http')) {
        console.log('[WindowOpenHandler] Opening URL directly in Safari:', urlString)
        Browser.open({ url: urlString, presentationStyle: 'popover' })
        return null
      }

      // Privy calls window.open() WITHOUT a URL first, then sets popup.location.href later
      // We need to return a fake Window object that captures the URL assignment
      console.log('[WindowOpenHandler] Creating proxy Window to capture URL assignment')

      const proxyWindow = {
        closed: false,
        close: () => {
          console.log('[WindowOpenHandler] Proxy window close() called')
          proxyWindow.closed = true
        },
        focus: () => { console.log('[WindowOpenHandler] Proxy window focus() called') },
        blur: () => {},
        postMessage: () => {},
        // This is the key - capture location assignments
        location: {
          _href: '',
          get href() { return this._href },
          set href(url: string) {
            console.log('[WindowOpenHandler] Proxy location.href SET to:', url)
            if (url && url.startsWith('http')) {
              Browser.open({ url, presentationStyle: 'popover', toolbarColor: '#000000' })
            }
          },
          assign: (url: string) => {
            console.log('[WindowOpenHandler] Proxy location.assign called with:', url)
            if (url && url.startsWith('http')) {
              Browser.open({ url, presentationStyle: 'popover', toolbarColor: '#000000' })
            }
          },
          replace: (url: string) => {
            console.log('[WindowOpenHandler] Proxy location.replace called with:', url)
            if (url && url.startsWith('http')) {
              Browser.open({ url, presentationStyle: 'popover', toolbarColor: '#000000' })
            }
          },
          reload: () => {},
          toString: () => proxyWindow.location._href,
        },
        document: {
          write: (content: string) => {
            console.log('[WindowOpenHandler] Proxy document.write called:', content.substring(0, 100))
          },
          writeln: (content: string) => {
            console.log('[WindowOpenHandler] Proxy document.writeln called:', content.substring(0, 100))
          },
          close: () => {},
          open: () => {},
        },
        opener: window,
        parent: window,
        self: null as any,
        window: null as any,
        top: null as any,
        name: target || '',
      }
      proxyWindow.self = proxyWindow
      proxyWindow.window = proxyWindow
      proxyWindow.top = proxyWindow

      return proxyWindow as unknown as Window
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
