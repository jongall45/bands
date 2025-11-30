'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { Porto } from 'porto'
import { base } from 'viem/chains'

interface PortoAccount {
  address: `0x${string}`
}

interface PortoContextType {
  porto: ReturnType<typeof Porto.create> | null
  account: PortoAccount | null
  isConnecting: boolean
  isConnected: boolean
  error: string | null
  connect: () => Promise<void>
  disconnect: () => void
}

const PortoContext = createContext<PortoContextType | null>(null)

export function PortoProvider({ children }: { children: ReactNode }) {
  const [porto, setPorto] = useState<ReturnType<typeof Porto.create> | null>(null)
  const [account, setAccount] = useState<PortoAccount | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initialize Porto
  useEffect(() => {
    const portoInstance = Porto.create({
      chains: [base],
    })
    setPorto(portoInstance)

    // Check for existing session
    const savedAccount = localStorage.getItem('porto_account')
    if (savedAccount) {
      try {
        setAccount(JSON.parse(savedAccount))
      } catch (e) {
        localStorage.removeItem('porto_account')
      }
    }
  }, [])

  // Connect with passkey
  const connect = useCallback(async () => {
    if (!porto) {
      setError('Porto not initialized')
      return
    }

    setIsConnecting(true)
    setError(null)

    try {
      // Request account connection via passkey
      const accounts = await porto.provider.request({
        method: 'wallet_connect',
        params: [{
          capabilities: {
            createAccount: true, // Allow creating new account if none exists
          },
        }],
      })

      if (accounts && accounts.length > 0) {
        const connectedAccount = { address: accounts[0] as `0x${string}` }
        setAccount(connectedAccount)
        localStorage.setItem('porto_account', JSON.stringify(connectedAccount))
      }
    } catch (err) {
      console.error('Porto connection failed:', err)
      setError(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setIsConnecting(false)
    }
  }, [porto])

  // Disconnect
  const disconnect = useCallback(() => {
    setAccount(null)
    localStorage.removeItem('porto_account')
    
    if (porto) {
      porto.provider.request({
        method: 'wallet_disconnect',
        params: [],
      }).catch(console.error)
    }
  }, [porto])

  return (
    <PortoContext.Provider
      value={{
        porto,
        account,
        isConnecting,
        isConnected: !!account,
        error,
        connect,
        disconnect,
      }}
    >
      {children}
    </PortoContext.Provider>
  )
}

export function usePorto() {
  const context = useContext(PortoContext)
  if (!context) {
    throw new Error('usePorto must be used within a PortoProvider')
  }
  return context
}

