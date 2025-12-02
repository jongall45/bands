'use client'

import { useState, useEffect, createContext, useContext, useCallback, ReactNode } from 'react'
import { Porto } from 'porto'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { base, optimism, arbitrum } from 'wagmi/chains'

// Wagmi config (standard, not Privy's wrapper)
const wagmiConfig = createConfig({
  chains: [base, optimism, arbitrum],
  transports: {
    [base.id]: http(),
    [optimism.id]: http(),
    [arbitrum.id]: http(),
  },
})

// Porto context types
interface PortoAccount {
  address: `0x${string}`
  chainId: number
}

interface Call {
  to: `0x${string}`
  data?: `0x${string}`
  value?: bigint
}

interface PortoContextType {
  porto: ReturnType<typeof Porto.create> | null
  account: PortoAccount | null
  isConnected: boolean
  isConnecting: boolean
  ready: boolean
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  sendCalls: (calls: Call[]) => Promise<string>
}

const PortoContext = createContext<PortoContextType | null>(null)

// Porto Provider Component
function PortoProviderInner({ children }: { children: ReactNode }) {
  const [porto, setPorto] = useState<ReturnType<typeof Porto.create> | null>(null)
  const [account, setAccount] = useState<PortoAccount | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [ready, setReady] = useState(false)

  // Initialize Porto on mount
  useEffect(() => {
    const portoInstance = Porto.create({
      chains: [base, optimism, arbitrum],
    })
    setPorto(portoInstance)

    // Check for existing session
    portoInstance.provider.request({ method: 'eth_accounts' })
      .then((accounts: string[]) => {
        if (accounts.length > 0) {
          setAccount({
            address: accounts[0] as `0x${string}`,
            chainId: base.id,
          })
        }
        setReady(true)
      })
      .catch((err) => {
        console.error('Failed to check accounts:', err)
        setReady(true)
      })
  }, [])

  // Connect with passkey
  const connect = useCallback(async () => {
    if (!porto) return

    setIsConnecting(true)
    try {
      const response = await porto.provider.request({
        method: 'wallet_connect',
        params: [{
          capabilities: {
            createAccount: true,
          },
        }],
      })

      if (response.accounts && response.accounts.length > 0) {
        setAccount({
          address: response.accounts[0].address as `0x${string}`,
          chainId: base.id,
        })
      }
    } catch (error) {
      console.error('Connection failed:', error)
      throw error
    } finally {
      setIsConnecting(false)
    }
  }, [porto])

  // Disconnect
  const disconnect = useCallback(async () => {
    if (!porto) return

    try {
      await porto.provider.request({
        method: 'wallet_disconnect',
      })
      setAccount(null)
    } catch (error) {
      console.error('Disconnect failed:', error)
    }
  }, [porto])

  // Send batched calls with USDC gas
  const sendCalls = useCallback(async (calls: Call[]): Promise<string> => {
    if (!porto || !account) {
      throw new Error('Not connected')
    }

    const formattedCalls = calls.map(call => ({
      to: call.to,
      data: call.data || '0x',
      value: call.value ? `0x${call.value.toString(16)}` : '0x0',
    }))

    const result = await porto.provider.request({
      method: 'wallet_sendCalls',
      params: [{
        from: account.address,
        chainId: `0x${base.id.toString(16)}`,
        calls: formattedCalls,
        capabilities: {
          paymasterService: true, // Enable gas sponsorship
        },
      }],
    })

    return result.id || result
  }, [porto, account])

  return (
    <PortoContext.Provider
      value={{
        porto,
        account,
        isConnected: !!account,
        isConnecting,
        ready,
        connect,
        disconnect,
        sendCalls,
      }}
    >
      {children}
    </PortoContext.Provider>
  )
}

// Main Providers wrapper
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <PortoProviderInner>
          {children}
        </PortoProviderInner>
      </WagmiProvider>
    </QueryClientProvider>
  )
}

// Hook to use Porto
export function usePorto() {
  const context = useContext(PortoContext)
  if (!context) {
    throw new Error('usePorto must be used within Providers')
  }
  return context
}

// Convenience hook matching old Privy pattern
export function useWallet() {
  const { account, isConnected } = usePorto()
  return {
    address: account?.address,
    isConnected,
    chainId: account?.chainId,
  }
}
