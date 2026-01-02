'use client'

import { useEffect } from 'react'
import { Browser } from '@capacitor/browser'

// Custom event name for when browser closes
export const BROWSER_CLOSED_EVENT = 'capacitor-browser-closed'

/**
 * WindowOpenHandler - Intercepts popups for Capacitor native apps
 *
 * Privy's fundWallet calls window.open() without a URL, then sets location.href later.
 * We return a proxy Window that intercepts URL assignments and opens in Safari.
 */
export function WindowOpenHandler() {
  useEffect(() => {
    const isCapacitor = !!(window as any).Capacitor?.isNativePlatform?.()
    if (!isCapacitor) return

    const originalWindowOpen = window.open.bind(window)

    const browserFinishedListener = Browser.addListener('browserFinished', () => {
      window.dispatchEvent(new CustomEvent(BROWSER_CLOSED_EVENT))
    })

    window.open = (url?: string | URL, target?: string, features?: string): Window | null => {
      const urlString = url?.toString()

      // If URL provided, open directly in Safari
      if (urlString && urlString.startsWith('http')) {
        Browser.open({ url: urlString, presentationStyle: 'popover' })
        return null
      }

      // Helper to open URL in Safari
      const openInSafari = (url: string) => {
        Browser.open({ url, presentationStyle: 'popover', toolbarColor: '#000000' })
      }

      // Helper to extract URLs from HTML content
      const extractAndOpenUrls = (content: string) => {
        const moonpayMatch = content.match(/https:\/\/[^"'\s]*moonpay[^"'\s]*/i)
        if (moonpayMatch) {
          openInSafari(moonpayMatch[0])
          return true
        }
        const redirectMatch = content.match(/(?:href|src|url|location)\s*[=:]\s*["']?(https:\/\/[^"'\s>]+)/i)
        if (redirectMatch && (redirectMatch[1].includes('moonpay') || redirectMatch[1].includes('privy'))) {
          openInSafari(redirectMatch[1])
          return true
        }
        return false
      }

      // Proxy Window to capture URL assignments
      const proxyWindow: any = {
        closed: false,
        close: () => { proxyWindow.closed = true },
        focus: () => {},
        blur: () => {},
        postMessage: () => {},
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
            if (prop === 'href') return target._href
            if (prop === 'assign' || prop === 'replace') {
              return (url: string) => {
                if (url && url.startsWith('http')) openInSafari(url)
              }
            }
            if (prop === 'reload') return () => {}
            if (prop === 'toString') return () => target._href
            return (target as any)[`_${String(prop)}`] || ''
          },
          set(target, prop, value) {
            if (prop === 'href' || prop === '_href') {
              target._href = value
              if (value && value.startsWith('http')) openInSafari(value)
            }
            return true
          }
        }),
        document: {
          write: (content: string) => { extractAndOpenUrls(content) },
          writeln: (content: string) => { extractAndOpenUrls(content) },
          close: () => {},
          open: () => {},
          get location() { return proxyWindow.location },
          set location(url: string) {
            if (url && url.startsWith('http')) openInSafari(url)
          },
          body: {
            innerHTML: '',
            appendChild: (el: any) => {
              if (el?.src?.startsWith('http')) openInSafari(el.src)
              if (el?.href?.startsWith('http')) openInSafari(el.href)
            }
          },
          head: { appendChild: () => {} },
          createElement: (tag: string) => ({ tagName: tag }),
        },
        navigate: (url: string) => {
          if (url && url.startsWith('http')) openInSafari(url)
        },
        opener: window,
        parent: window,
        self: null as any,
        window: null as any,
        top: null as any,
        name: target || '',
        eval: (code: string) => { extractAndOpenUrls(code) },
      }
      proxyWindow.self = proxyWindow
      proxyWindow.window = proxyWindow
      proxyWindow.top = proxyWindow

      const finalProxy = new Proxy(proxyWindow, {
        get(target, prop) {
          return target[prop]
        },
        set(target, prop, value) {
          if (prop === 'location' && typeof value === 'string' && value.startsWith('http')) {
            openInSafari(value)
          }
          target[prop] = value
          return true
        }
      })

      return finalProxy as unknown as Window
    }

    return () => {
      window.open = originalWindowOpen
      browserFinishedListener.then(handle => handle.remove())
    }
  }, [])

  return null
}
