'use client'

import { EmbeddedDApp } from '@/components/embed/EmbeddedDApp'

export default function VestPage() {
  return (
    <EmbeddedDApp
      url="https://trade.vestmarkets.com/"
      name="Vest Exchange"
      description="Trade stock perpetuals"
      backHref="/speculate"
    />
  )
}

