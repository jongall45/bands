'use client'

import { useState, useEffect } from 'react'
import { usePWA } from '@/hooks/usePWA'
import { Download, X, Share, Plus } from 'lucide-react'

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

    // Check if user has dismissed before (in this session only)
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
    <div className="fixed bottom-28 left-4 right-4 z-[9999] max-w-[400px] mx-auto animate-slide-up">
      <div className="bg-[#1a1a1a] border border-white/[0.15] rounded-2xl p-4 shadow-2xl shadow-black/50">
        <div className="flex items-start gap-3">
          {/* $ Logo */}
          <div className="w-14 h-14 bg-gradient-to-br from-[#ef4444] to-[#dc2626] rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-red-500/30">
            <span className="text-white font-bold text-2xl">$</span>
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-semibold text-base">Install bands</h3>
            <p className="text-white/60 text-sm mt-0.5">
              {isIOS 
                ? 'Add to your home screen for the full app experience'
                : 'Install for quick access'
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

        {isIOS ? (
          /* iOS Instructions */
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3 bg-white/[0.05] rounded-xl p-3">
              <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <Share className="w-4 h-4 text-blue-400" />
              </div>
              <div className="flex-1">
                <p className="text-white text-sm">1. Tap the <span className="font-semibold">Share</span> button below</p>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-white/[0.05] rounded-xl p-3">
              <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center">
                <Plus className="w-4 h-4 text-green-400" />
              </div>
              <div className="flex-1">
                <p className="text-white text-sm">2. Select <span className="font-semibold">"Add to Home Screen"</span></p>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="w-full py-3 bg-white/[0.08] hover:bg-white/[0.12] border border-white/[0.1] rounded-xl text-white text-sm font-medium transition-colors"
            >
              Got it
            </button>
          </div>
        ) : canInstall ? (
          /* Android/Desktop Install Button */
          <button
            onClick={handleInstall}
            className="w-full mt-4 flex items-center justify-center gap-2 py-3 bg-[#ef4444] hover:bg-[#dc2626] rounded-xl text-white text-sm font-semibold transition-colors shadow-lg shadow-red-500/20"
          >
            <Download className="w-4 h-4" />
            Add to Home Screen
          </button>
        ) : (
          <button
            onClick={handleDismiss}
            className="w-full mt-4 py-3 bg-white/[0.08] hover:bg-white/[0.12] border border-white/[0.1] rounded-xl text-white/70 text-sm font-medium transition-colors"
          >
            Maybe later
          </button>
        )}
      </div>

      <style jsx>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  )
}
