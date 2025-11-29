import type { Metadata } from 'next'
import { Providers } from '@/components/providers/Providers'
import './globals.css'

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
