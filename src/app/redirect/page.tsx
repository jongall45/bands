'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

/**
 * OAuth Redirect Handler for Capacitor
 *
 * This page handles OAuth callbacks from Google/Apple login.
 * When the user completes OAuth in the browser, they're redirected here.
 * This page then redirects back to the app with the OAuth params.
 */
export default function RedirectPage() {
  const searchParams = useSearchParams()

  useEffect(() => {
    // Check if this is a Privy OAuth callback
    const hasOAuthParams =
      searchParams.has('privy_oauth_code') &&
      searchParams.has('privy_oauth_state') &&
      searchParams.has('privy_oauth_provider')

    if (hasOAuthParams) {
      // Build the deep link URL to redirect back to the app
      // Use Universal Link (HTTPS) for the redirect
      const appUrl = new URL('https://bands.cash/dashboard')
      appUrl.search = searchParams.toString()

      // Redirect to the app
      window.location.assign(appUrl.toString())
    }
  }, [searchParams])

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-white">Completing login...</p>
      </div>
    </div>
  )
}
