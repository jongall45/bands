'use client'

import dynamic from 'next/dynamic'

const Providers = dynamic(
  () => import('./Providers').then((mod) => mod.Providers),
  { 
    ssr: false,
    loading: () => (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-[#D32F2F] border-t-transparent rounded-full animate-spin" />
      </div>
    ),
  }
)

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>
}

