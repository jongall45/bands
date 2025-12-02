'use client'

import { EmbeddedDApp } from '@/components/embed/EmbeddedDApp'

export default function OstiumPage() {
  return (
    <EmbeddedDApp
      url="https://app.ostium.io/trade"
      name="Ostium"
      description="Forex & RWA perps on Arbitrum"
      backHref="/speculate"
    />
  )
}
