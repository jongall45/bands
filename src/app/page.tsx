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
      {/* Heavy Noise Texture Overlay */}
      <div className="noise-overlay" />

      {/* Atmospheric Red Auras - Much larger and more saturated */}
      <div className="aura aura-1" />
      <div className="aura aura-2" />
      <div className="aura aura-3" />
      <div className="aura aura-4" />

      {/* Navigation */}
      <header className="glass-nav">
        <div className="logo">
          <div className="logo-icon">$</div>
          <span>bands</span>
        </div>
        <nav className="nav-links">
          <a href="#features" className="nav-link">Features</a>
          <a href="#transparency" className="nav-link">Transparency</a>
          <button onClick={login} className="glass-btn-nav">Connect</button>
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
            MAKE IT<br />
            <span className="text-glow">RAIN</span>
          </h1>
          
          <p className="hero-sub">
            The first Stablecoin Neobank built for high-frequency liquidity.
            <span className="hero-sub-bold">Spend. Save. Speculate.</span>
          </p>
          
          <div className="cta-group">
            <button onClick={login} className="glass-btn-primary">
              Join the Band
              <span className="btn-glow" />
            </button>
            <button className="glass-btn-ghost">
              Read Whitepaper
            </button>
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

        {/* Secondary Floating Card */}
        <div className="floating-card-2">
          <div className="card-icon">⚡</div>
          <span>Instant</span>
        </div>
      </main>

      {/* Feature Pills Section */}
      <section className="features-section">
        <div className="feature-pills">
          <div className="glass-feature-pill">Transparency</div>
          <div className="glass-feature-pill">Regeneration</div>
          <div className="glass-feature-pill">Intelligence</div>
        </div>
      </section>

      <style jsx global>{`
        /* === ETHEREAL RED ATMOSPHERE === */
        
        .landing-page {
          --bg-base: #E8E8EC;
          --text-main: #1D1D1F;
          --text-muted: #6E6E73;
          --bands-red: #FF3B30;
          --bands-deep-red: #CC0000;
          --bands-orange: #FF6B35;
          
          min-height: 100vh;
          width: 100%;
          background: var(--bg-base);
          color: var(--text-main);
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          overflow-x: hidden;
          position: relative;
        }

        /* === 1. HEAVY GRAIN TEXTURE (More visible) === */
        .landing-page .noise-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 10000;
          opacity: 0.12;
          mix-blend-mode: soft-light;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
        }

        /* === 2. ATMOSPHERIC RED AURAS (Much larger, more saturated) === */
        .landing-page .aura {
          position: fixed;
          border-radius: 50%;
          z-index: 0;
          animation: aura-float 15s ease-in-out infinite;
        }

        .landing-page .aura-1 {
          width: 900px;
          height: 900px;
          top: -300px;
          left: -200px;
          background: var(--bands-red);
          filter: blur(150px);
          opacity: 0.7;
          animation-delay: 0s;
        }

        .landing-page .aura-2 {
          width: 800px;
          height: 800px;
          bottom: -250px;
          right: -200px;
          background: var(--bands-deep-red);
          filter: blur(140px);
          opacity: 0.6;
          animation-delay: 5s;
        }

        .landing-page .aura-3 {
          width: 500px;
          height: 500px;
          top: 30%;
          right: 10%;
          background: var(--bands-orange);
          filter: blur(120px);
          opacity: 0.4;
          animation-delay: 10s;
        }

        .landing-page .aura-4 {
          width: 400px;
          height: 400px;
          bottom: 20%;
          left: 20%;
          background: var(--bands-red);
          filter: blur(100px);
          opacity: 0.35;
          animation-delay: 7s;
        }

        @keyframes aura-float {
          0%, 100% { 
            transform: translate(0, 0) scale(1); 
            opacity: var(--aura-opacity, 0.6);
          }
          25% { 
            transform: translate(60px, -40px) scale(1.1); 
            opacity: calc(var(--aura-opacity, 0.6) * 1.2);
          }
          50% { 
            transform: translate(-40px, 60px) scale(0.95); 
            opacity: calc(var(--aura-opacity, 0.6) * 0.8);
          }
          75% { 
            transform: translate(30px, 30px) scale(1.05); 
            opacity: var(--aura-opacity, 0.6);
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
          z-index: 1000;
          background: rgba(255, 255, 255, 0.25);
          border-bottom: 1px solid rgba(255, 255, 255, 0.5);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
        }

        .landing-page .logo {
          display: flex;
          align-items: center;
          gap: 12px;
          font-weight: 800;
          font-size: 1.5rem;
          letter-spacing: -0.04em;
          color: var(--text-main);
        }

        .landing-page .logo-icon {
          width: 40px;
          height: 40px;
          background: var(--bands-red);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 800;
          font-size: 1.2rem;
          box-shadow: 
            0 0 30px rgba(255, 59, 48, 0.5),
            0 0 60px rgba(255, 59, 48, 0.3);
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
          transition: color 0.3s;
        }

        .landing-page .nav-link:hover {
          color: var(--text-main);
        }

        /* Glass Button - Nav */
        .landing-page .glass-btn-nav {
          background: rgba(255, 255, 255, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.8);
          padding: 12px 24px;
          border-radius: 50px;
          font-weight: 600;
          font-size: 0.9rem;
          cursor: pointer;
          transition: all 0.3s ease;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          color: var(--text-main);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
        }

        .landing-page .glass-btn-nav:hover {
          background: rgba(255, 255, 255, 0.7);
          transform: translateY(-2px);
          box-shadow: 0 8px 30px rgba(255, 59, 48, 0.2);
        }

        /* Glass Button - Primary CTA */
        .landing-page .glass-btn-primary {
          position: relative;
          background: rgba(255, 255, 255, 0.5);
          border: 2px solid rgba(255, 255, 255, 0.9);
          padding: 20px 56px;
          border-radius: 60px;
          font-size: 1.15rem;
          font-weight: 700;
          color: var(--bands-deep-red);
          cursor: pointer;
          overflow: hidden;
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          box-shadow: 
            0 8px 40px rgba(255, 59, 48, 0.25),
            0 0 80px rgba(255, 59, 48, 0.15),
            inset 0 1px 0 rgba(255, 255, 255, 0.8);
          transition: all 0.4s ease;
        }

        .landing-page .glass-btn-primary:hover {
          transform: scale(1.03) translateY(-3px);
          background: rgba(255, 255, 255, 0.65);
          box-shadow: 
            0 16px 60px rgba(255, 59, 48, 0.35),
            0 0 100px rgba(255, 59, 48, 0.25),
            inset 0 1px 0 rgba(255, 255, 255, 0.9);
        }

        .landing-page .btn-glow {
          position: absolute;
          bottom: -50%;
          left: 50%;
          transform: translateX(-50%);
          width: 200%;
          height: 100%;
          background: radial-gradient(ellipse, rgba(255, 59, 48, 0.3) 0%, transparent 70%);
          pointer-events: none;
        }

        .landing-page .glass-btn-ghost {
          background: transparent;
          border: none;
          padding: 20px 40px;
          border-radius: 60px;
          font-size: 1rem;
          font-weight: 500;
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.3s;
        }

        .landing-page .glass-btn-ghost:hover {
          color: var(--text-main);
        }

        /* Glass Pill */
        .landing-page .glass-pill {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 12px 24px;
          background: rgba(255, 255, 255, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.7);
          border-radius: 50px;
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text-muted);
          margin-bottom: 32px;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
        }

        .landing-page .status-dot {
          width: 10px;
          height: 10px;
          background: #34C759;
          border-radius: 50%;
          box-shadow: 0 0 12px #34C759, 0 0 24px #34C759;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }

        /* === HERO SECTION === */
        .landing-page .hero {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
          padding: 140px 24px 80px;
          position: relative;
          z-index: 1;
        }

        .landing-page .hero-content {
          max-width: 800px;
        }

        .landing-page .hero-title {
          font-size: clamp(4rem, 14vw, 7rem);
          font-weight: 900;
          letter-spacing: -0.05em;
          line-height: 0.9;
          margin-bottom: 28px;
          color: var(--text-main);
        }

        .landing-page .text-glow {
          background: linear-gradient(135deg, var(--bands-red) 0%, var(--bands-orange) 50%, var(--bands-red) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          position: relative;
          display: inline-block;
          filter: drop-shadow(0 0 40px rgba(255, 59, 48, 0.5));
        }

        /* Red glow behind RAIN text */
        .landing-page .text-glow::before {
          content: 'RAIN';
          position: absolute;
          left: 0;
          top: 0;
          background: linear-gradient(135deg, var(--bands-red) 0%, var(--bands-orange) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          filter: blur(40px);
          opacity: 0.7;
          z-index: -1;
        }

        .landing-page .hero-sub {
          font-size: 1.3rem;
          color: var(--text-muted);
          line-height: 1.7;
          margin-bottom: 44px;
          max-width: 520px;
          margin-left: auto;
          margin-right: auto;
        }

        .landing-page .hero-sub-bold {
          display: block;
          color: var(--text-main);
          font-weight: 600;
          margin-top: 10px;
        }

        .landing-page .cta-group {
          display: flex;
          gap: 20px;
          justify-content: center;
          flex-wrap: wrap;
        }

        /* === FLOATING GLASS CARDS === */
        .landing-page .floating-card {
          position: absolute;
          right: 8%;
          bottom: 18%;
          width: 220px;
          background: rgba(255, 255, 255, 0.55);
          border: 1px solid rgba(255, 255, 255, 0.8);
          border-radius: 24px;
          padding: 20px;
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          box-shadow: 
            0 20px 60px rgba(0, 0, 0, 0.1),
            0 0 40px rgba(255, 59, 48, 0.08);
          transform: rotate(-6deg);
          animation: card-float 12s ease-in-out infinite;
          z-index: 10;
        }

        .landing-page .floating-card-2 {
          position: absolute;
          left: 8%;
          top: 35%;
          background: rgba(255, 255, 255, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.7);
          border-radius: 20px;
          padding: 16px 24px;
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          box-shadow: 0 16px 50px rgba(0, 0, 0, 0.08);
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: 600;
          color: var(--text-main);
          transform: rotate(4deg);
          animation: card-float 14s ease-in-out infinite reverse;
          z-index: 10;
        }

        .landing-page .card-icon {
          font-size: 1.3rem;
        }

        @keyframes card-float {
          0%, 100% { transform: translateY(0) rotate(-6deg); }
          50% { transform: translateY(-20px) rotate(-4deg); }
        }

        .landing-page .card-row {
          display: flex;
          justify-content: space-between;
          font-weight: 600;
          font-size: 1rem;
          margin-bottom: 14px;
          color: var(--text-main);
        }

        .landing-page .card-value {
          color: #34C759;
          font-weight: 700;
        }

        .landing-page .card-loader {
          width: 100%;
          height: 8px;
          background: rgba(0, 0, 0, 0.08);
          border-radius: 10px;
          overflow: hidden;
        }

        .landing-page .loader-bar {
          width: 65%;
          height: 100%;
          background: linear-gradient(90deg, var(--bands-red), var(--bands-orange));
          border-radius: 10px;
          box-shadow: 0 0 10px rgba(255, 59, 48, 0.4);
        }

        /* === FEATURE PILLS === */
        .landing-page .features-section {
          padding: 60px 24px 100px;
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
          background: rgba(255, 255, 255, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.7);
          padding: 18px 36px;
          border-radius: 50px;
          font-weight: 600;
          font-size: 1rem;
          color: var(--text-main);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.06);
          transition: all 0.4s ease;
          cursor: default;
        }

        .landing-page .glass-feature-pill:hover {
          background: rgba(255, 255, 255, 0.7);
          transform: translateY(-6px);
          box-shadow: 
            0 20px 50px rgba(0, 0, 0, 0.1),
            0 0 40px rgba(255, 59, 48, 0.1);
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
            font-size: 3.5rem;
          }

          .landing-page .hero-sub {
            font-size: 1.1rem;
          }

          .landing-page .cta-group {
            flex-direction: column;
            width: 100%;
            padding: 0 20px;
          }

          .landing-page .glass-btn-primary,
          .landing-page .glass-btn-ghost {
            width: 100%;
          }

          .landing-page .floating-card,
          .landing-page .floating-card-2 {
            display: none;
          }

          .landing-page .feature-pills {
            flex-direction: column;
            align-items: center;
          }

          .landing-page .aura-1 {
            width: 500px;
            height: 500px;
          }

          .landing-page .aura-2 {
            width: 400px;
            height: 400px;
          }
        }
      `}</style>
    </div>
  )
}
