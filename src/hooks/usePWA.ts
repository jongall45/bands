'use client'

import { useState, useEffect } from 'react'

interface PWAState {
  isStandalone: boolean
  isIOS: boolean
  isAndroid: boolean
  canInstall: boolean
  installPrompt: BeforeInstallPromptEvent | null
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function usePWA() {
  const [state, setState] = useState<PWAState>({
    isStandalone: false,
    isIOS: false,
    isAndroid: false,
    canInstall: false,
    installPrompt: null,
  })

  useEffect(() => {
    // Check if running as standalone PWA
    const isStandalone = 
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://')

    // Detect platform
    const userAgent = window.navigator.userAgent.toLowerCase()
    const isIOS = /iphone|ipad|ipod/.test(userAgent)
    const isAndroid = /android/.test(userAgent)

    setState(prev => ({
      ...prev,
      isStandalone,
      isIOS,
      isAndroid,
    }))

    // Listen for install prompt (Chrome/Android)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setState(prev => ({
        ...prev,
        canInstall: true,
        installPrompt: e as BeforeInstallPromptEvent,
      }))
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [])

  const promptInstall = async () => {
    if (state.installPrompt) {
      state.installPrompt.prompt()
      const result = await state.installPrompt.userChoice
      if (result.outcome === 'accepted') {
        setState(prev => ({ ...prev, canInstall: false, installPrompt: null }))
      }
    }
  }

  return { ...state, promptInstall }
}

