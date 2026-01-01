'use client'

import { useEffect, useRef } from 'react'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

// OAuth domains that should use native ASWebAuthenticationSession
const OAUTH_DOMAINS = [
  'accounts.google.com',
  'appleid.apple.com',
]

/**
 * Check if a URL is an OAuth domain
 */
function isOAuthDomain(url: string): boolean {
  try {
    const urlObj = new URL(url, window.location.origin)
    return OAUTH_DOMAINS.some(domain =>
      urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain)
    )
  } catch {
    return false
  }
}

/**
 * Open OAuth URL using native ASWebAuthenticationSession
 * This is the Apple-approved way that Google allows
 */
async function openNativeOAuth(url: string): Promise<string | null> {
  try {
    // Dynamically import to avoid issues on web
    const NativeOAuth = (await import('@/lib/capacitor/native-oauth')).default
    console.log('[OAuth] Starting native ASWebAuthenticationSession:', url)

    const result = await NativeOAuth.startOAuth({
      url,
      callbackScheme: 'bands'
    })

    console.log('[OAuth] Native OAuth completed:', result.url)
    return result.url
  } catch (error) {
    console.error('[OAuth] Native OAuth failed:', error)
    return null
  }
}

/**
 * Handle OAuth callback URL - pass params to current page for Privy to process
 */
function handleOAuthCallback(callbackUrl: string) {
  try {
    const url = new URL(callbackUrl)
    const params = url.searchParams

    // Check for Privy OAuth params
    if (params.has('privy_oauth_code') &&
        params.has('privy_oauth_state') &&
        params.has('privy_oauth_provider')) {
      console.log('[OAuth] Passing OAuth params to Privy')

      // Pass params to current page for Privy to process
      const currentUrl = new URL(window.location.href)
      currentUrl.search = url.search
      window.location.assign(currentUrl.toString())
    }
  } catch (error) {
    console.error('[OAuth] Failed to handle callback:', error)
  }
}

// Track if overrides are installed
let overridesInstalled = false
let originalWindowOpen: typeof window.open | null = null

/**
 * Install OAuth interception at module load time
 */
function installOAuthInterception() {
  if (typeof window === 'undefined') return
  if (overridesInstalled) return

  // Check if we're in Capacitor native
  const isNative = typeof (window as any).Capacitor !== 'undefined' &&
                   (window as any).Capacitor.isNativePlatform?.()
  if (!isNative) return

  overridesInstalled = true
  console.log('[OAuth] Installing native OAuth interception')

  // Override window.open to intercept OAuth URLs
  originalWindowOpen = window.open
  window.open = function(url?: string | URL, target?: string, features?: string): Window | null {
    const urlStr = url?.toString() || ''

    if (urlStr && isOAuthDomain(urlStr)) {
      console.log('[OAuth] Intercepted window.open:', urlStr)

      // Start native OAuth flow
      openNativeOAuth(urlStr).then(callbackUrl => {
        if (callbackUrl) {
          handleOAuthCallback(callbackUrl)
        }
      })

      // Return mock window to prevent errors
      return {
        closed: false,
        close: () => {},
        focus: () => {},
        blur: () => {},
        postMessage: () => {},
        location: { href: urlStr } as Location,
      } as unknown as Window
    }

    return originalWindowOpen!.call(window, url, target, features)
  }

  // Override location.assign for OAuth URLs
  const originalAssign = window.location.assign.bind(window.location)
  window.location.assign = function(url: string | URL) {
    const urlStr = url.toString()
    if (isOAuthDomain(urlStr)) {
      console.log('[OAuth] Intercepted location.assign:', urlStr)
      openNativeOAuth(urlStr).then(callbackUrl => {
        if (callbackUrl) {
          handleOAuthCallback(callbackUrl)
        }
      })
      return
    }
    return originalAssign(url)
  }
}

// Install immediately when module loads
installOAuthInterception()

/**
 * Handles OAuth for Capacitor apps using native ASWebAuthenticationSession
 *
 * This component:
 * 1. Intercepts OAuth URLs (window.open, location.assign, iframes)
 * 2. Opens them in ASWebAuthenticationSession (system browser sheet)
 * 3. Handles the callback and passes OAuth params to Privy
 */
export function AppUrlListener() {
  const observerRef = useRef<MutationObserver | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!Capacitor.isNativePlatform()) return

    // Ensure overrides are installed
    installOAuthInterception()

    console.log('[OAuth] Initializing OAuth handlers')

    // Set up deep link listener for OAuth callbacks (backup)
    const setupDeepLinkListener = async () => {
      await App.addListener('appUrlOpen', (event) => {
        console.log('[OAuth] Received deep link:', event.url)
        handleOAuthCallback(event.url)
      })
    }

    // Watch for OAuth iframes and intercept them
    const setupIframeObserver = () => {
      observerRef.current = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node instanceof HTMLIFrameElement) {
              const src = node.src || ''
              if (isOAuthDomain(src)) {
                console.log('[OAuth] Intercepted iframe:', src)
                node.remove()
                openNativeOAuth(src).then(callbackUrl => {
                  if (callbackUrl) {
                    handleOAuthCallback(callbackUrl)
                  }
                })
              }
            }
          }
        }
      })

      observerRef.current.observe(document.body, {
        childList: true,
        subtree: true,
      })
    }

    // Intercept click events on OAuth links
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const anchor = target.closest('a')
      if (!anchor?.href) return

      if (isOAuthDomain(anchor.href)) {
        console.log('[OAuth] Intercepted click:', anchor.href)
        e.preventDefault()
        e.stopPropagation()
        openNativeOAuth(anchor.href).then(callbackUrl => {
          if (callbackUrl) {
            handleOAuthCallback(callbackUrl)
          }
        })
      }
    }

    setupDeepLinkListener()
    document.addEventListener('click', handleClick, true)

    if (document.body) {
      setupIframeObserver()
    } else {
      document.addEventListener('DOMContentLoaded', setupIframeObserver)
    }

    return () => {
      App.removeAllListeners()
      document.removeEventListener('click', handleClick, true)
      observerRef.current?.disconnect()
      if (originalWindowOpen) {
        window.open = originalWindowOpen
      }
    }
  }, [])

  return null
}
