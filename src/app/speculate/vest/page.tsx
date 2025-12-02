'use client'

import { EmbeddedDApp } from '@/components/embed/EmbeddedDApp'

export default function VestPage() {
  return (
    <EmbeddedDApp
      url="https://app.vest.exchange"
      name="Vest Exchange"
      description="Trade stock perpetuals"
      backHref="/dashboard"
    />
  )
}

