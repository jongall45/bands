'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount } from 'wagmi'
import { ConnectButton } from '@/components/auth/ConnectButton'
import { InstallPrompt } from '@/components/pwa/InstallPrompt'
import { LogoInline } from '@/components/ui/Logo'
import { Fingerprint, Shield, Zap, Globe } from 'lucide-react'

export default function Home() {
  const { isConnected, address } = useAccount()
  const router = useRouter()

  // Redirect to dashboard when connected
  useEffect(() => {
    if (isConnected && address) {
      console.log('Landing page: User connected, redirecting to dashboard')
      router.replace('/dashboard')
    }
  }, [isConnected, address, router])

  return (
    <div className="landing-page">
      {/* Grain Texture Overlay */}
      <div className="noise-overlay" />

      {/* Lava Lamp Blobs */}
      <div className="lava-container">
        <div className="lava lava-1" />
        <div className="lava lava-2" />
        <div className="lava lava-3" />
        <div className="lava lava-4" />
        <div className="lava lava-5" />
      </div>

      {/* Navigation - Clean, just logo and connect */}
      <header className="navbar">
        <LogoInline size="md" />
        <ConnectButton />
      </header>

      {/* Hero Section */}
      <main className="hero">
        <div className="hero-content">
          {/* Status Pill */}
          <div className="status-pill">
            <span className="status-dot" />
            Protocol Live
          </div>
          
          <h1 className="hero-title">
            Spend. Save.<br />
            <span className="text-gradient">Speculate.</span>
          </h1>
          
          <p className="subtitle">
            The stablecoin neobank for degens.
          </p>
          
          <div className="cta-group">
            <ConnectButton variant="large" />
          </div>

          {/* Features Grid */}
          <div className="features-grid">
            <div className="feature-card">
              <Fingerprint className="w-6 h-6 text-[#ef4444]" />
              <h3>Passkey Login</h3>
              <p>Face ID or Touch ID</p>
            </div>
            <div className="feature-card">
              <Shield className="w-6 h-6 text-[#ef4444]" />
              <h3>Self-Custody</h3>
              <p>You own your keys</p>
            </div>
            <div className="feature-card">
              <Zap className="w-6 h-6 text-[#ef4444]" />
              <h3>USDC Gas</h3>
              <p>No ETH needed</p>
            </div>
            <div className="feature-card">
              <Globe className="w-6 h-6 text-[#ef4444]" />
              <h3>Use Anywhere</h3>
              <p>Connect to any dApp</p>
            </div>
        </div>
        </div>
      </main>

      {/* PWA Install Prompt */}
      <InstallPrompt />

      <style jsx global>{`
        .landing-page {
          --bg-base: #F4F4F5;
          --text-main: #1D1D1F;
          --text-muted: #86868B;
          --bands-red: #FF3B30;
          --bands-dark-red: #D70015;
          
          min-height: 100vh;
          min-height: 100dvh;
          width: 100%;
          background: var(--bg-base);
          color: var(--text-main);
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif;
          overflow-x: hidden;
          position: relative;
        }

        /* === GRAIN TEXTURE === */
        .landing-page .noise-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 10000;
          opacity: 0.08;
          mix-blend-mode: overlay;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
        }

        /* === LAVA LAMP EFFECT === */
        .landing-page .lava-container {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
          z-index: 0;
        }

        .landing-page .lava {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          mix-blend-mode: normal;
        }

        .landing-page .lava-1 {
          width: 600px;
          height: 600px;
          background: radial-gradient(circle, #FF3B30 0%, #FF6B6B 50%, transparent 70%);
          top: -10%;
          left: -10%;
          animation: lava1 25s ease-in-out infinite;
        }

        .landing-page .lava-2 {
          width: 500px;
          height: 500px;
          background: radial-gradient(circle, #D70015 0%, #FF4444 50%, transparent 70%);
          bottom: -5%;
          right: -5%;
          animation: lava2 30s ease-in-out infinite;
        }

        .landing-page .lava-3 {
          width: 400px;
          height: 400px;
          background: radial-gradient(circle, #FF6B35 0%, #FFAA88 50%, transparent 70%);
          top: 30%;
          right: 10%;
          animation: lava3 20s ease-in-out infinite;
        }

        .landing-page .lava-4 {
          width: 350px;
          height: 350px;
          background: radial-gradient(circle, #FF8888 0%, #FFB4B4 50%, transparent 70%);
          top: 60%;
          left: 5%;
          animation: lava4 22s ease-in-out infinite;
        }

        .landing-page .lava-5 {
          width: 300px;
          height: 300px;
          background: radial-gradient(circle, #FFCCCC 0%, #FFE5E5 50%, transparent 70%);
          top: 10%;
          right: 30%;
          animation: lava5 18s ease-in-out infinite;
        }

        @keyframes lava1 {
          0%, 100% {
            transform: translate(0, 0) scale(1) rotate(0deg);
            border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%;
          }
          25% {
            transform: translate(100px, 50px) scale(1.1) rotate(90deg);
            border-radius: 30% 60% 70% 40% / 50% 60% 30% 60%;
          }
          50% {
            transform: translate(50px, 100px) scale(0.9) rotate(180deg);
            border-radius: 50% 60% 30% 60% / 30% 70% 40% 50%;
          }
          75% {
            transform: translate(-50px, 50px) scale(1.05) rotate(270deg);
            border-radius: 40% 60% 60% 40% / 70% 30% 50% 60%;
          }
        }

        @keyframes lava2 {
          0%, 100% {
            transform: translate(0, 0) scale(1) rotate(0deg);
            border-radius: 40% 60% 60% 40% / 70% 30% 50% 60%;
          }
          25% {
            transform: translate(-80px, -60px) scale(1.15) rotate(-90deg);
            border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%;
          }
          50% {
            transform: translate(-40px, -100px) scale(0.95) rotate(-180deg);
            border-radius: 50% 60% 30% 60% / 30% 70% 40% 50%;
          }
          75% {
            transform: translate(40px, -40px) scale(1.1) rotate(-270deg);
            border-radius: 30% 60% 70% 40% / 50% 60% 30% 60%;
          }
        }

        @keyframes lava3 {
          0%, 100% {
            transform: translate(0, 0) scale(1);
            border-radius: 50% 60% 30% 60% / 30% 70% 40% 50%;
          }
          33% {
            transform: translate(-100px, 80px) scale(1.2);
            border-radius: 60% 40% 70% 30% / 40% 60% 50% 70%;
          }
          66% {
            transform: translate(-60px, -60px) scale(0.85);
            border-radius: 40% 70% 50% 60% / 70% 40% 60% 30%;
          }
        }

        @keyframes lava4 {
          0%, 100% {
            transform: translate(0, 0) scale(1) rotate(0deg);
            border-radius: 70% 30% 50% 60% / 40% 70% 30% 60%;
          }
          50% {
            transform: translate(120px, -80px) scale(1.1) rotate(180deg);
            border-radius: 30% 70% 60% 40% / 60% 30% 70% 40%;
          }
        }

        @keyframes lava5 {
          0%, 100% {
            transform: translate(0, 0) scale(1);
            border-radius: 30% 70% 70% 30% / 30% 30% 70% 70%;
            opacity: 0.6;
          }
          33% {
            transform: translate(60px, 100px) scale(1.3);
            border-radius: 70% 30% 30% 70% / 70% 70% 30% 30%;
            opacity: 0.8;
          }
          66% {
            transform: translate(-80px, 60px) scale(0.9);
            border-radius: 50% 50% 50% 50%;
            opacity: 0.5;
          }
        }

        /* === NAVIGATION WITH SAFE AREA === */
        .landing-page .navbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          padding-top: calc(16px + env(safe-area-inset-top, 0px));
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 1000;
          background: rgba(244, 244, 245, 0.85);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
        }

        /* === HERO === */
        .landing-page .hero {
          min-height: 100vh;
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding-top: calc(100px + env(safe-area-inset-top, 0px));
          padding-bottom: 40px;
          padding-left: 24px;
          padding-right: 24px;
          position: relative;
          z-index: 1;
        }

        .landing-page .hero-content {
          max-width: 700px;
        }

        .landing-page .status-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          background: white;
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 50px;
          font-size: 0.85rem;
          font-weight: 500;
          color: var(--text-muted);
          margin-bottom: 28px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
        }

        .landing-page .status-dot {
          width: 8px;
          height: 8px;
          background: #34C759;
          border-radius: 50%;
          box-shadow: 0 0 8px #34C759;
        }

        .landing-page .hero-title {
          font-size: clamp(2.8rem, 10vw, 5.5rem);
          font-weight: 700;
          letter-spacing: -0.03em;
          line-height: 1;
          margin-bottom: 20px;
        }

        .landing-page .text-gradient {
          background: linear-gradient(135deg, var(--bands-red), var(--bands-dark-red));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .landing-page .subtitle {
          font-size: 1.15rem;
          color: var(--text-muted);
          margin-bottom: 32px;
        }

        .landing-page .cta-group {
          display: flex;
          gap: 16px;
          justify-content: center;
          margin-bottom: 48px;
        }

        /* === FEATURES GRID === */
        .landing-page .features-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
          max-width: 400px;
          margin: 0 auto;
        }

        .landing-page .feature-card {
          background: white;
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 20px;
          padding: 16px;
          text-align: left;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
          transition: all 0.2s;
        }

        .landing-page .feature-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
        }

        .landing-page .feature-card h3 {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text-main);
          margin: 10px 0 4px;
        }

        .landing-page .feature-card p {
          font-size: 0.8rem;
          color: var(--text-muted);
        }

        /* === MOBILE RESPONSIVE === */
        @media (max-width: 768px) {
          .landing-page .hero-title {
            font-size: 2.8rem;
          }

          .landing-page .subtitle {
            font-size: 1rem;
          }

          .landing-page .features-grid {
            grid-template-columns: 1fr 1fr;
            gap: 10px;
          }

          .landing-page .feature-card {
            padding: 14px;
          }

          .landing-page .feature-card h3 {
            font-size: 0.85rem;
          }

          .landing-page .feature-card p {
            font-size: 0.75rem;
          }
        }
      `}</style>
    </div>
  )
}
