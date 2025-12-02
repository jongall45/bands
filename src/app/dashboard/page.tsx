'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount, useDisconnect, useSendTransaction, useWaitForTransactionReceipt } from 'wagmi'
import { useReadContract } from 'wagmi'
import { formatUnits, parseUnits, isAddress, encodeFunctionData } from 'viem'
import { base } from 'wagmi/chains'
import { USDC_ADDRESS, USDC_DECIMALS, ERC20_ABI } from '@/lib/wagmi'
import { 
  ArrowUpRight, ArrowDownLeft, Copy, Check, LogOut, 
  Send, RefreshCw, ExternalLink, ShoppingCart, QrCode
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { CardInner } from '@/components/ui/Card'
import { BottomNav } from '@/components/ui/BottomNav'
import { LogoInline } from '@/components/ui/Logo'
import { TransactionList } from '@/components/ui/TransactionList'

export default function Dashboard() {
  const { address, isConnected } = useAccount()
  const { disconnect } = useDisconnect()
  const router = useRouter()
  const [copied, setCopied] = useState(false)
  const [showSend, setShowSend] = useState(false)
  const [showReceive, setShowReceive] = useState(false)
  const [sendTo, setSendTo] = useState('')
  const [sendAmount, setSendAmount] = useState('')
  const [addressError, setAddressError] = useState('')

  const { sendTransaction, data: txHash, isPending: isSending } = useSendTransaction()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  const { data: usdcBalance, refetch: refetchBalance, isLoading: balanceLoading } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: base.id,
    query: {
      enabled: !!address,
      refetchInterval: 10000,
    },
  })

  useEffect(() => {
    if (!isConnected) router.push('/')
  }, [isConnected, router])

  useEffect(() => {
    if (isSuccess) {
      setShowSend(false)
      setSendTo('')
      setSendAmount('')
      refetchBalance()
    }
  }, [isSuccess, refetchBalance])

  const formattedBalance = usdcBalance 
    ? parseFloat(formatUnits(usdcBalance, USDC_DECIMALS)).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : '0.00'

  const numericBalance = usdcBalance 
    ? parseFloat(formatUnits(usdcBalance, USDC_DECIMALS))
    : 0

  const copyAddress = useCallback(() => {
    if (address) {
      navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [address])

  const validateAddress = (addr: string) => {
    if (!addr) {
      setAddressError('')
      return
    }
    if (!isAddress(addr)) {
      setAddressError('Invalid address format')
    } else {
      setAddressError('')
    }
  }

  const handleSend = async () => {
    if (!sendTo || !sendAmount || addressError || !address) return
    if (!isAddress(sendTo)) {
      setAddressError('Invalid address format')
      return
    }
    
    const amount = parseUnits(sendAmount, USDC_DECIMALS)
    
    // Encode the transfer call
    const data = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [sendTo as `0x${string}`, amount],
    })

    sendTransaction({
      to: USDC_ADDRESS,
      data,
    })
  }

  const setMaxAmount = () => {
    setSendAmount(numericBalance.toString())
  }

  if (!isConnected) {
    return (
      <div className="dashboard-page">
        <div className="noise-overlay" />
        <div className="aura aura-1" />
        <div className="aura aura-2" />
        <div className="min-h-screen flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <RefreshCw className="w-8 h-8 text-[#ef4444] animate-spin" />
            <p className="text-gray-500">Loading your wallet...</p>
          </div>
        </div>
        <style jsx global>{dashboardStyles}</style>
      </div>
    )
  }

  return (
    <div className="dashboard-page">
      {/* Grain Texture Overlay */}
      <div className="noise-overlay" />

      {/* Atmospheric Red Auras */}
      <div className="aura aura-1" />
      <div className="aura aura-2" />
      <div className="aura aura-3" />

      {/* Header */}
      <header className="dashboard-header">
        <LogoInline size="sm" />
        <button
          onClick={() => disconnect()}
          className="logout-btn"
          title="Sign out"
        >
          <LogOut className="w-5 h-5" strokeWidth={1.5} />
        </button>
      </header>

      {/* Main Content */}
      <main className="dashboard-main">
        
        {/* Balance Card */}
        <div className="card">
          
          {/* Balance Display */}
          <div className="text-center py-6">
            <p className="text-gray-400 text-sm mb-1">Total Balance</p>
            {balanceLoading ? (
              <div className="h-12 w-40 mx-auto bg-gray-700/30 rounded-xl animate-pulse" />
            ) : (
              <h1 className="text-5xl font-bold text-white tracking-tight font-mono">
                ${formattedBalance}
              </h1>
            )}
            <p className="text-[#ef4444] text-sm mt-2 font-medium">USDC on Base</p>
            
            {/* Refresh button */}
            <button 
              onClick={() => refetchBalance()}
              className="mt-3 p-2 text-gray-500 hover:text-gray-300 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${balanceLoading ? 'animate-spin' : ''}`} strokeWidth={2} />
            </button>
          </div>

          {/* Wallet Address Row */}
          <div className="flex items-center justify-between py-3 px-4 bg-white/[0.02] rounded-2xl mb-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-[#ef4444] rounded" />
              <span className="text-gray-400 text-sm font-mono">
                {address?.slice(0, 6)}...{address?.slice(-4)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <a 
                href={`https://basescan.org/address/${address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-400 text-xs hover:text-gray-300 transition-colors flex items-center gap-1"
              >
                BaseScan
                <ExternalLink className="w-3 h-3" />
              </a>
              <button 
                onClick={copyAddress}
                className="p-1.5 text-gray-400 hover:text-gray-300 transition-colors"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-[#22c55e]" />
                ) : (
                  <Copy className="w-4 h-4" strokeWidth={1.5} />
                )}
              </button>
            </div>
          </div>

          {/* Action Buttons Row */}
          <div className="grid grid-cols-3 gap-2">
            <button 
              onClick={() => setShowSend(true)}
              className="action-btn"
            >
              <ArrowUpRight className="w-5 h-5 text-gray-300" strokeWidth={1.5} />
              <span className="text-gray-300 text-sm">Send</span>
            </button>
            <button 
              onClick={() => setShowReceive(true)}
              className="action-btn"
            >
              <ArrowDownLeft className="w-5 h-5 text-gray-300" strokeWidth={1.5} />
              <span className="text-gray-300 text-sm">Receive</span>
            </button>
            <button 
              className="action-btn"
              onClick={() => window.open('https://app.moonpay.com/buy', '_blank')}
            >
              <ShoppingCart className="w-5 h-5 text-gray-300" strokeWidth={1.5} />
              <span className="text-gray-300 text-sm">Buy</span>
            </button>
          </div>
        </div>

        {/* Recent Activity Card */}
        <div className="card mt-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold">Recent Activity</h2>
            <a 
              href={`https://basescan.org/address/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/40 text-xs hover:text-white/60 transition-colors flex items-center gap-1"
            >
              View all
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          
          <TransactionList address={address} limit={5} />
        </div>

      </main>

      {/* Bottom Navigation */}
      <BottomNav />

      {/* Send Modal */}
      <Modal isOpen={showSend} onClose={() => !isSending && !isConfirming && setShowSend(false)} title="Send USDC">
        <div className="space-y-5">
          <div>
            <label className="block text-white/40 text-sm mb-2 font-medium">Recipient Address</label>
            <div className={`bg-white/[0.03] rounded-2xl border transition-all ${addressError ? 'border-red-500/50' : 'border-white/[0.06] focus-within:border-white/20'}`}>
              <input
                type="text"
                value={sendTo}
                onChange={(e) => {
                  setSendTo(e.target.value)
                  validateAddress(e.target.value)
                }}
                placeholder="0x..."
                disabled={isSending || isConfirming}
                className="w-full bg-transparent px-5 py-4 text-white font-mono text-sm placeholder:text-white/30 focus:outline-none"
              />
            </div>
            {addressError && <p className="mt-2 text-sm text-red-400">{addressError}</p>}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-white/40 text-sm font-medium">Amount</label>
              <button onClick={setMaxAmount} className="text-xs text-[#ef4444] hover:text-[#dc2626] font-semibold">MAX</button>
            </div>
            <CardInner className="p-5">
              <div className="flex items-center gap-4">
                <input
                  type="text"
                  inputMode="decimal"
                  value={sendAmount}
                  onChange={(e) => setSendAmount(e.target.value)}
                  placeholder="0.00"
                  disabled={isSending || isConfirming}
                  className="flex-1 bg-transparent text-4xl font-semibold text-white placeholder:text-white/20 focus:outline-none"
                />
                <div className="flex items-center gap-2 bg-white/[0.06] rounded-full px-4 py-2">
                  <div className="w-6 h-6 rounded-full bg-[#2775ca] flex items-center justify-center">
                    <span className="text-white text-xs font-bold">$</span>
                  </div>
                  <span className="text-white font-medium">USDC</span>
                </div>
              </div>
              <p className="text-white/40 text-sm mt-3">Balance: <span className="text-white/60">${formattedBalance}</span></p>
            </CardInner>
          </div>

          <button
            onClick={handleSend}
            disabled={isSending || isConfirming || !sendTo || !sendAmount || !!addressError || parseFloat(sendAmount) > numericBalance}
            className="w-full py-4 bg-[#ef4444] hover:bg-[#dc2626] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-2xl transition-all flex items-center justify-center gap-2"
          >
            {isSending || isConfirming ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                {isSending ? 'Confirm in wallet...' : 'Sending...'}
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send USDC
              </>
            )}
          </button>

          <p className="text-white/30 text-xs text-center">
            Gas paid in USDC • No ETH needed
          </p>

          {parseFloat(sendAmount) > numericBalance && sendAmount && (
            <p className="text-red-400 text-sm text-center">Insufficient balance</p>
          )}
        </div>
      </Modal>

      {/* Receive Modal */}
      <Modal isOpen={showReceive} onClose={() => setShowReceive(false)} title="Receive USDC">
        <div className="text-center">
          <div className="w-48 h-48 mx-auto mb-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-center">
            <div className="w-32 h-32 bg-white rounded-xl flex items-center justify-center">
              <QrCode className="w-16 h-16 text-[#111]" />
            </div>
          </div>

          <p className="text-white/40 text-sm mb-4">Share your address to receive USDC on Base</p>

          <div className="bg-white/[0.02] rounded-2xl border border-white/[0.04] p-4 mb-4">
            <p className="font-mono text-xs text-white/60 break-all">{address}</p>
          </div>

          <button
            onClick={() => { copyAddress(); setShowReceive(false); }}
            className="w-full py-4 bg-[#ef4444] hover:bg-[#dc2626] text-white font-semibold rounded-2xl transition-all flex items-center justify-center gap-2"
          >
            <Copy className="w-4 h-4" />
            Copy Address
          </button>

          <p className="text-white/30 text-xs mt-4">Only send USDC on the <span className="text-[#ef4444]">Base</span> network</p>
        </div>
      </Modal>

      <style jsx global>{dashboardStyles}</style>
    </div>
  )
}

const dashboardStyles = `
  .dashboard-page {
    min-height: 100vh;
    width: 100%;
    background: #F4F4F5;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif;
    overflow-x: hidden;
    position: relative;
  }

  /* Grain texture like homepage */
  .dashboard-page .noise-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 10000;
    opacity: 0.08;
    mix-blend-mode: overlay;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
  }

  /* Red auras like homepage */
  .dashboard-page .aura {
    position: fixed;
    border-radius: 50%;
    z-index: 0;
    animation: aura-float 20s ease-in-out infinite;
  }

  .dashboard-page .aura-1 {
    width: 800px;
    height: 800px;
    top: -250px;
    left: -200px;
    background: #FF3B30;
    filter: blur(150px);
    opacity: 0.5;
  }

  .dashboard-page .aura-2 {
    width: 700px;
    height: 700px;
    bottom: -200px;
    right: -150px;
    background: #D70015;
    filter: blur(140px);
    opacity: 0.45;
    animation-delay: 7s;
  }

  .dashboard-page .aura-3 {
    width: 400px;
    height: 400px;
    top: 40%;
    right: 20%;
    background: #FF6B35;
    filter: blur(120px);
    opacity: 0.3;
    animation-delay: 14s;
  }

  @keyframes aura-float {
    0%, 100% { transform: translate(0, 0) scale(1); }
    33% { transform: translate(50px, -40px) scale(1.05); }
    66% { transform: translate(-30px, 40px) scale(0.95); }
  }

  /* Header */
  .dashboard-page .dashboard-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    max-width: 430px;
    margin: 0 auto;
    width: 100%;
    position: relative;
    z-index: 10;
  }

  .dashboard-page .logout-btn {
    padding: 8px;
    color: #6B7280;
    transition: color 0.2s;
    background: none;
    border: none;
    cursor: pointer;
  }

  .dashboard-page .logout-btn:hover {
    color: #374151;
  }

  /* Main Content */
  .dashboard-page .dashboard-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 0 16px 96px;
    max-width: 430px;
    margin: 0 auto;
    width: 100%;
    position: relative;
    z-index: 1;
  }

  /* Cards - Dark with red gradient fade from top-left */
  .dashboard-page .card {
    background: #111111;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 24px;
    padding: 24px;
    position: relative;
    overflow: hidden;
  }

  .dashboard-page .card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: radial-gradient(
      ellipse at 0% 0%,
      rgba(255, 59, 48, 0.25) 0%,
      rgba(255, 59, 48, 0.1) 30%,
      rgba(255, 59, 48, 0.03) 50%,
      transparent 70%
    );
    pointer-events: none;
    z-index: 0;
  }

  .dashboard-page .card > * {
    position: relative;
    z-index: 1;
  }

  /* Action Buttons */
  .dashboard-page .action-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 16px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 16px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .dashboard-page .action-btn:hover {
    background: rgba(255, 255, 255, 0.06);
  }
`
