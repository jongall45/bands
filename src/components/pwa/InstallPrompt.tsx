'use client'

import { useState, useEffect } from 'react'
import { usePWA } from '@/hooks/usePWA'
import { Download, X, Share } from 'lucide-react'

export function InstallPrompt() {
  const { isStandalone, isIOS, canInstall, promptInstall } = usePWA()
  const [showPrompt, setShowPrompt] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Don't show if already installed or dismissed
    if (isStandalone || dismissed) return

    // Check if user has dismissed before
    const hasDismissed = localStorage.getItem('bands_install_dismissed')
    if (hasDismissed) {
      setDismissed(true)
      return
    }

    // Show prompt after a delay
    const timer = setTimeout(() => {
      setShowPrompt(true)
    }, 5000)

    return () => clearTimeout(timer)
  }, [isStandalone, dismissed])

  const handleDismiss = () => {
    setShowPrompt(false)
    setDismissed(true)
    localStorage.setItem('bands_install_dismissed', 'true')
  }

  const handleInstall = async () => {
    if (canInstall) {
      await promptInstall()
    }
    setShowPrompt(false)
  }

  if (!showPrompt || isStandalone) return null

  return (
    <div className="fixed bottom-24 left-4 right-4 z-[100] max-w-[400px] mx-auto animate-slide-up">
      <div className="bg-[#1a1a1a] border border-white/[0.1] rounded-2xl p-4 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 bg-[#ef4444] rounded-xl flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-lg">$</span>
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-semibold">Add bands to Home Screen</h3>
            <p className="text-white/50 text-sm mt-1">
              {isIOS 
                ? 'Tap Share, then "Add to Home Screen"'
                : 'Install for quick access'
              }
            </p>
          </div>

          <button
            onClick={handleDismiss}
            className="text-white/40 hover:text-white/60 p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-2 mt-4">
          {isIOS ? (
            <button
              onClick={handleDismiss}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl text-white/60 text-sm font-medium transition-colors"
            >
              <Share className="w-4 h-4" />
              Got it
            </button>
          ) : canInstall ? (
            <button
              onClick={handleInstall}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#ef4444] hover:bg-[#dc2626] rounded-xl text-white text-sm font-medium transition-colors"
            >
              <Download className="w-4 h-4" />
              Install App
            </button>
          ) : (
            <button
              onClick={handleDismiss}
              className="flex-1 py-2.5 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl text-white/60 text-sm font-medium transition-colors"
            >
              Maybe later
            </button>
          )}
        </div>
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

