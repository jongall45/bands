'use client'

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { ExternalLink, Loader2, AlertCircle, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface EmbeddedDAppProps {
  url: string
  name: string
  description?: string
  backHref?: string
}

export function EmbeddedDApp({ url, name, description, backHref = '/dashboard' }: EmbeddedDAppProps) {
  const { isConnected, address } = useAccount()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Privy announces itself via EIP-6963
    // The embedded dApp should detect it automatically
    if (isConnected) {
      setIsLoading(false)
    }
  }, [isConnected])

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-white/20 mx-auto mb-4" />
          <p className="text-white/60">Please connect your wallet first</p>
          <Link href="/" className="text-[#ef4444] text-sm mt-2 inline-block">
            Go to Login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Header */}
      <header className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between bg-[#111]">
        <div className="flex items-center gap-3">
          <Link href={backHref} className="text-white/60 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-white font-semibold">{name}</h1>
            {description && (
              <p className="text-white/40 text-sm">{description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <span className="text-green-400 text-xs">Connected</span>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/40 hover:text-white/60 ml-2"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </header>

      {/* Wallet Info Bar */}
      <div className="px-5 py-2 bg-white/[0.02] border-b border-white/[0.06] flex items-center justify-between">
        <span className="text-white/40 text-xs">Your wallet:</span>
        <span className="text-white/60 text-xs font-mono">
          {address?.slice(0, 10)}...{address?.slice(-8)}
        </span>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-white/20 animate-spin mx-auto mb-4" />
            <p className="text-white/40">Loading {name}...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-red-400/50 mx-auto mb-4" />
            <p className="text-red-400">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-white/60 text-sm mt-2"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {/* Embedded iFrame */}
      {!error && (
        <iframe
          src={url}
          className={`flex-1 w-full border-0 ${isLoading ? 'hidden' : ''}`}
          onLoad={() => setIsLoading(false)}
          onError={() => setError('Failed to load application')}
          allow="publickey-credentials-get *; clipboard-write *"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        />
      )}
    </div>
  )
}
