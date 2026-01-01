'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

/**
 * OAuth Redirect Handler for Capacitor
 *
 * This page handles OAuth callbacks from Google/Apple login.
 * When the user completes OAuth in the browser (SFSafariViewController),
 * they're redirected here. This page then redirects back to the app
 * using the custom URL scheme to trigger the deep link listener.
 */
export default function RedirectPage() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState('Processing...')

  useEffect(() => {
    // Check if this is a Privy OAuth callback
    const hasOAuthParams =
      searchParams.has('privy_oauth_code') &&
      searchParams.has('privy_oauth_state') &&
      searchParams.has('privy_oauth_provider')

    if (hasOAuthParams) {
      console.log('[RedirectPage] Received OAuth callback, redirecting to app...')
      setStatus('Redirecting to app...')

      // Try custom URL scheme first (most reliable for triggering deep link)
      // This will be caught by App.addListener('appUrlOpen') in AppUrlListener
      const customSchemeUrl = `bands://oauth/callback?${searchParams.toString()}`

      // Also prepare Universal Link fallback
      const universalLinkUrl = `https://bands.cash/dashboard?${searchParams.toString()}`

      // Try custom scheme first
      window.location.href = customSchemeUrl

      // Fallback to Universal Link after a short delay if custom scheme didn't work
      // (This handles the case where the app isn't installed or scheme isn't registered)
      setTimeout(() => {
        console.log('[RedirectPage] Trying Universal Link fallback...')
        window.location.href = universalLinkUrl
      }, 500)
    } else {
      setStatus('No OAuth parameters found. Redirecting to home...')
      // No OAuth params, redirect to home
      setTimeout(() => {
        window.location.href = 'https://www.bands.cash'
      }, 2000)
    }
  }, [searchParams])

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-white">{status}</p>
        <p className="text-gray-500 text-sm mt-2">Completing login...</p>
      </div>
    </div>
  )
}
