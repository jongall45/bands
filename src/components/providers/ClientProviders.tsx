'use client'

import dynamic from 'next/dynamic'

const Providers = dynamic(
  () => import('./Providers').then((mod) => mod.Providers),
  { 
    ssr: false,
    loading: () => (
      <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    ),
  }
)

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>
}

