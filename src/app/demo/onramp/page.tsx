'use client'

import { useState } from 'react'
import { CreditCard, Building2, Smartphone, Info, CheckCircle } from 'lucide-react'
import Link from 'next/link'

/**
 * Demo page for CDP review - shows Onramp integration without requiring login
 * This page demonstrates the Coinbase Onramp UI and integration approach
 */
export default function OnrampDemoPage() {
  const [amount, setAmount] = useState('50')
  const PRESET_AMOUNTS = [25, 50, 100, 250]

  const amountNum = parseFloat(amount) || 0
  const estimatedFee = amountNum * 0.02
  const estimatedReceive = amountNum - estimatedFee

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-100 to-gray-200">
      <div className="max-w-[430px] mx-auto px-5 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 text-blue-600 px-4 py-2 rounded-full text-sm font-medium mb-4">
            <Info className="w-4 h-4" />
            CDP Review Demo
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Coinbase Onramp Integration</h1>
          <p className="text-gray-500">This demo shows our Onramp integration for CDP review</p>
        </div>

        {/* Integration Info Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            Integration Details
          </h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Project ID</span>
              <code className="text-gray-900 bg-gray-100 px-2 py-0.5 rounded text-xs">
                7c1b95ba-fd80...
              </code>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Session Token API</span>
              <code className="text-gray-900 bg-gray-100 px-2 py-0.5 rounded text-xs">
                /api/onramp/session
              </code>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Network</span>
              <span className="text-gray-900">Base (USDC)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Auth Method</span>
              <span className="text-gray-900">JWT (ES256)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Rate Limiting</span>
              <span className="text-gray-900">10 req/min</span>
            </div>
          </div>
        </div>

        {/* Mock Onramp UI */}
        <div className="bg-[#111] rounded-2xl p-5 mb-6">
          <h3 className="text-white font-semibold mb-4">Buy USDC</h3>
          
          {/* Amount Selection */}
          <div className="mb-4">
            <p className="text-white/40 text-sm mb-2">Amount (USD)</p>
            <div className="grid grid-cols-4 gap-2 mb-3">
              {PRESET_AMOUNTS.map((preset) => (
                <button
                  key={preset}
                  onClick={() => setAmount(preset.toString())}
                  className={`py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    amount === preset.toString()
                      ? 'bg-[#0052FF] text-white'
                      : 'bg-white/[0.05] text-white/60 hover:bg-white/[0.08]'
                  }`}
                >
                  ${preset}
                </button>
              ))}
            </div>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 text-lg">$</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl pl-10 pr-4 py-3 text-white text-xl font-medium outline-none"
              />
            </div>
          </div>

          {/* Payment Methods */}
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-2 text-white/60">
              <CreditCard className="w-4 h-4" />
              <span className="text-sm">Card</span>
            </div>
            <div className="flex items-center gap-2 text-white/60">
              <Building2 className="w-4 h-4" />
              <span className="text-sm">Bank</span>
            </div>
            <div className="flex items-center gap-2 text-white/60">
              <Smartphone className="w-4 h-4" />
              <span className="text-sm">Apple Pay</span>
            </div>
          </div>

          {/* Estimate */}
          {amountNum > 0 && (
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white/60 text-sm">You'll receive (approx)</span>
                <div className="flex items-center gap-2">
                  <span className="text-white font-semibold">~{estimatedReceive.toFixed(2)}</span>
                  <span className="text-[#0052FF] font-medium">USDC</span>
                </div>
              </div>
              <p className="text-white/30 text-xs">On Base network</p>
            </div>
          )}

          {/* Buy Button */}
          <button
            disabled
            className="w-full py-4 bg-[#0052FF] text-white font-semibold rounded-xl opacity-50 cursor-not-allowed"
          >
            Login Required to Purchase
          </button>

          <p className="text-white/30 text-xs text-center mt-3">
            Powered by Coinbase Onramp
          </p>
        </div>

        {/* API Flow Diagram */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">Integration Flow</h2>
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">1</div>
              <div>
                <p className="text-gray-900 font-medium">User clicks "Buy USDC"</p>
                <p className="text-gray-500 text-xs">Frontend initiates purchase flow</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">2</div>
              <div>
                <p className="text-gray-900 font-medium">Server generates session token</p>
                <p className="text-gray-500 text-xs">POST /api/onramp/session with JWT auth</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">3</div>
              <div>
                <p className="text-gray-900 font-medium">Coinbase widget opens</p>
                <p className="text-gray-500 text-xs">User completes purchase in popup</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">4</div>
              <div>
                <p className="text-gray-900 font-medium">USDC arrives in wallet</p>
                <p className="text-gray-500 text-xs">On Base network (~2 min)</p>
              </div>
            </div>
          </div>
        </div>

        {/* Links */}
        <div className="text-center space-y-3">
          <Link 
            href="/"
            className="block w-full py-3 bg-[#0052FF] text-white font-semibold rounded-xl hover:bg-[#0040CC] transition-colors"
          >
            Try the Full App →
          </Link>
          <p className="text-gray-400 text-xs">
            Login to access the full Onramp experience
          </p>
        </div>
      </div>
    </div>
  )
}

