'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { usePorto } from '@/components/providers/Providers'
import { ConnectButton } from '@/components/auth/ConnectButton'
import { LogoInline } from '@/components/ui/Logo'
import { Fingerprint, Shield, Zap, Globe } from 'lucide-react'

export default function Home() {
  const { isConnected, ready } = usePorto()
  const router = useRouter()

  useEffect(() => {
    if (ready && isConnected) {
      router.push('/dashboard')
    }
  }, [ready, isConnected, router])

  return (
    <div className="landing-page">
      {/* Grain Texture Overlay */}
      <div className="noise-overlay" />

      {/* Atmospheric Red Auras */}
      <div className="aura aura-1" />
      <div className="aura aura-2" />
      <div className="aura aura-3" />

      {/* Navigation */}
      <header className="navbar">
        <LogoInline size="md" />
        <nav className="nav-links">
          <a href="#features" className="nav-link">Features</a>
          <a href="#transparency" className="nav-link">Transparency</a>
          <ConnectButton />
        </nav>
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
          <div className="features-grid" id="features">
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

      <style jsx global>{`
        .landing-page {
          --bg-base: #F4F4F5;
          --text-main: #1D1D1F;
          --text-muted: #86868B;
          --bands-red: #FF3B30;
          --bands-dark-red: #D70015;
          
          min-height: 100vh;
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

        /* === RED AURAS === */
        .landing-page .aura {
          position: fixed;
          border-radius: 50%;
          z-index: 0;
          animation: aura-float 20s ease-in-out infinite;
        }

        .landing-page .aura-1 {
          width: 800px;
          height: 800px;
          top: -250px;
          left: -200px;
          background: var(--bands-red);
          filter: blur(150px);
          opacity: 0.5;
        }

        .landing-page .aura-2 {
          width: 700px;
          height: 700px;
          bottom: -200px;
          right: -150px;
          background: var(--bands-dark-red);
          filter: blur(140px);
          opacity: 0.45;
          animation-delay: 7s;
        }

        .landing-page .aura-3 {
          width: 400px;
          height: 400px;
          top: 40%;
          right: 20%;
          background: #FF6B35;
          filter: blur(120px);
          opacity: 0.3;
          animation-delay: 14s;
        }

        @keyframes aura-float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(50px, -40px) scale(1.05); }
          66% { transform: translate(-30px, 40px) scale(0.95); }
        }

        /* === NAVIGATION === */
        .landing-page .navbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 48px;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 1000;
          background: rgba(244, 244, 245, 0.8);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(0, 0, 0, 0.05);
        }

        .landing-page .nav-links {
          display: flex;
          align-items: center;
          gap: 32px;
        }

        .landing-page .nav-link {
          color: var(--text-muted);
          text-decoration: none;
          font-size: 0.95rem;
          font-weight: 500;
          transition: color 0.2s;
        }

        .landing-page .nav-link:hover {
          color: var(--text-main);
        }

        /* === HERO === */
        .landing-page .hero {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 140px 24px 60px;
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
          font-size: clamp(3rem, 10vw, 5.5rem);
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
          font-size: 1.25rem;
          color: var(--text-muted);
          margin-bottom: 36px;
        }

        .landing-page .cta-group {
          display: flex;
          gap: 16px;
          justify-content: center;
          margin-bottom: 60px;
        }

        /* === FEATURES GRID === */
        .landing-page .features-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
          max-width: 500px;
          margin: 0 auto;
        }

        .landing-page .feature-card {
          background: white;
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 20px;
          padding: 20px;
          text-align: left;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
          transition: all 0.2s;
        }

        .landing-page .feature-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
        }

        .landing-page .feature-card h3 {
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--text-main);
          margin: 12px 0 4px;
        }

        .landing-page .feature-card p {
          font-size: 0.85rem;
          color: var(--text-muted);
        }

        /* === RESPONSIVE === */
        @media (max-width: 768px) {
          .landing-page .navbar {
            padding: 16px 20px;
          }

          .landing-page .nav-link {
            display: none;
          }

          .landing-page .hero-title {
            font-size: 3rem;
          }

          .landing-page .features-grid {
            grid-template-columns: 1fr;
            padding: 0 20px;
          }
        }
      `}</style>
    </div>
  )
}
