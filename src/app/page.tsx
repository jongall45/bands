'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

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
      {/* Noise Texture Overlay */}
      <div className="noise-overlay" />

      {/* Ethereal Red Auras - Blurred divs for "diffused ink" effect */}
      <div className="aura aura-1" />
      <div className="aura aura-2" />
      <div className="aura aura-3" />

      {/* Navigation */}
      <header className="glass-nav">
        <div className="logo">
          <div className="logo-icon">$</div>
          <span>bands</span>
        </div>
        <nav className="nav-links">
          <a href="#features" className="nav-link">Features</a>
          <a href="#transparency" className="nav-link">Transparency</a>
          <button onClick={login} className="glass-btn-sm">Connect</button>
        </nav>
      </header>

      {/* Hero Section */}
      <main className="hero">
        <div className="hero-content">
          {/* Status Pill */}
          <div className="glass-pill">
            <span className="status-dot" />
            Protocol Live
          </div>
          
          <h1 className="hero-title">
            YOUR MONEY,<br />
            <span className="text-gradient">UPGRADED</span>
          </h1>
          
          <p className="hero-sub">
            The stablecoin neobank for degens.
            <span className="hero-sub-bold">Spend. Save. Speculate.</span>
          </p>
          
          <div className="cta-group">
            <button onClick={login} className="glass-btn-lg">
              Join the Band
              <span className="btn-shine" />
            </button>
            <button className="glass-btn-secondary">
              Read Whitepaper
            </button>
          </div>
        </div>

        {/* Phone Mockup */}
        <div className="hero-image-container">
          <div className="phone-mockup">
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
        </div>

        {/* Floating Glass Card */}
        <div className="floating-card">
          <div className="card-row">
            <span>Yield</span>
            <span className="card-value">+12.5%</span>
          </div>
          <div className="card-loader">
            <div className="loader-bar" />
          </div>
        </div>
      </main>

      {/* Features Pills */}
      <section className="features-section">
        <div className="feature-pills">
          <div className="glass-feature-pill">Transparency</div>
          <div className="glass-feature-pill">Regeneration</div>
          <div className="glass-feature-pill">Intelligence</div>
        </div>
      </section>

      <style jsx global>{`
        /* === ETHEREAL GLASS & NOISE AESTHETIC === */
        
        .landing-page {
          --bg-color: #F4F4F5;
          --text-main: #1D1D1F;
          --text-muted: #86868B;
          --bands-red: #FF3B30;
          --bands-dark-red: #D70015;
          --glass-bg: rgba(255, 255, 255, 0.4);
          --glass-border: rgba(255, 255, 255, 0.8);
          --glass-shadow: 0 8px 32px rgba(255, 59, 48, 0.1);
          
          min-height: 100vh;
          width: 100%;
          background-color: var(--bg-color);
          color: var(--text-main);
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif;
          overflow-x: hidden;
          position: relative;
        }

        /* === 1. NOISE TEXTURE OVERLAY === */
        .landing-page .noise-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 9999;
          opacity: 0.08;
          mix-blend-mode: overlay;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
        }

        /* === 2. ETHEREAL AURAS (Blurred Divs) === */
        .landing-page .aura {
          position: absolute;
          border-radius: 50%;
          background: var(--bands-red);
          filter: blur(120px);
          z-index: -1;
          animation: float 12s ease-in-out infinite;
        }

        .landing-page .aura-1 {
          width: 600px;
          height: 600px;
          top: -200px;
          left: -150px;
          opacity: 0.6;
          animation-delay: 0s;
        }

        .landing-page .aura-2 {
          width: 500px;
          height: 500px;
          bottom: -100px;
          right: -100px;
          opacity: 0.5;
          animation-delay: 4s;
        }

        .landing-page .aura-3 {
          width: 350px;
          height: 350px;
          top: 40%;
          left: 60%;
          opacity: 0.35;
          background: #FF6B6B;
          animation-delay: 8s;
        }

        @keyframes float {
          0%, 100% { 
            transform: translate(0, 0) scale(1); 
          }
          33% { 
            transform: translate(40px, -50px) scale(1.05); 
          }
          66% { 
            transform: translate(-30px, 30px) scale(0.95); 
          }
        }

        /* === 3. GLASSMORPHISM UI === */
        
        /* Glass Navigation */
        .landing-page .glass-nav {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 48px;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 100;
          background: rgba(255, 255, 255, 0.2);
          border-bottom: 1px solid rgba(255, 255, 255, 0.4);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        .landing-page .logo {
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: 800;
          font-size: 1.4rem;
          letter-spacing: -0.03em;
          color: var(--text-main);
        }

        .landing-page .logo-icon {
          width: 36px;
          height: 36px;
          background: var(--bands-red);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 800;
          font-size: 1.1rem;
          box-shadow: 0 0 24px rgba(255, 59, 48, 0.4);
        }

        .landing-page .nav-links {
          display: flex;
          align-items: center;
          gap: 28px;
        }

        .landing-page .nav-link {
          color: var(--text-muted);
          text-decoration: none;
          font-size: 0.9rem;
          font-weight: 500;
          transition: color 0.2s;
        }

        .landing-page .nav-link:hover {
          color: var(--text-main);
        }

        /* Glass Buttons */
        .landing-page .glass-btn-sm {
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
          padding: 10px 20px;
          border-radius: 24px;
          font-weight: 600;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.3s ease;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          color: var(--text-main);
          box-shadow: var(--glass-shadow);
        }

        .landing-page .glass-btn-sm:hover {
          background: rgba(255, 255, 255, 0.6);
          box-shadow: 0 12px 40px rgba(255, 59, 48, 0.2);
          transform: translateY(-2px);
        }

        .landing-page .glass-btn-lg {
          position: relative;
          background: rgba(255, 255, 255, 0.25);
          border: 1px solid var(--glass-border);
          padding: 18px 48px;
          border-radius: 50px;
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--bands-dark-red);
          cursor: pointer;
          overflow: hidden;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          box-shadow: 0 20px 40px rgba(255, 59, 48, 0.15), inset 0 0 0 1px rgba(255, 255, 255, 0.5);
          transition: all 0.3s ease;
        }

        .landing-page .glass-btn-lg:hover {
          transform: scale(1.02) translateY(-2px);
          background: rgba(255, 255, 255, 0.4);
          box-shadow: 0 24px 50px rgba(255, 59, 48, 0.25);
        }

        .landing-page .btn-shine {
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
          animation: shine 3s infinite;
        }

        @keyframes shine {
          0% { left: -100%; }
          50%, 100% { left: 100%; }
        }

        .landing-page .glass-btn-secondary {
          background: transparent;
          border: none;
          padding: 18px 32px;
          border-radius: 50px;
          font-size: 1rem;
          font-weight: 500;
          color: var(--text-muted);
          cursor: pointer;
          transition: color 0.2s;
        }

        .landing-page .glass-btn-secondary:hover {
          color: var(--text-main);
        }

        /* Glass Pill */
        .landing-page .glass-pill {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 10px 20px;
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
          border-radius: 50px;
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-muted);
          margin-bottom: 28px;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          box-shadow: var(--glass-shadow);
        }

        .landing-page .status-dot {
          width: 8px;
          height: 8px;
          background: #34C759;
          border-radius: 50%;
          box-shadow: 0 0 10px #34C759;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(0.85); }
        }

        /* === HERO SECTION === */
        .landing-page .hero {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
          padding: 120px 24px 60px;
          position: relative;
        }

        .landing-page .hero-content {
          max-width: 700px;
          z-index: 10;
        }

        .landing-page .hero-title {
          font-size: clamp(3.5rem, 10vw, 5.5rem);
          font-weight: 800;
          letter-spacing: -0.04em;
          line-height: 0.95;
          margin-bottom: 24px;
          color: var(--text-main);
        }

        .landing-page .text-gradient {
          background: linear-gradient(135deg, var(--bands-red), var(--bands-dark-red));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          position: relative;
          display: inline-block;
        }

        /* Blur glow behind gradient text */
        .landing-page .text-gradient::after {
          content: 'UPGRADED';
          position: absolute;
          left: 0;
          top: 0;
          background: linear-gradient(135deg, var(--bands-red), var(--bands-dark-red));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          filter: blur(20px);
          opacity: 0.5;
          z-index: -1;
        }

        .landing-page .hero-sub {
          font-size: 1.25rem;
          color: var(--text-muted);
          line-height: 1.6;
          margin-bottom: 40px;
          max-width: 480px;
          margin-left: auto;
          margin-right: auto;
        }

        .landing-page .hero-sub-bold {
          display: block;
          color: var(--text-main);
          font-weight: 500;
          margin-top: 8px;
        }

        .landing-page .cta-group {
          display: flex;
          gap: 16px;
          justify-content: center;
          flex-wrap: wrap;
        }

        /* === PHONE MOCKUP === */
        .landing-page .hero-image-container {
          margin-top: 60px;
          z-index: 10;
        }

        .landing-page .phone-mockup {
          position: relative;
        }

        .landing-page .phone-frame {
          width: 260px;
          height: 540px;
          background: linear-gradient(145deg, #2a2a2a, #1a1a1a);
          border-radius: 40px;
          padding: 10px;
          position: relative;
          box-shadow: 
            0 50px 100px rgba(0, 0, 0, 0.25),
            0 0 0 1px rgba(255, 255, 255, 0.1),
            inset 0 0 0 1px rgba(255, 255, 255, 0.05);
          transform: perspective(1000px) rotateX(5deg);
        }

        .landing-page .phone-notch {
          width: 90px;
          height: 26px;
          background: #000;
          border-radius: 20px;
          position: absolute;
          top: 14px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 10;
        }

        .landing-page .phone-screen {
          width: 100%;
          height: 100%;
          background: #000;
          border-radius: 32px;
          overflow: hidden;
          padding: 44px 14px 20px;
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
          font-size: 0.65rem;
          color: #888;
          margin-bottom: 4px;
        }

        .landing-page .balance-value {
          display: block;
          font-size: 2rem;
          font-weight: 700;
          color: white;
          letter-spacing: -0.02em;
          margin-bottom: 4px;
        }

        .landing-page .balance-token {
          display: block;
          font-size: 0.65rem;
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
          padding: 12px;
          background: var(--bands-red);
          color: white;
          border: none;
          border-radius: 12px;
          font-weight: 600;
          font-size: 0.8rem;
          cursor: default;
          box-shadow: 0 0 16px rgba(255, 59, 48, 0.3);
        }

        .landing-page .action-row {
          display: flex;
          gap: 6px;
        }

        .landing-page .action-item {
          flex: 1;
          padding: 14px 6px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          font-size: 0.6rem;
          color: #888;
          text-align: center;
        }

        /* === FLOATING GLASS CARD === */
        .landing-page .floating-card {
          position: absolute;
          right: 10%;
          bottom: 20%;
          width: 200px;
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
          border-radius: 20px;
          padding: 18px;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          box-shadow: var(--glass-shadow);
          transform: rotate(-5deg);
          animation: float 10s ease-in-out infinite reverse;
          z-index: 10;
        }

        .landing-page .card-row {
          display: flex;
          justify-content: space-between;
          font-weight: 600;
          font-size: 0.9rem;
          margin-bottom: 12px;
          color: var(--text-main);
        }

        .landing-page .card-value {
          color: #34C759;
        }

        .landing-page .card-loader {
          width: 100%;
          height: 6px;
          background: rgba(0, 0, 0, 0.05);
          border-radius: 10px;
          overflow: hidden;
        }

        .landing-page .loader-bar {
          width: 60%;
          height: 100%;
          background: var(--bands-red);
          border-radius: 10px;
        }

        /* === FEATURES PILLS === */
        .landing-page .features-section {
          padding: 80px 24px;
          position: relative;
          z-index: 10;
        }

        .landing-page .feature-pills {
          display: flex;
          justify-content: center;
          gap: 20px;
          flex-wrap: wrap;
        }

        .landing-page .glass-feature-pill {
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
          padding: 16px 32px;
          border-radius: 50px;
          font-weight: 600;
          font-size: 0.95rem;
          color: var(--text-main);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          box-shadow: var(--glass-shadow);
          transition: all 0.3s ease;
        }

        .landing-page .glass-feature-pill:hover {
          background: rgba(255, 255, 255, 0.6);
          transform: translateY(-4px);
          box-shadow: 0 16px 48px rgba(255, 59, 48, 0.15);
        }

        /* === RESPONSIVE === */
        @media (max-width: 768px) {
          .landing-page .glass-nav {
            padding: 16px 20px;
          }

          .landing-page .nav-link {
            display: none;
          }

          .landing-page .hero-title {
            font-size: 3rem;
          }

          .landing-page .hero-sub {
            font-size: 1.1rem;
          }

          .landing-page .cta-group {
            flex-direction: column;
            width: 100%;
            padding: 0 20px;
          }

          .landing-page .glass-btn-lg,
          .landing-page .glass-btn-secondary {
            width: 100%;
          }

          .landing-page .phone-frame {
            width: 220px;
            height: 460px;
          }

          .landing-page .floating-card {
            display: none;
          }

          .landing-page .feature-pills {
            flex-direction: column;
            align-items: center;
          }
        }
      `}</style>
    </div>
  )
}
