import type { Metadata, Viewport } from 'next'
import { ClientProviders } from '@/components/providers/ClientProviders'
import './globals.css'

export const metadata: Metadata = {
  title: 'bands',
  description: 'Stablecoin Neobank for Degens',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'bands',
  },
  openGraph: {
    title: 'bands',
    description: 'Stablecoin Neobank for Degens',
    type: 'website',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#000000',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="min-h-screen bg-black antialiased">
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  )
}
