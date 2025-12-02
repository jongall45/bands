'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, ArrowRight } from 'lucide-react'
import Link from 'next/link'

export default function FundSuccessPage() {
  const router = useRouter()

  // Auto-redirect after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      router.push('/dashboard')
    }, 5000)

    return () => clearTimeout(timer)
  }, [router])

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
          <CheckCircle className="w-10 h-10 text-green-400" />
        </div>
        
        <h1 className="text-white text-2xl font-bold mb-2">Purchase Complete!</h1>
        
        <p className="text-white/40 mb-6">
          Your USDC will arrive in your wallet shortly. This usually takes less than a minute.
        </p>
        
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#ef4444] hover:bg-[#dc2626] text-white font-semibold rounded-xl transition-colors"
        >
          Back to Dashboard
          <ArrowRight className="w-4 h-4" />
        </Link>
        
        <p className="text-white/20 text-xs mt-6">
          Redirecting automatically in 5 seconds...
        </p>
      </div>
    </div>
  )
}

