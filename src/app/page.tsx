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

      {/* Floating Red Auras - ink in milk effect */}
      <div className="aura aura-1" />
      <div className="aura aura-2" />
      <div className="aura aura-3" />

      {/* Navigation */}
      <nav className="glass-nav">
        <div className="logo">bands.cash</div>
        <div className="nav-links">
          <a href="#" className="nav-item">Features</a>
          <a href="#" className="nav-item">Transparency</a>
          <button onClick={login} className="glass-button-sm">Connect</button>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="hero-section">
        <div className="content-wrapper">
          {/* Status Pill */}
          <div className="glass-pill-label">
            <span className="status-dot" />
            Protocol Live
          </div>

          {/* Main Headline */}
          <h1 className="hero-title">
            MAKE IT <br />
            <span className="text-red-gradient">RAIN</span>
          </h1>

          {/* Subheadline */}
          <p className="hero-sub">
            The first Stablecoin Neobank built specifically for high-frequency liquidity.
            <span className="break-text">Spend. Save. Speculate.</span>
          </p>

          {/* CTA Buttons */}
          <div className="cta-group">
            <button onClick={login} className="glass-button-lg">
              Join the Band
              <div className="shine" />
            </button>
            <button className="glass-button-secondary">
              Read Whitepaper
            </button>
          </div>
        </div>

        {/* Floating Yield Card */}
        <div className="floating-card">
          <div className="card-row">
            <span>Yield</span>
            <span className="value">+12.5%</span>
          </div>
          <div className="card-loader">
            <div className="loader-bar" />
          </div>
        </div>
      </main>

      <style jsx global>{`
        .landing-page {
          --bg-color: #F0F0F2;
          --text-main: #1D1D1F;
          --text-muted: #86868B;
          --bands-red: #FF3B30;
          --bands-dark-red: #D70015;
          --glass-border: rgba(255, 255, 255, 0.6);
          --glass-bg: rgba(255, 255, 255, 0.35);
          
          min-height: 100vh;
          width: 100%;
          background-color: var(--bg-color) !important;
          color: var(--text-main) !important;
          position: relative;
          overflow-x: hidden;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }

        /* Noise Overlay */
        .landing-page .noise-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 9999;
          opacity: 0.12;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
          mix-blend-mode: overlay;
        }

        /* Ethereal Red Auras - ink in milk effect */
        .landing-page .aura {
          position: fixed;
          border-radius: 50%;
          filter: blur(100px);
          z-index: 1;
          animation: aura-float 12s infinite ease-in-out;
        }

        .landing-page .aura-1 {
          width: 700px;
          height: 700px;
          background: radial-gradient(circle, rgba(255, 59, 48, 0.6) 0%, rgba(255, 59, 48, 0.3) 30%, transparent 70%);
          top: -15%;
          left: -15%;
          animation-delay: 0s;
        }

        .landing-page .aura-2 {
          width: 600px;
          height: 600px;
          background: radial-gradient(circle, rgba(215, 0, 21, 0.5) 0%, rgba(215, 0, 21, 0.2) 30%, transparent 70%);
          bottom: -20%;
          right: -10%;
          animation-delay: 3s;
        }

        .landing-page .aura-3 {
          width: 400px;
          height: 400px;
          background: radial-gradient(circle, rgba(255, 149, 0, 0.3) 0%, transparent 60%);
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          animation-delay: 6s;
        }

        @keyframes aura-float {
          0%, 100% { 
            transform: translate(0, 0) scale(1); 
          }
          25% { 
            transform: translate(40px, -30px) scale(1.05); 
          }
          50% { 
            transform: translate(-20px, 40px) scale(0.95); 
          }
          75% { 
            transform: translate(-30px, -20px) scale(1.02); 
          }
        }

        /* Glassmorphism Nav */
        .landing-page .glass-nav {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 40px;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 100;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          background: rgba(240, 240, 242, 0.7);
          border-bottom: 1px solid rgba(255, 255, 255, 0.5);
        }

        .landing-page .logo {
          font-weight: 800;
          font-size: 1.4rem;
          letter-spacing: -0.03em;
          color: var(--text-main);
        }

        .landing-page .nav-links {
          display: flex;
          gap: 28px;
          align-items: center;
        }

        .landing-page .nav-item {
          text-decoration: none;
          color: var(--text-muted);
          font-size: 0.9rem;
          font-weight: 500;
          transition: color 0.3s;
        }

        .landing-page .nav-item:hover {
          color: var(--text-main);
        }

        .landing-page .glass-button-sm {
          background: rgba(255, 255, 255, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.8);
          padding: 10px 20px;
          border-radius: 50px;
          font-weight: 600;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.3s ease;
          backdrop-filter: blur(8px);
          color: var(--text-main);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
        }

        .landing-page .glass-button-sm:hover {
          background: rgba(255, 255, 255, 0.8);
          box-shadow: 0 4px 20px rgba(255, 59, 48, 0.2);
        }

        /* Hero Section */
        .landing-page .hero-section {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
          position: relative;
          z-index: 10;
          padding: 100px 20px 60px;
        }

        .landing-page .content-wrapper {
          position: relative;
          z-index: 10;
        }

        .landing-page .glass-pill-label {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 8px 18px;
          background: rgba(255, 255, 255, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.7);
          border-radius: 50px;
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--text-muted);
          margin-bottom: 32px;
          backdrop-filter: blur(8px);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
        }

        .landing-page .status-dot {
          width: 8px;
          height: 8px;
          background-color: #34C759;
          border-radius: 50%;
          box-shadow: 0 0 12px #34C759;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .landing-page .hero-title {
          font-size: clamp(3.5rem, 12vw, 7rem);
          line-height: 0.9;
          font-weight: 800;
          letter-spacing: -0.04em;
          margin-bottom: 28px;
          color: var(--text-main);
        }

        .landing-page .text-red-gradient {
          background: linear-gradient(135deg, var(--bands-red) 0%, var(--bands-dark-red) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          position: relative;
          display: inline-block;
        }

        .landing-page .text-red-gradient::after {
          content: 'RAIN';
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          height: 100%;
          background: linear-gradient(135deg, var(--bands-red) 0%, var(--bands-dark-red) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          filter: blur(20px);
          opacity: 0.5;
          z-index: -1;
        }

        .landing-page .hero-sub {
          font-size: 1.2rem;
          color: var(--text-muted);
          max-width: 480px;
          margin: 0 auto 44px;
          line-height: 1.6;
        }

        .landing-page .break-text {
          display: block;
          color: var(--text-main);
          font-weight: 600;
          margin-top: 12px;
        }

        /* CTA Buttons */
        .landing-page .cta-group {
          display: flex;
          gap: 16px;
          justify-content: center;
          flex-wrap: wrap;
        }

        .landing-page .glass-button-lg {
          position: relative;
          background: rgba(255, 255, 255, 0.4);
          border: 1.5px solid rgba(255, 255, 255, 0.9);
          padding: 18px 52px;
          border-radius: 50px;
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--bands-dark-red);
          cursor: pointer;
          overflow: hidden;
          backdrop-filter: blur(12px);
          box-shadow: 
            0 8px 32px rgba(215, 0, 21, 0.15),
            inset 0 1px 0 rgba(255, 255, 255, 0.6);
          transition: all 0.3s ease;
        }

        .landing-page .glass-button-lg:hover {
          transform: translateY(-2px);
          background: rgba(255, 255, 255, 0.6);
          box-shadow: 
            0 12px 40px rgba(215, 0, 21, 0.25),
            inset 0 1px 0 rgba(255, 255, 255, 0.8);
        }

        .landing-page .shine {
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.5), transparent);
          animation: shine 3s infinite;
        }

        @keyframes shine {
          0% { left: -100%; }
          50%, 100% { left: 100%; }
        }

        .landing-page .glass-button-secondary {
          background: transparent;
          border: none;
          padding: 18px 32px;
          border-radius: 50px;
          font-size: 1rem;
          font-weight: 500;
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.3s;
        }

        .landing-page .glass-button-secondary:hover {
          color: var(--text-main);
        }

        /* Floating Card */
        .landing-page .floating-card {
          position: fixed;
          right: 10%;
          bottom: 15%;
          width: 200px;
          background: rgba(255, 255, 255, 0.35);
          border: 1px solid rgba(255, 255, 255, 0.6);
          border-radius: 24px;
          padding: 20px;
          backdrop-filter: blur(16px);
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.08);
          transform: rotate(-5deg);
          animation: card-float 8s infinite ease-in-out;
          z-index: 20;
        }

        @keyframes card-float {
          0%, 100% { transform: rotate(-5deg) translateY(0); }
          50% { transform: rotate(-3deg) translateY(-15px); }
        }

        .landing-page .card-row {
          display: flex;
          justify-content: space-between;
          font-weight: 600;
          margin-bottom: 14px;
          color: var(--text-main);
          font-size: 0.95rem;
        }

        .landing-page .value {
          color: #34C759;
        }

        .landing-page .card-loader {
          width: 100%;
          height: 6px;
          background: rgba(0, 0, 0, 0.06);
          border-radius: 10px;
          overflow: hidden;
        }

        .landing-page .loader-bar {
          width: 60%;
          height: 100%;
          background: linear-gradient(90deg, var(--bands-red), var(--bands-dark-red));
          border-radius: 10px;
          animation: loading 2.5s infinite ease-in-out;
        }

        @keyframes loading {
          0%, 100% { width: 40%; }
          50% { width: 80%; }
        }

        /* Mobile Responsiveness */
        @media (max-width: 768px) {
          .landing-page .hero-title {
            font-size: 3.2rem;
          }
          
          .landing-page .floating-card {
            display: none;
          }
          
          .landing-page .glass-nav {
            padding: 16px 20px;
          }
          
          .landing-page .nav-item {
            display: none;
          }
          
          .landing-page .aura-1 {
            width: 400px;
            height: 400px;
            top: -10%;
            left: -20%;
          }
          
          .landing-page .aura-2 {
            width: 350px;
            height: 350px;
            bottom: -10%;
            right: -15%;
          }
          
          .landing-page .aura-3 {
            width: 250px;
            height: 250px;
          }
          
          .landing-page .hero-sub {
            font-size: 1rem;
            padding: 0 10px;
          }
          
          .landing-page .glass-button-lg {
            padding: 16px 40px;
            font-size: 1rem;
          }
        }
      `}</style>
    </div>
  )
}
