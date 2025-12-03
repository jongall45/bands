'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Loader2, LogOut, Mail, User } from 'lucide-react'

interface ConnectButtonProps {
  variant?: 'default' | 'large'
}

export function ConnectButton({ variant = 'default' }: ConnectButtonProps) {
  const router = useRouter()
  const { 
    isReady, 
    isAuthenticated, 
    login, 
    logout, 
    address, 
    displayAddress,
    displayEmail,
  } = useAuth()
  
  const [isLoggingIn, setIsLoggingIn] = useState(false)

  // Debug logging
  useEffect(() => {
    console.log('[ConnectButton] State:', { 
      isReady,
      isAuthenticated, 
      address, 
      displayEmail,
    })
  }, [isReady, isAuthenticated, address, displayEmail])

  // Redirect to dashboard after successful connection
  useEffect(() => {
    if (isAuthenticated && address) {
      console.log('[ConnectButton] Connected! Redirecting to dashboard...', address)
      router.push('/dashboard')
    }
  }, [isAuthenticated, address, router])

  // Handle login
  const handleLogin = async () => {
    setIsLoggingIn(true)
    try {
      login()
    } catch (error) {
      console.error('Login error:', error)
    } finally {
      // Privy handles the loading state, so we can reset immediately
      setTimeout(() => setIsLoggingIn(false), 1000)
    }
  }

  // Show loading while Privy initializes
  if (!isReady) {
    return (
      <button disabled className="flex items-center gap-2 bg-white/[0.08] text-white/50 px-5 py-2.5 rounded-full">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading...
      </button>
    )
  }

  // Logged in state
  if (isAuthenticated && address) {
    return (
      <div className="flex items-center gap-3">
        <div className="bg-white/[0.08] border border-white/[0.12] rounded-full px-4 py-2 flex items-center gap-2">
          {displayEmail ? (
            <>
              <Mail className="w-4 h-4 text-white/40" />
              <span className="text-white text-sm">{displayEmail}</span>
            </>
          ) : (
            <>
              <User className="w-4 h-4 text-white/40" />
              <span className="text-white/70 text-sm font-mono">{displayAddress}</span>
            </>
          )}
        </div>
        <button
          onClick={logout}
          className="p-2 text-white/40 hover:text-white/60 transition-colors"
          title="Sign Out"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    )
  }

  // Large variant - for landing page
  if (variant === 'large') {
    return (
      <div className="flex flex-col gap-3 w-full max-w-sm">
        {/* Primary Login Button */}
        <button
          onClick={handleLogin}
          disabled={isLoggingIn}
          className="flex items-center justify-center gap-3 bg-[#ef4444] hover:bg-[#dc2626] disabled:opacity-50 text-white font-semibold px-8 py-4 rounded-full transition-all shadow-[0_0_30px_rgba(239,68,68,0.3)] hover:shadow-[0_0_40px_rgba(239,68,68,0.4)]"
        >
          {isLoggingIn ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <Mail className="w-6 h-6" />
              Sign In
            </>
          )}
        </button>

        <p className="text-white/40 text-sm text-center">
          Sign in with Email, Google, or Apple
        </p>
      </div>
    )
  }

  // Default nav button
  return (
    <button
      onClick={handleLogin}
      disabled={isLoggingIn}
      className="flex items-center gap-2 bg-[#ef4444] hover:bg-[#dc2626] disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-full transition-colors"
    >
      {isLoggingIn ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          ...
        </>
      ) : (
        'Sign In'
      )}
    </button>
  )
}
