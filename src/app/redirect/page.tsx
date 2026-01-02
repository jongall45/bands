'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

/**
 * OAuth Redirect Handler for Capacitor
 *
 * This page handles OAuth callbacks from Google/Apple login.
 * When the user completes OAuth in Safari, they're redirected here.
 * This page then redirects back to the app using the custom URL scheme.
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
      setStatus('Opening app...')

      // Redirect to app using custom URL scheme
      // This triggers App.addListener('appUrlOpen') in the Capacitor app
      const customSchemeUrl = `bands://oauth/callback?${searchParams.toString()}`
      window.location.href = customSchemeUrl

      // Show success message (Safari stays open but app should be in foreground)
      setTimeout(() => {
        setStatus('You can close this tab')
      }, 1000)
    } else {
      setStatus('No OAuth parameters found.')
      // No OAuth params, redirect to home
      setTimeout(() => {
        window.location.href = 'https://www.bands.cash'
      }, 2000)
    }
  }, [searchParams])

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-white">{status}</p>
        <p className="text-gray-500 text-sm mt-2">Completing login...</p>
      </div>
    </div>
  )
}
