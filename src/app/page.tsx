'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Logo, LogoInline, NeumorphicIcon } from '@/components/ui/Logo'

export default function Home() {
  const { login, authenticated, ready } = usePrivy()
  const router = useRouter()

  useEffect(() => {
    if (ready && authenticated) {
      router.push('/dashboard')
    }
  }, [ready, authenticated, router])

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
        <LogoInline size="md" neumorphic={true} />
        <nav className="nav-links">
          <a href="#features" className="nav-link">Features</a>
          <a href="#transparency" className="nav-link">Transparency</a>
          <button onClick={login} className="btn-connect">Connect</button>
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
            YOUR MONEY,<br />
            <span className="text-gradient">UPGRADED</span>
          </h1>
          
          <p className="subtitle">
            The stablecoin neobank for degens.
          </p>
          <p className="subtitle-bold">
            Spend. Save. Speculate.
          </p>
          
          <div className="cta-group">
            <button onClick={login} className="btn-primary">
              Join the Band
            </button>
            <button className="btn-secondary">
              Read Whitepaper
            </button>
          </div>
        </div>

        {/* Neumorphic Logo Showcase */}
        <div className="logo-showcase">
          <NeumorphicIcon size={80} />
        </div>

        {/* Phone Mockup */}
        <div className="phone-container">
          <div className="phone-frame">
            <div className="phone-notch" />
            <div className="phone-screen">
              <div className="app-header">
                <div className="app-logo">
                  <span className="app-logo-icon">$</span>
                  <span>bands</span>
                </div>
              </div>
              <div className="app-balance">
                <span className="balance-label">Total Balance</span>
                <span className="balance-value">$2,847.32</span>
                <span className="balance-token">USDC on Base</span>
              </div>
              <div className="app-actions">
                <button className="app-add-funds">+ Add Funds</button>
                <div className="action-row">
                  <div className="action-item">↑ Send</div>
                  <div className="action-item">↓ Receive</div>
                  <div className="action-item">🛒 Buy</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Floating Yield Card */}
        <div className="yield-card">
          <div className="yield-row">
            <span>Yield</span>
            <span className="yield-value">+12.5%</span>
          </div>
          <div className="yield-bar-bg">
            <div className="yield-bar" />
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

        .landing-page .btn-connect {
          background: white;
          border: 1px solid rgba(0, 0, 0, 0.1);
          padding: 10px 20px;
          border-radius: 50px;
          font-weight: 600;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .landing-page .btn-connect:hover {
          background: #f5f5f5;
          transform: translateY(-1px);
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
          margin-bottom: 50px;
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
          margin-bottom: 8px;
        }

        .landing-page .subtitle-bold {
          font-size: 1.25rem;
          color: var(--text-main);
          font-weight: 500;
          margin-bottom: 36px;
        }

        .landing-page .cta-group {
          display: flex;
          gap: 16px;
          justify-content: center;
        }

        /* === LOGO SHOWCASE === */
        .landing-page .logo-showcase {
          margin: 40px 0;
          padding: 40px;
          background: #E0E5EC;
          border-radius: 24px;
          box-shadow: 
            12px 12px 24px rgba(163, 177, 198, 0.5),
            -12px -12px 24px rgba(255, 255, 255, 0.8);
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .landing-page .btn-primary {
          background: white;
          border: 1px solid rgba(0, 0, 0, 0.1);
          padding: 16px 40px;
          border-radius: 50px;
          font-size: 1rem;
          font-weight: 600;
          color: var(--bands-red);
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
        }

        .landing-page .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(255, 59, 48, 0.15);
        }

        .landing-page .btn-secondary {
          background: transparent;
          border: none;
          padding: 16px 24px;
          font-size: 1rem;
          font-weight: 500;
          color: var(--text-muted);
          cursor: pointer;
        }

        .landing-page .btn-secondary:hover {
          color: var(--text-main);
        }

        /* === PHONE MOCKUP === */
        .landing-page .phone-container {
          position: relative;
          z-index: 10;
        }

        .landing-page .phone-frame {
          width: 280px;
          height: 580px;
          background: linear-gradient(145deg, #2a2a2a, #1a1a1a);
          border-radius: 44px;
          padding: 12px;
          box-shadow: 
            0 50px 100px rgba(0, 0, 0, 0.2),
            0 0 0 1px rgba(255, 255, 255, 0.1);
          transform: perspective(1000px) rotateX(5deg);
        }

        .landing-page .phone-notch {
          width: 100px;
          height: 28px;
          background: #000;
          border-radius: 20px;
          position: absolute;
          top: 16px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 10;
        }

        .landing-page .phone-screen {
          width: 100%;
          height: 100%;
          background: #000;
          border-radius: 36px;
          overflow: hidden;
          padding: 48px 16px 24px;
        }

        .landing-page .app-header {
          margin-bottom: 28px;
        }

        .landing-page .app-logo {
          display: flex;
          align-items: center;
          gap: 6px;
          font-weight: 600;
          font-size: 0.9rem;
          color: white;
        }

        .landing-page .app-logo-icon {
          width: 24px;
          height: 24px;
          background: var(--bands-red);
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.8rem;
          color: white;
        }

        .landing-page .app-balance {
          text-align: center;
          margin-bottom: 20px;
        }

        .landing-page .balance-label {
          display: block;
          font-size: 0.7rem;
          color: #888;
          margin-bottom: 4px;
        }

        .landing-page .balance-value {
          display: block;
          font-size: 2.2rem;
          font-weight: 700;
          color: white;
          letter-spacing: -0.02em;
          margin-bottom: 4px;
        }

        .landing-page .balance-token {
          display: block;
          font-size: 0.7rem;
          color: var(--bands-red);
          font-weight: 500;
        }

        .landing-page .app-actions {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .landing-page .app-add-funds {
          width: 100%;
          padding: 14px;
          background: var(--bands-red);
          color: white;
          border: none;
          border-radius: 14px;
          font-weight: 600;
          font-size: 0.85rem;
        }

        .landing-page .action-row {
          display: flex;
          gap: 8px;
        }

        .landing-page .action-item {
          flex: 1;
          padding: 14px 8px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          font-size: 0.65rem;
          color: #888;
          text-align: center;
        }

        /* === YIELD CARD === */
        .landing-page .yield-card {
          position: absolute;
          right: 10%;
          bottom: 15%;
          width: 180px;
          background: white;
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 16px;
          padding: 16px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
          z-index: 10;
        }

        .landing-page .yield-row {
          display: flex;
          justify-content: space-between;
          font-weight: 600;
          font-size: 0.9rem;
          margin-bottom: 10px;
        }

        .landing-page .yield-value {
          color: #34C759;
        }

        .landing-page .yield-bar-bg {
          width: 100%;
          height: 6px;
          background: rgba(0, 0, 0, 0.06);
          border-radius: 10px;
          overflow: hidden;
        }

        .landing-page .yield-bar {
          width: 60%;
          height: 100%;
          background: var(--bands-red);
          border-radius: 10px;
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

          .landing-page .cta-group {
            flex-direction: column;
            width: 100%;
            padding: 0 20px;
          }

          .landing-page .btn-primary {
            width: 100%;
          }

          .landing-page .phone-frame {
            width: 240px;
            height: 500px;
          }

          .landing-page .yield-card {
            display: none;
          }
        }
      `}</style>
    </div>
  )
}
