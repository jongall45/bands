'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { Porto } from 'porto'
import { useWallets } from '@privy-io/react-auth'
import { createWalletClient, custom, type WalletClient, type Hex } from 'viem'
import { base } from 'viem/chains'

interface PortoContextType {
  porto: ReturnType<typeof Porto.create> | null
  isUpgraded: boolean
  isUpgrading: boolean
  upgradeError: string | null
  upgradeWallet: () => Promise<void>
  sendCalls: (calls: Call[]) => Promise<string>
  getUpgradeStatus: () => boolean
}

interface Call {
  to: `0x${string}`
  data?: `0x${string}`
  value?: bigint
}

const PortoContext = createContext<PortoContextType | null>(null)

export function PortoProvider({ children }: { children: ReactNode }) {
  const { wallets } = useWallets()
  const [porto, setPorto] = useState<ReturnType<typeof Porto.create> | null>(null)
  const [isUpgraded, setIsUpgraded] = useState(false)
  const [isUpgrading, setIsUpgrading] = useState(false)
  const [upgradeError, setUpgradeError] = useState<string | null>(null)
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null)

  const privyWallet = wallets.find((w) => w.walletClientType === 'privy')

  // Initialize Porto
  useEffect(() => {
    const portoInstance = Porto.create({
      chains: [base],
    })
    setPorto(portoInstance)
  }, [])

  // Check upgrade status from localStorage
  useEffect(() => {
    if (privyWallet?.address) {
      const upgradeKey = `porto_upgraded_${privyWallet.address}`
      const upgraded = localStorage.getItem(upgradeKey) === 'true'
      setIsUpgraded(upgraded)
    }
  }, [privyWallet?.address])

  // Setup wallet client when Privy wallet is available
  useEffect(() => {
    async function setupWalletClient() {
      if (!privyWallet) return
      
      const provider = await privyWallet.getEthereumProvider()
      const client = createWalletClient({
        chain: base,
        transport: custom(provider),
      })
      setWalletClient(client)
    }
    
    setupWalletClient()
  }, [privyWallet])

  const getUpgradeStatus = useCallback(() => {
    if (!privyWallet?.address) return false
    const upgradeKey = `porto_upgraded_${privyWallet.address}`
    return localStorage.getItem(upgradeKey) === 'true'
  }, [privyWallet?.address])

  // Upgrade EOA to Porto Smart Account
  const upgradeWallet = useCallback(async () => {
    if (!porto || !privyWallet || !walletClient) {
      throw new Error('Porto or wallet not initialized')
    }

    setIsUpgrading(true)
    setUpgradeError(null)

    try {
      const provider = await privyWallet.getEthereumProvider()
      
      // Step 1: Prepare upgrade
      const { context, digests } = await porto.provider.request({
        method: 'wallet_prepareUpgradeAccount',
        params: [{
          address: privyWallet.address as `0x${string}`,
        }],
      })

      // Step 2: Sign the authorization and execution digests with Privy wallet
      const authSignature = await provider.request({
        method: 'personal_sign',
        params: [digests.auth, privyWallet.address],
      }) as Hex

      const execSignature = await provider.request({
        method: 'personal_sign',
        params: [digests.exec, privyWallet.address],
      }) as Hex

      // Step 3: Complete the upgrade
      await porto.provider.request({
        method: 'wallet_upgradeAccount',
        params: [{
          context,
          signatures: {
            auth: authSignature,
            exec: execSignature,
          },
        }],
      })

      // Save upgrade status
      const upgradeKey = `porto_upgraded_${privyWallet.address}`
      localStorage.setItem(upgradeKey, 'true')
      setIsUpgraded(true)

    } catch (error) {
      console.error('Upgrade failed:', error)
      setUpgradeError(error instanceof Error ? error.message : 'Upgrade failed')
      throw error
    } finally {
      setIsUpgrading(false)
    }
  }, [porto, privyWallet, walletClient])

  // Send batched calls via Porto
  const sendCalls = useCallback(async (calls: Call[]): Promise<string> => {
    if (!porto || !privyWallet) {
      throw new Error('Porto or wallet not initialized')
    }

    // Format calls for Porto
    const formattedCalls = calls.map(call => ({
      to: call.to,
      data: call.data || '0x' as `0x${string}`,
      value: call.value ? `0x${call.value.toString(16)}` as `0x${string}` : '0x0' as `0x${string}`,
    }))

    const result = await porto.provider.request({
      method: 'wallet_sendCalls',
      params: [{
        from: privyWallet.address as `0x${string}`,
        chainId: `0x${base.id.toString(16)}`,
        calls: formattedCalls,
        capabilities: {
          paymasterService: {
            url: 'https://paymaster.porto.sh', // Porto's paymaster for USDC gas
          },
        },
      }],
    })

    return result.id || result
  }, [porto, privyWallet])

  return (
    <PortoContext.Provider
      value={{
        porto,
        isUpgraded,
        isUpgrading,
        upgradeError,
        upgradeWallet,
        sendCalls,
        getUpgradeStatus,
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

