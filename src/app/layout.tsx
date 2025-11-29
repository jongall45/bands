import type { Metadata } from 'next'
import dynamic from 'next/dynamic'
import './globals.css'

// Dynamic import to avoid SSR issues with Privy/WalletConnect
const Providers = dynamic(
  () => import('@/components/providers/Providers').then((mod) => mod.Providers),
  { ssr: false }
)

export const metadata: Metadata = {
  title: 'bands.cash | Your Money, Your Keys',
  description: 'Self-custodial stablecoin neobank. Send, receive, and manage stablecoins with ease.',
  keywords: ['stablecoin', 'neobank', 'crypto', 'USDC', 'Base', 'self-custodial'],
  authors: [{ name: 'bands.cash' }],
  openGraph: {
    title: 'bands.cash | Your Money, Your Keys',
    description: 'Self-custodial stablecoin neobank',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen mesh-gradient antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
