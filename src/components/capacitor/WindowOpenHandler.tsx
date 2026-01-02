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

      // Helper to open URL in Safari
      const openInSafari = (url: string) => {
        console.log('[WindowOpenHandler] >>> OPENING IN SAFARI:', url)
        Browser.open({ url, presentationStyle: 'popover', toolbarColor: '#000000' })
      }

      // Helper to extract URLs from HTML content
      const extractAndOpenUrls = (content: string) => {
        // Look for MoonPay URLs in the content
        const moonpayMatch = content.match(/https:\/\/[^"'\s]*moonpay[^"'\s]*/i)
        if (moonpayMatch) {
          console.log('[WindowOpenHandler] Found MoonPay URL in content:', moonpayMatch[0])
          openInSafari(moonpayMatch[0])
          return true
        }
        // Look for any redirect URLs
        const redirectMatch = content.match(/(?:href|src|url|location)\s*[=:]\s*["']?(https:\/\/[^"'\s>]+)/i)
        if (redirectMatch) {
          console.log('[WindowOpenHandler] Found redirect URL in content:', redirectMatch[1])
          if (redirectMatch[1].includes('moonpay') || redirectMatch[1].includes('privy')) {
            openInSafari(redirectMatch[1])
            return true
          }
        }
        return false
      }

      const proxyWindow: any = {
        closed: false,
        close: () => {
          console.log('[WindowOpenHandler] Proxy window close() called')
          proxyWindow.closed = true
        },
        focus: () => { console.log('[WindowOpenHandler] Proxy window focus() called') },
        blur: () => {},
        postMessage: (msg: any, origin: any) => {
          console.log('[WindowOpenHandler] Proxy postMessage called:', { msg, origin })
        },
        // Capture location assignments - multiple ways
        location: new Proxy({
          _href: 'about:blank',
          _hash: '',
          _search: '',
          _pathname: '/',
          _host: '',
          _hostname: '',
          _port: '',
          _protocol: 'about:',
          _origin: 'null',
        }, {
          get(target, prop) {
            console.log('[WindowOpenHandler] Proxy location GET:', prop)
            if (prop === 'href') return target._href
            if (prop === 'assign' || prop === 'replace') {
              return (url: string) => {
                console.log(`[WindowOpenHandler] Proxy location.${prop} called:`, url)
                if (url && url.startsWith('http')) openInSafari(url)
              }
            }
            if (prop === 'reload') return () => {}
            if (prop === 'toString') return () => target._href
            return (target as any)[`_${String(prop)}`] || ''
          },
          set(target, prop, value) {
            console.log('[WindowOpenHandler] Proxy location SET:', prop, '=', value)
            if (prop === 'href' || prop === '_href') {
              target._href = value
              if (value && value.startsWith('http')) openInSafari(value)
            }
            return true
          }
        }),
        document: {
          write: (content: string) => {
            console.log('[WindowOpenHandler] Proxy document.write called, length:', content.length)
            console.log('[WindowOpenHandler] document.write content preview:', content.substring(0, 500))
            extractAndOpenUrls(content)
          },
          writeln: (content: string) => {
            console.log('[WindowOpenHandler] Proxy document.writeln called, length:', content.length)
            extractAndOpenUrls(content)
          },
          close: () => { console.log('[WindowOpenHandler] Proxy document.close() called') },
          open: () => { console.log('[WindowOpenHandler] Proxy document.open() called') },
          // Add location on document too
          get location() {
            console.log('[WindowOpenHandler] Proxy document.location GET')
            return proxyWindow.location
          },
          set location(url: string) {
            console.log('[WindowOpenHandler] Proxy document.location SET:', url)
            if (url && url.startsWith('http')) openInSafari(url)
          },
          body: {
            innerHTML: '',
            appendChild: (el: any) => {
              console.log('[WindowOpenHandler] Proxy body.appendChild called:', el?.tagName, el?.src || el?.href)
              if (el?.src?.startsWith('http')) openInSafari(el.src)
              if (el?.href?.startsWith('http')) openInSafari(el.href)
            }
          },
          head: { appendChild: () => {} },
          createElement: (tag: string) => {
            console.log('[WindowOpenHandler] Proxy document.createElement:', tag)
            return { tagName: tag }
          },
        },
        // Add navigation property (some libs use this)
        navigate: (url: string) => {
          console.log('[WindowOpenHandler] Proxy navigate() called:', url)
          if (url && url.startsWith('http')) openInSafari(url)
        },
        opener: window,
        parent: window,
        self: null as any,
        window: null as any,
        top: null as any,
        name: target || '',
        // Add eval to catch dynamic code execution
        eval: (code: string) => {
          console.log('[WindowOpenHandler] Proxy eval called:', code.substring(0, 200))
          extractAndOpenUrls(code)
        },
      }
      proxyWindow.self = proxyWindow
      proxyWindow.window = proxyWindow
      proxyWindow.top = proxyWindow

      // Wrap in Proxy to catch ANY property access/set
      const finalProxy = new Proxy(proxyWindow, {
        get(target, prop) {
          if (prop === 'location' || prop === 'document' || prop === 'closed' ||
              prop === 'close' || prop === 'focus' || prop === 'self' ||
              prop === 'window' || prop === 'top' || prop === 'opener' ||
              prop === 'parent' || prop === 'name' || prop === 'postMessage' ||
              prop === 'blur' || prop === 'navigate' || prop === 'eval') {
            return target[prop]
          }
          console.log('[WindowOpenHandler] Proxy GET unknown prop:', prop)
          return target[prop]
        },
        set(target, prop, value) {
          console.log('[WindowOpenHandler] Proxy SET:', prop, '=',
            typeof value === 'string' ? value.substring(0, 200) : typeof value)
          if (prop === 'location' && typeof value === 'string' && value.startsWith('http')) {
            openInSafari(value)
          }
          target[prop] = value
          return true
        }
      })

      return finalProxy as unknown as Window
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
