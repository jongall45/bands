'use client'

import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { Loader2, Fingerprint, LogOut } from 'lucide-react'

interface ConnectButtonProps {
  variant?: 'default' | 'large'
}

export function ConnectButton({ variant = 'default' }: ConnectButtonProps) {
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending, error } = useConnect()
  const { disconnect } = useDisconnect()

  // Find the Porto connector - it should be the first/only one
  const portoConnector = connectors.find(c => c.id === 'xyz.ithaca.porto') || connectors[0]

  const handleConnect = () => {
    console.log('Connect clicked')
    console.log('Available connectors:', connectors.map(c => ({ id: c.id, name: c.name })))
    console.log('Porto connector:', portoConnector)
    
    if (!portoConnector) {
      console.error('No Porto connector found!')
      return
    }
    
    // Simply call connect with the Porto connector
    // Porto handles the dialog/passkey flow internally
    connect({ connector: portoConnector })
  }

  // Log any connection errors
  if (error) {
    console.error('Connection error:', error)
  }

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-3">
        <div className="bg-white/[0.05] border border-white/[0.08] rounded-full px-4 py-2">
          <span className="text-gray-600 text-sm font-mono">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
        </div>
        <button
          onClick={() => disconnect()}
          className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    )
  }

  if (variant === 'large') {
    return (
      <button
        onClick={handleConnect}
        disabled={isPending || !portoConnector}
        className="flex items-center justify-center gap-3 bg-[#ef4444] hover:bg-[#dc2626] disabled:opacity-50 text-white font-semibold px-8 py-4 rounded-full transition-all shadow-[0_0_30px_rgba(239,68,68,0.3)] hover:shadow-[0_0_40px_rgba(239,68,68,0.4)]"
      >
        {isPending ? (
          <>
            <Loader2 className="w-6 h-6 animate-spin" />
            Creating Account...
          </>
        ) : (
          <>
            <Fingerprint className="w-6 h-6" />
            Sign In with Passkey
          </>
        )}
      </button>
    )
  }

  return (
    <button
      onClick={handleConnect}
      disabled={isPending || !portoConnector}
      className="flex items-center gap-2 bg-[#ef4444] hover:bg-[#dc2626] disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-full transition-colors"
    >
      {isPending ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          Connecting...
        </>
      ) : (
        <>
          <Fingerprint className="w-4 h-4" />
          Connect
        </>
      )}
    </button>
  )
}
