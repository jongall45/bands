'use client'

import { useState, useEffect } from 'react'
import { usePWA } from '@/hooks/usePWA'
import { Download, X, Share, Smartphone } from 'lucide-react'

export function InstallPrompt() {
  const { isStandalone, isIOS, canInstall, promptInstall } = usePWA()
  const [showPrompt, setShowPrompt] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    
    // Don't show if already installed as PWA
    if (isStandalone) {
      console.log('[PWA] Running in standalone mode')
      return
    }

    // Check if user has dismissed before (in this session only for testing)
    const hasDismissed = sessionStorage.getItem('bands_install_prompt_dismissed')
    if (hasDismissed) {
      return
    }

    // Show prompt after 2 seconds
    const timer = setTimeout(() => {
      console.log('[PWA] Showing install prompt')
      setShowPrompt(true)
    }, 2000)

    return () => clearTimeout(timer)
  }, [isStandalone])

  const handleDismiss = () => {
    setShowPrompt(false)
    sessionStorage.setItem('bands_install_prompt_dismissed', 'true')
  }

  const handleInstall = async () => {
    if (canInstall) {
      await promptInstall()
    }
    setShowPrompt(false)
  }

  // Don't render on server
  if (!mounted) return null
  
  // Don't show if already in standalone mode
  if (isStandalone) return null

  if (!showPrompt) return null

  return (
    <div className="fixed bottom-28 left-4 right-4 z-[9999] max-w-[400px] mx-auto">
      <div className="bg-[#1a1a1a] border border-white/[0.15] rounded-2xl p-4 shadow-2xl shadow-black/50">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-[#ef4444] to-[#dc2626] rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-red-500/20">
            <span className="text-white font-bold text-xl">$</span>
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-semibold text-base">Install bands App</h3>
            <p className="text-white/60 text-sm mt-0.5">
              {isIOS 
                ? 'Tap Share → "Add to Home Screen"'
                : 'Add to your home screen for the best experience'
              }
            </p>
          </div>

          <button
            onClick={handleDismiss}
            className="text-white/40 hover:text-white/60 p-1 -mt-1 -mr-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-2 mt-4">
          {isIOS ? (
            <>
              <button
                onClick={handleDismiss}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl text-white/70 text-sm font-medium transition-colors"
              >
                <Share className="w-4 h-4" />
                Show me how
              </button>
            </>
          ) : canInstall ? (
            <button
              onClick={handleInstall}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#ef4444] hover:bg-[#dc2626] rounded-xl text-white text-sm font-semibold transition-colors shadow-lg shadow-red-500/20"
            >
              <Download className="w-4 h-4" />
              Install App
            </button>
          ) : (
            <button
              onClick={handleDismiss}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl text-white/70 text-sm font-medium transition-colors"
            >
              <Smartphone className="w-4 h-4" />
              Maybe later
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
