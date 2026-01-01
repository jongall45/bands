'use client'

import { useEffect, useRef } from 'react'
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'

// OAuth domains that should open in SFSafariViewController
const OAUTH_DOMAINS = [
  'accounts.google.com',
  'appleid.apple.com',
  'auth.privy.io',
]

/**
 * Check if a URL is an OAuth domain that should open externally
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
 * Open URL in SFSafariViewController (external browser sheet)
 */
async function openInExternalBrowser(url: string): Promise<boolean> {
  try {
    console.log('[AppUrlListener] Opening in SFSafariViewController:', url)
    await Browser.open({ url, presentationStyle: 'popover' })
    return true
  } catch (err) {
    console.error('[AppUrlListener] Failed to open browser:', err)
    return false
  }
}

// Flag to track if we're in Capacitor native environment
let isCapacitorNative = false

// Store original functions to restore later
let originalWindowOpen: typeof window.open | null = null
let isOverrideSetup = false

/**
 * Set up all overrides IMMEDIATELY (not in useEffect)
 * This ensures they're in place before Privy loads
 */
function setupOverrides() {
  if (typeof window === 'undefined') return
  if (isOverrideSetup) return // Already set up

  isCapacitorNative = !!(window as any).Capacitor?.isNativePlatform?.()
  if (!isCapacitorNative) return

  isOverrideSetup = true
  console.log('[AppUrlListener] Setting up OAuth interception overrides')

  // 1. Override window.open
  originalWindowOpen = window.open
  window.open = function(url?: string | URL, target?: string, features?: string): Window | null {
    const urlStr = url?.toString() || ''

    if (urlStr && isOAuthDomain(urlStr)) {
      console.log('[AppUrlListener] Intercepted window.open to OAuth domain:', urlStr)
      openInExternalBrowser(urlStr)
      // Return a mock window object to prevent Privy from thinking the popup failed
      return {
        closed: false,
        close: () => { Browser.close().catch(() => {}) },
        focus: () => {},
        blur: () => {},
        postMessage: () => {},
        location: { href: urlStr } as Location,
      } as unknown as Window
    }

    return originalWindowOpen!.call(window, url, target, features)
  }

  // 2. Override location.assign and location.replace
  const originalAssign = window.location.assign.bind(window.location)
  const originalReplace = window.location.replace.bind(window.location)

  window.location.assign = function(url: string | URL) {
    const urlStr = url.toString()
    if (isOAuthDomain(urlStr)) {
      console.log('[AppUrlListener] Intercepted location.assign to OAuth domain:', urlStr)
      openInExternalBrowser(urlStr)
      return
    }
    return originalAssign(url)
  }

  window.location.replace = function(url: string | URL) {
    const urlStr = url.toString()
    if (isOAuthDomain(urlStr)) {
      console.log('[AppUrlListener] Intercepted location.replace to OAuth domain:', urlStr)
      openInExternalBrowser(urlStr)
      return
    }
    return originalReplace(url)
  }

  // 3. Try to intercept location.href setter (may not work in all browsers)
  try {
    const locationDescriptor = Object.getOwnPropertyDescriptor(window, 'location')
    if (locationDescriptor && locationDescriptor.configurable !== false) {
      // Can't directly override location.href, but we can use a proxy approach
      console.log('[AppUrlListener] Note: location.href override not possible, relying on other methods')
    }
  } catch (e) {
    // Ignore - location properties are usually non-configurable
  }
}

// Run the override setup immediately when this module loads
setupOverrides()

/**
 * Handles OAuth for Capacitor apps:
 * 1. Intercepts window.open calls → opens OAuth in SFSafariViewController
 * 2. Intercepts OAuth link clicks → opens in SFSafariViewController
 * 3. Watches for OAuth iframes → redirects to SFSafariViewController
 * 4. Listens for OAuth deep link callbacks → passes params back to web app
 *
 * This component must be rendered BEFORE PrivyProvider.
 */
export function AppUrlListener() {
  const mutationObserverRef = useRef<MutationObserver | null>(null)

  useEffect(() => {
    // Ensure overrides are set up (in case module-level didn't run)
    setupOverrides()

    // Only set up in Capacitor environment
    if (typeof window === 'undefined') return
    if (!(window as any).Capacitor?.isNativePlatform?.()) return

    console.log('[AppUrlListener] Initializing OAuth handlers')

    // 1. Set up deep link listener for OAuth callbacks
    const setupDeepLinkListener = async () => {
      try {
        await App.addListener('appUrlOpen', (event) => {
          console.log('[AppUrlListener] Received deep link:', event.url)
          try {
            const deepLinkUrl = new URL(event.url)

            // Check if this is a Privy OAuth callback
            // Supports both custom scheme (bands://oauth/callback?...) and Universal Links
            const hasOAuthParams =
              deepLinkUrl.searchParams.has('privy_oauth_code') &&
              deepLinkUrl.searchParams.has('privy_oauth_state') &&
              deepLinkUrl.searchParams.has('privy_oauth_provider')

            if (hasOAuthParams) {
              console.log('[AppUrlListener] Processing OAuth callback from:', deepLinkUrl.protocol)

              // Close the SFSafariViewController
              Browser.close().catch((err) => {
                console.log('[AppUrlListener] Browser.close() result:', err)
              })

              // Pass the OAuth params to the current page
              // This allows Privy to complete the authentication
              const currentUrl = new URL(window.location.href)
              currentUrl.search = deepLinkUrl.search
              console.log('[AppUrlListener] Redirecting to:', currentUrl.toString())
              window.location.assign(currentUrl.toString())
            }
          } catch (error) {
            console.error('[AppUrlListener] Failed to parse deep link URL:', error)
          }
        })
      } catch (error) {
        console.error('[AppUrlListener] Failed to set up app URL listener:', error)
      }
    }

    // 2. Intercept OAuth link clicks to open in SFSafariViewController
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const anchor = target.closest('a')

      if (!anchor?.href) return

      if (isOAuthDomain(anchor.href)) {
        console.log('[AppUrlListener] Intercepted click to OAuth domain:', anchor.href)
        e.preventDefault()
        e.stopPropagation()
        openInExternalBrowser(anchor.href)
      }
    }

    // 3. Watch for OAuth iframes being added to the DOM
    const setupIframeObserver = () => {
      mutationObserverRef.current = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node instanceof HTMLIFrameElement) {
              const src = node.src || node.getAttribute('src') || ''
              if (isOAuthDomain(src)) {
                console.log('[AppUrlListener] Intercepted OAuth iframe:', src)
                // Remove the iframe and open in external browser instead
                node.remove()
                openInExternalBrowser(src)
              }
            }
          }
        }
      })

      mutationObserverRef.current.observe(document.body, {
        childList: true,
        subtree: true,
      })
    }

    // 4. Intercept form submissions to OAuth domains
    const handleSubmit = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement
      const action = form.action || ''

      if (isOAuthDomain(action)) {
        console.log('[AppUrlListener] Intercepted form submit to OAuth domain:', action)
        e.preventDefault()
        e.stopPropagation()
        openInExternalBrowser(action)
      }
    }

    setupDeepLinkListener()
    document.addEventListener('click', handleClick, true)
    document.addEventListener('submit', handleSubmit, true)

    // Wait for body to be available before setting up observer
    if (document.body) {
      setupIframeObserver()
    } else {
      document.addEventListener('DOMContentLoaded', setupIframeObserver)
    }

    return () => {
      App.removeAllListeners()
      document.removeEventListener('click', handleClick, true)
      document.removeEventListener('submit', handleSubmit, true)
      mutationObserverRef.current?.disconnect()

      // Restore original window.open
      if (originalWindowOpen) {
        window.open = originalWindowOpen
        originalWindowOpen = null
      }
    }
  }, [])

  return null
}
