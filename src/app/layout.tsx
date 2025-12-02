import type { Metadata, Viewport } from 'next'
import { ClientProviders } from '@/components/providers/ClientProviders'
import './globals.css'

export const metadata: Metadata = {
  title: 'bands',
  description: 'The stablecoin neobank for degens. Spend. Save. Speculate.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'bands',
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    title: 'bands',
    description: 'The stablecoin neobank for degens',
    type: 'website',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f4f5' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* PWA Meta Tags */}
        <meta name="application-name" content="bands" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="bands" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        
        {/* Apple Touch Icons */}
        <link rel="apple-touch-icon" href="/icons/icon.svg" />
        
        {/* Favicon */}
        <link rel="icon" type="image/svg+xml" href="/icons/icon.svg" />
      </head>
      <body className="min-h-screen bg-black antialiased overscroll-none">
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  )
}
