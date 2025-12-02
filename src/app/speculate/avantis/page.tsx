'use client'

import { EmbeddedDApp } from '@/components/embed/EmbeddedDApp'

export default function AvantisPage() {
  return (
    <EmbeddedDApp
      url="https://app.avantis.xyz"
      name="Avantis"
      description="Forex & crypto perps"
      backHref="/dashboard"
    />
  )
}

