'use client'

import { useAccount, useDisconnect } from 'wagmi'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import { LogOut, ExternalLink, Copy, Check, Shield, Smartphone, Key, AlertTriangle, Loader2, Wallet, Globe } from 'lucide-react'
import { LogoInline } from '@/components/ui/Logo'
import { AppShell, AppContent } from '@/components/layout/AppShell'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets'
import { useSolanaAuth } from '@/hooks/useSolanaAuth'
import haptics from '@/lib/haptics'

// Wallet Card Component
function WalletCard({
  title,
  subtitle,
  address,
  explorerUrl,
  explorerName,
  icon,
  accentColor = '#FF3B30',
  onExport,
  canExport = false,
  isExporting = false,
}: {
  title: string
  subtitle: string
  address: string
  explorerUrl: string
  explorerName: string
  icon: React.ReactNode
  accentColor?: string
  onExport?: () => void
  canExport?: boolean
  isExporting?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const [showExportWarning, setShowExportWarning] = useState(false)

  const copyAddress = () => {
    haptics.buttonTap()
    navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleExportClick = () => {
    haptics.buttonPress()
    if (showExportWarning && onExport) {
      onExport()
      setShowExportWarning(false)
    } else {
      setShowExportWarning(true)
    }
  }

  return (
    <div className="wallet-card">
      {/* Header */}
      <div className="wallet-card-header">
        <div className="wallet-icon" style={{ borderColor: accentColor }}>
          {icon}
        </div>
        <div>
          <h3 className="wallet-title">{title}</h3>
          <p className="wallet-subtitle">{subtitle}</p>
        </div>
      </div>

      {/* Address */}
      <div className="wallet-address-row">
        <p className="wallet-address">
          {address.slice(0, 10)}...{address.slice(-8)}
        </p>
        <button onClick={copyAddress} className="copy-btn">
          {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>

      {/* Explorer Link */}
      <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="explorer-link" style={{ color: accentColor }}>
        View on {explorerName}
        <ExternalLink className="w-4 h-4" />
      </a>

      {/* Export Key Section */}
      {canExport && (
        <div className="export-section">
          {!showExportWarning ? (
            <button onClick={() => setShowExportWarning(true)} className="export-btn" style={{ borderColor: accentColor, color: accentColor }}>
              <Key className="w-4 h-4" />
              Export Private Key
            </button>
          ) : (
            <div className="export-warning">
              <div className="warning-box">
                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <p className="warning-text">Never share your private key. Anyone with it has full access to your funds.</p>
              </div>
              <div className="warning-buttons">
                <button onClick={() => setShowExportWarning(false)} className="cancel-btn">
                  Cancel
                </button>
                <button onClick={handleExportClick} disabled={isExporting} className="confirm-btn">
                  {isExporting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Exporting...
                    </>
                  ) : (
                    'I Understand, Export'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const { address: eoaAddress, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const { logout, exportWallet, ready, authenticated } = usePrivy()
  const { wallets } = useWallets()
  const { client: smartWalletClient } = useSmartWallets()
  const solana = useSolanaAuth()
  const router = useRouter()
  const [isExportingEvm, setIsExportingEvm] = useState(false)
  const [isExportingSolana, setIsExportingSolana] = useState(false)
  const hasNavigatedRef = useRef(false)

  // Get wallet addresses
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy')
  const smartWalletAddress = smartWalletClient?.account?.address as `0x${string}` | undefined
  const solanaAddress = solana.solanaAddress

  // Redirect if not authenticated
  useEffect(() => {
    if (ready && !authenticated && !hasNavigatedRef.current) {
      hasNavigatedRef.current = true
      router.push('/')
    }
  }, [authenticated, ready, router])

  // Enable scrolling for this page on iOS
  useEffect(() => {
    document.body.classList.add('allow-scroll')
    return () => {
      document.body.classList.remove('allow-scroll')
    }
  }, [])

  const handleDisconnect = async () => {
    haptics.buttonPress()
    try {
      await logout()
    } catch (e) {
      disconnect()
    }
    router.push('/')
  }

  const handleExportEvmWallet = async () => {
    if (!embeddedWallet) return
    setIsExportingEvm(true)
    try {
      await exportWallet()
    } catch (error) {
      console.error('Failed to export EVM wallet:', error)
    } finally {
      setIsExportingEvm(false)
    }
  }

  const handleExportSolanaWallet = async () => {
    if (!solanaAddress) return
    setIsExportingSolana(true)
    try {
      // Export Solana wallet using Privy
      await exportWallet({ address: solanaAddress })
    } catch (error) {
      console.error('Failed to export Solana wallet:', error)
    } finally {
      setIsExportingSolana(false)
    }
  }

  // Loading state
  if (!ready || !authenticated) {
    return (
      <div className="settings-page">
        <div className="grid-background" />
        <div className="loading-container">
          <div className="loading-spinner" />
        </div>
      </div>
    )
  }

  if (!isConnected || !eoaAddress) return null

  return (
    <AppShell>
      <div className="settings-page page-transition">
        {/* Grid Background */}
        <div className="grid-background" />
        <div className="crosshair-overlay" />

        {/* Sticky Header - consistent branding */}
        <header
          className="sticky top-0 z-40 bg-[#050505]/95 backdrop-blur-sm border-b border-white/[0.04]"
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          <div className="flex items-center justify-between px-4 py-2.5">
            <LogoInline size="sm" />
            <div className="text-right">
              <h1 className="text-white font-semibold text-sm">Settings</h1>
            </div>
          </div>
        </header>

        <AppContent noTopPadding>

          <div className="settings-content">
            {/* Section Label */}
            <div className="section-label">(WALLETS)</div>

            {/* Smart Wallet Card */}
            {smartWalletAddress && (
              <WalletCard
                title="SMART WALLET"
                subtitle="ERC-4337 Account Abstraction"
                address={smartWalletAddress}
                explorerUrl={`https://basescan.org/address/${smartWalletAddress}`}
                explorerName="BaseScan"
                accentColor="#FF3B30"
                icon={<Wallet className="w-5 h-5 text-[#FF3B30]" />}
                canExport={false}
              />
            )}

            {/* EOA Wallet Card */}
            {eoaAddress && (
              <WalletCard
                title="EMBEDDED WALLET"
                subtitle="Privy EOA Signer"
                address={eoaAddress}
                explorerUrl={`https://basescan.org/address/${eoaAddress}`}
                explorerName="BaseScan"
                accentColor="#FF6B35"
                icon={<Key className="w-5 h-5 text-[#FF6B35]" />}
                canExport={!!embeddedWallet}
                onExport={handleExportEvmWallet}
                isExporting={isExportingEvm}
              />
            )}

            {/* Solana Wallet Card */}
            {solanaAddress && (
              <WalletCard
                title="SOLANA WALLET"
                subtitle="Privy Embedded Solana"
                address={solanaAddress}
                explorerUrl={`https://solscan.io/account/${solanaAddress}`}
                explorerName="Solscan"
                accentColor="#9945FF"
                icon={
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                    <path d="M4.5 18.5L8.5 14.5H19.5L15.5 18.5H4.5Z" fill="#9945FF"/>
                    <path d="M4.5 5.5L8.5 9.5H19.5L15.5 5.5H4.5Z" fill="#9945FF"/>
                    <path d="M4.5 12L8.5 8H19.5L15.5 12H4.5Z" fill="#9945FF"/>
                  </svg>
                }
                canExport={true}
                onExport={handleExportSolanaWallet}
                isExporting={isExportingSolana}
              />
            )}

            {/* Features Section */}
            <div className="section-label" style={{ marginTop: '32px' }}>(FEATURES)</div>

            <div className="features-card">
              <div className="feature-item">
                <div className="feature-icon">
                  <Shield className="w-5 h-5 text-[#FF3B30]" />
                </div>
                <div>
                  <p className="feature-title">Self-Custody</p>
                  <p className="feature-desc">You control your keys</p>
                </div>
              </div>

              <div className="feature-item">
                <div className="feature-icon">
                  <Smartphone className="w-5 h-5 text-[#FF3B30]" />
                </div>
                <div>
                  <p className="feature-title">Passkey Auth</p>
                  <p className="feature-desc">Secured with Face ID / Touch ID</p>
                </div>
              </div>

              <div className="feature-item">
                <div className="feature-icon">
                  <Key className="w-5 h-5 text-[#FF3B30]" />
                </div>
                <div>
                  <p className="feature-title">Exportable Keys</p>
                  <p className="feature-desc">Full access to your private keys</p>
                </div>
              </div>

              <div className="feature-item" style={{ borderBottom: 'none' }}>
                <div className="feature-icon">
                  <Globe className="w-5 h-5 text-[#FF3B30]" />
                </div>
                <div>
                  <p className="feature-title">Multi-Chain</p>
                  <p className="feature-desc">EVM + Solana support</p>
                </div>
              </div>
            </div>

            {/* Sign Out */}
            <button onClick={handleDisconnect} className="signout-btn">
              <LogOut className="w-5 h-5" />
              SIGN OUT
            </button>

            <p className="signout-note">
              Signing out will disconnect your wallet. You can sign back in anytime with your passkey.
            </p>
          </div>
        </AppContent>

        <style jsx global>{`
          .settings-page {
            --brand-red: #FF3B30;
            --off-white: #f0f0f0;
            --tape-grey: rgba(255,255,255,0.2);
            --glass-bg: linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%);
            --glass-border: rgba(255,255,255,0.12);

            min-height: 100vh;
            min-height: 100dvh;
            width: 100%;
            background-color: #050505;
            color: var(--off-white);
            font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
            position: relative;
          }

          .settings-page .grid-background {
            position: fixed;
            inset: 0;
            background-image:
              linear-gradient(var(--tape-grey) 1px, transparent 1px),
              linear-gradient(90deg, var(--tape-grey) 1px, transparent 1px),
              linear-gradient(rgba(255, 59, 48, 0.05) 2px, transparent 2px),
              linear-gradient(90deg, rgba(255, 59, 48, 0.05) 2px, transparent 2px);
            background-size: 50px 50px, 50px 50px, 250px 250px, 250px 250px;
            z-index: 0;
            pointer-events: none;
          }

          .settings-page .crosshair-overlay {
            position: fixed;
            inset: 0;
            background-image:
              radial-gradient(circle at center, var(--brand-red) 2px, transparent 2px),
              linear-gradient(to right, transparent 49%, var(--tape-grey) 49%, var(--tape-grey) 51%, transparent 51%),
              linear-gradient(to bottom, transparent 49%, var(--tape-grey) 49%, var(--tape-grey) 51%, transparent 51%);
            background-size: 100% 100%;
            background-position: center;
            background-repeat: no-repeat;
            opacity: 0.15;
            z-index: 0;
            pointer-events: none;
          }

          .settings-page .loading-container {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
          }

          .settings-page .loading-spinner {
            width: 40px;
            height: 40px;
            border: 2px solid var(--brand-red);
            border-top-color: transparent;
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }

          @keyframes spin {
            to { transform: rotate(360deg); }
          }

          .settings-header {
            margin-bottom: 24px;
            position: relative;
            z-index: 10;
          }

          .settings-title {
            font-size: 28px;
            font-weight: 900;
            letter-spacing: -1px;
            color: var(--off-white);
            text-transform: uppercase;
          }

          .settings-subtitle {
            font-family: monospace;
            font-size: 12px;
            color: rgba(255,255,255,0.5);
            text-transform: uppercase;
            letter-spacing: 1px;
          }

          .settings-content {
            position: relative;
            z-index: 10;
          }

          .section-label {
            font-family: monospace;
            color: var(--off-white);
            margin-bottom: 16px;
            font-weight: 700;
            font-size: 12px;
            letter-spacing: 2px;
            text-transform: uppercase;
          }

          /* Wallet Card */
          .wallet-card {
            background: var(--glass-bg);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid var(--glass-border);
            border-radius: 20px;
            padding: 20px;
            margin-bottom: 16px;
            position: relative;
            overflow: hidden;
          }

          .wallet-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 1px;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
          }

          .wallet-card-header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 16px;
          }

          .wallet-icon {
            width: 44px;
            height: 44px;
            background: rgba(0,0,0,0.5);
            border: 2px solid;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .wallet-title {
            font-size: 14px;
            font-weight: 900;
            color: var(--off-white);
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          .wallet-subtitle {
            font-family: monospace;
            font-size: 10px;
            color: rgba(255,255,255,0.4);
            text-transform: uppercase;
          }

          .wallet-address-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: rgba(0,0,0,0.3);
            border-radius: 12px;
            padding: 12px 16px;
            margin-bottom: 12px;
          }

          .wallet-address {
            font-family: monospace;
            font-size: 13px;
            color: rgba(255,255,255,0.6);
          }

          .copy-btn {
            color: rgba(255,255,255,0.4);
            transition: color 0.2s;
            background: none;
            border: none;
            cursor: pointer;
          }

          .copy-btn:hover {
            color: rgba(255,255,255,0.7);
          }

          .explorer-link {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            transition: opacity 0.2s;
            text-decoration: none;
          }

          .explorer-link:hover {
            opacity: 0.8;
          }

          .export-section {
            margin-top: 16px;
            padding-top: 16px;
            border-top: 1px dashed var(--tape-grey);
          }

          .export-btn {
            width: 100%;
            padding: 12px;
            background: rgba(255,255,255,0.02);
            border: 1px solid;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            transition: background 0.2s;
          }

          .export-btn:hover {
            background: rgba(255,255,255,0.05);
          }

          .export-warning {
            display: flex;
            flex-direction: column;
            gap: 12px;
          }

          .warning-box {
            display: flex;
            align-items: flex-start;
            gap: 8px;
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.2);
            border-radius: 10px;
            padding: 12px;
          }

          .warning-text {
            font-size: 11px;
            color: rgba(248, 113, 113, 0.9);
            line-height: 1.4;
          }

          .warning-buttons {
            display: flex;
            gap: 8px;
          }

          .cancel-btn {
            flex: 1;
            padding: 12px;
            background: rgba(255,255,255,0.05);
            border: none;
            border-radius: 10px;
            color: rgba(255,255,255,0.6);
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.2s;
          }

          .cancel-btn:hover {
            background: rgba(255,255,255,0.08);
          }

          .confirm-btn {
            flex: 1;
            padding: 12px;
            background: #ef4444;
            border: none;
            border-radius: 10px;
            color: white;
            font-size: 12px;
            font-weight: 700;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            transition: background 0.2s;
          }

          .confirm-btn:hover {
            background: #dc2626;
          }

          .confirm-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }

          /* Features Card */
          .features-card {
            background: var(--glass-bg);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid var(--glass-border);
            border-radius: 20px;
            padding: 4px 20px;
            margin-bottom: 24px;
            position: relative;
            overflow: hidden;
          }

          .features-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 1px;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
          }

          .feature-item {
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 16px 0;
            border-bottom: 1px solid rgba(255,255,255,0.06);
          }

          .feature-icon {
            width: 40px;
            height: 40px;
            background: rgba(255,255,255,0.05);
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .feature-title {
            font-size: 14px;
            font-weight: 600;
            color: var(--off-white);
          }

          .feature-desc {
            font-size: 12px;
            color: rgba(255,255,255,0.4);
          }

          /* Sign Out */
          .signout-btn {
            width: 100%;
            padding: 16px;
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.3);
            border-radius: 14px;
            color: #ef4444;
            font-size: 14px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 1px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            transition: background 0.2s;
          }

          .signout-btn:hover {
            background: rgba(239, 68, 68, 0.2);
          }

          .signout-note {
            margin-top: 12px;
            font-size: 11px;
            color: rgba(255,255,255,0.3);
            text-align: center;
            padding: 0 16px;
          }

          /* Mobile Responsive */
          @media (max-width: 768px) {
            .settings-title {
              font-size: 24px;
            }

            .wallet-card {
              padding: 16px;
            }

            .wallet-icon {
              width: 40px;
              height: 40px;
            }

            .wallet-title {
              font-size: 13px;
            }

            .wallet-address {
              font-size: 11px;
            }

            .feature-item {
              padding: 14px 0;
            }

            .feature-icon {
              width: 36px;
              height: 36px;
            }

            .feature-title {
              font-size: 13px;
            }

            .feature-desc {
              font-size: 11px;
            }
          }
        `}</style>
      </div>
    </AppShell>
  )
}
