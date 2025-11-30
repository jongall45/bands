'use client'

import { useState, useEffect } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { useRouter } from 'next/navigation'
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseUnits, isAddress } from 'viem'
import { base } from 'wagmi/chains'
import { USDC_ADDRESS, USDC_DECIMALS, ERC20_ABI } from '@/lib/wagmi'
import { 
  ExternalLink, ArrowUpRight, TrendingUp, Zap, BarChart3, 
  Copy, Check, Send, RefreshCw, Home, Settings, Wallet, LayoutGrid,
  LogOut
} from 'lucide-react'

export default function SpeculatePage() {
  const { ready, authenticated, logout } = usePrivy()
  const { wallets } = useWallets()
  const router = useRouter()
  const [pigeonWallet, setPigeonWallet] = useState('')
  const [sendAmount, setSendAmount] = useState('')
  const [copied, setCopied] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [showSendModal, setShowSendModal] = useState(false)

  const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy')
  const address = embeddedWallet?.address

  const { writeContract, data: hash, isPending, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (!ready) return
    if (!authenticated) router.push('/')
  }, [ready, authenticated, router])

  useEffect(() => {
    const saved = localStorage.getItem('pigeonWallet')
    if (saved) setPigeonWallet(saved)
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent))
  }, [])

  useEffect(() => {
    if (isSuccess) {
      setShowSendModal(false)
      setSendAmount('')
      reset()
    }
  }, [isSuccess, reset])

  const savePigeonWallet = (address: string) => {
    setPigeonWallet(address)
    localStorage.setItem('pigeonWallet', address)
  }

  const openPlatform = (platform: 'telegram' | 'farcaster' | 'discord') => {
    const urls = {
      telegram: { app: 'tg://resolve?domain=piaborat', web: 'https://t.me/piaborat' },
      farcaster: { app: 'https://warpcast.com/pigeon', web: 'https://warpcast.com/pigeon' },
      discord: { app: 'https://discord.gg/pigeon', web: 'https://discord.gg/pigeon' },
    }
    const url = isMobile ? urls[platform].app : urls[platform].web
    window.open(url, '_blank')
  }

  const handleSendToPigeon = () => {
    if (!pigeonWallet || !sendAmount || !isAddress(pigeonWallet)) return
    
    const amount = parseUnits(sendAmount, USDC_DECIMALS)
    writeContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [pigeonWallet as `0x${string}`, amount],
      chainId: base.id,
    })
  }

  const copyPigeonWallet = () => {
    if (pigeonWallet) {
      navigator.clipboard.writeText(pigeonWallet)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-[#ef4444] animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black pb-24">
      <div className="max-w-[430px] mx-auto">
        
        {/* Header */}
        <header className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div>
            <h1 className="text-white font-semibold text-lg">Speculate</h1>
            <p className="text-white/40 text-sm">Trade with AI via Pigeon</p>
          </div>
          <button
            onClick={logout}
            className="p-2 text-white/40 hover:text-white transition-colors"
          >
            <LogOut className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </header>

        <div className="p-5 space-y-5">
          
          {/* Hero Card */}
          <div className="bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-3xl p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 bg-gradient-to-br from-purple-500 to-blue-500 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(139,92,246,0.3)]">
                <span className="text-3xl">🐦</span>
              </div>
              <div>
                <h2 className="text-white font-bold text-xl">Pigeon</h2>
                <p className="text-white/50 text-sm">Your AI quant for infinite markets</p>
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-white/[0.05] rounded-2xl p-3 text-center">
                <TrendingUp className="w-5 h-5 text-green-400 mx-auto mb-1" />
                <p className="text-white/70 text-xs">Perps</p>
              </div>
              <div className="bg-white/[0.05] rounded-2xl p-3 text-center">
                <Zap className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
                <p className="text-white/70 text-xs">Swaps</p>
              </div>
              <div className="bg-white/[0.05] rounded-2xl p-3 text-center">
                <BarChart3 className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                <p className="text-white/70 text-xs">Predictions</p>
              </div>
            </div>

            <p className="text-white/60 text-sm mb-4">
              Trade crypto, stocks, perps & predictions through natural language. Just tell Pigeon what you want.
            </p>

            <div className="text-white/40 text-xs space-y-1 font-mono">
              <p>"Swap 100 USDC to ETH on Base"</p>
              <p>"Long BTC with 5x leverage"</p>
              <p>"Buy $50 YES on Bitcoin 100k"</p>
            </div>
          </div>

          {/* Platform Buttons */}
          <div className="space-y-3">
            <p className="text-white/50 text-sm font-medium">Open Pigeon in:</p>
            
            <button
              onClick={() => openPlatform('telegram')}
              className="w-full py-4 bg-[#0088cc] hover:bg-[#0077b5] text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-3"
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
              </svg>
              Telegram
              <ArrowUpRight className="w-4 h-4 ml-auto opacity-50" />
            </button>

            <button
              onClick={() => openPlatform('farcaster')}
              className="w-full py-4 bg-[#855DCD] hover:bg-[#7a51c0] text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-3"
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.24 2H5.76A3.76 3.76 0 002 5.76v12.48A3.76 3.76 0 005.76 22h12.48A3.76 3.76 0 0022 18.24V5.76A3.76 3.76 0 0018.24 2zM7 7h10v2H7V7zm0 4h10v2H7v-2zm0 4h7v2H7v-2z"/>
              </svg>
              Farcaster
              <ArrowUpRight className="w-4 h-4 ml-auto opacity-50" />
            </button>

            <a
              href="https://pigeon.trade"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-4 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-3"
            >
              <ExternalLink className="w-5 h-5" />
              pigeon.trade
              <ArrowUpRight className="w-4 h-4 ml-auto opacity-50" />
            </a>
          </div>

          {/* Quick Fund Transfer */}
          <div className="bg-[#111111] border border-white/[0.06] rounded-3xl p-5">
            <h3 className="text-white font-semibold mb-2">Quick Fund Transfer</h3>
            <p className="text-white/40 text-sm mb-4">
              Save your Pigeon wallet address to quickly send USDC for trading.
              Ask Pigeon: "what's my wallet address?"
            </p>
            
            <div className="relative mb-3">
              <input
                type="text"
                value={pigeonWallet}
                onChange={(e) => savePigeonWallet(e.target.value)}
                placeholder="Paste your Pigeon wallet address"
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-2xl px-4 py-3 pr-12 text-white text-sm font-mono placeholder:text-white/30 focus:outline-none focus:border-white/20"
              />
              {pigeonWallet && (
                <button
                  onClick={copyPigeonWallet}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-white/40 hover:text-white/70 transition-colors"
                >
                  {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                </button>
              )}
            </div>

            {pigeonWallet && isAddress(pigeonWallet) ? (
              <button
                onClick={() => setShowSendModal(true)}
                className="w-full py-3 bg-[#ef4444] hover:bg-[#dc2626] text-white font-semibold rounded-2xl transition-colors flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(239,68,68,0.3)]"
              >
                <Send className="w-4 h-4" />
                Send USDC to Pigeon
              </button>
            ) : (
              <button
                disabled
                className="w-full py-3 bg-white/10 text-white/30 font-semibold rounded-2xl cursor-not-allowed"
              >
                Enter valid address to send
              </button>
            )}
          </div>

        </div>
      </div>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
        <div className="flex items-center gap-1 p-2 bg-[#1a1a1a]/90 backdrop-blur-xl border border-white/[0.08] rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          <NavButton icon={Home} href="/dashboard" />
          <NavButton icon={Send} href="/dashboard" />
          <NavButton icon={TrendingUp} active />
          <NavButton icon={Wallet} href="/dashboard" />
          <NavButton icon={Settings} href="/dashboard" />
        </div>
      </nav>

      {/* Send Modal */}
      {showSendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !isPending && !isConfirming && setShowSendModal(false)} />
          
          <div className="relative w-full max-w-md bg-[#111111]/95 backdrop-blur-xl border border-white/[0.08] rounded-3xl shadow-[0_24px_64px_rgba(0,0,0,0.5)] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.06]">
              <h2 className="text-lg font-semibold text-white">Send to Pigeon</h2>
              <button
                onClick={() => !isPending && !isConfirming && setShowSendModal(false)}
                className="p-2 rounded-full text-white/40 hover:text-white hover:bg-white/[0.05] transition-colors"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6 space-y-5">
              <div className="bg-white/[0.02] rounded-2xl border border-white/[0.04] p-4">
                <p className="text-white/40 text-sm mb-1">Sending to:</p>
                <p className="text-white font-mono text-sm break-all">{pigeonWallet}</p>
              </div>

              <div>
                <label className="text-white/40 text-sm mb-2 block">Amount (USDC)</label>
                <div className="bg-white/[0.02] rounded-2xl border border-white/[0.04] p-5">
                  <div className="flex items-center gap-4">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={sendAmount}
                      onChange={(e) => setSendAmount(e.target.value)}
                      placeholder="0.00"
                      disabled={isPending || isConfirming}
                      className="flex-1 bg-transparent text-4xl font-semibold text-white placeholder:text-white/20 focus:outline-none"
                    />
                    <div className="flex items-center gap-2 bg-white/[0.06] rounded-full px-4 py-2">
                      <div className="w-6 h-6 rounded-full bg-[#2775ca] flex items-center justify-center">
                        <span className="text-white text-xs font-bold">$</span>
                      </div>
                      <span className="text-white font-medium">USDC</span>
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={handleSendToPigeon}
                disabled={isPending || isConfirming || !sendAmount || parseFloat(sendAmount) <= 0}
                className="w-full py-4 bg-[#ef4444] hover:bg-[#dc2626] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-2xl transition-all flex items-center justify-center gap-2"
              >
                {isPending || isConfirming ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    {isPending ? 'Confirm in wallet...' : 'Sending...'}
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Send to Pigeon
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function NavButton({ icon: Icon, active = false, href, onClick }: { icon: React.ElementType; active?: boolean; href?: string; onClick?: () => void }) {
  const router = useRouter()
  
  const handleClick = () => {
    if (onClick) onClick()
    else if (href) router.push(href)
  }

  return (
    <button 
      onClick={handleClick}
      className={`relative p-3 rounded-full transition-all ${active ? 'bg-white/[0.1] text-white' : 'text-white/40 hover:text-white/70 hover:bg-white/[0.05]'}`}
    >
      <Icon className="w-5 h-5" strokeWidth={active ? 2 : 1.5} />
      {active && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-white rounded-full" />}
    </button>
  )
}

