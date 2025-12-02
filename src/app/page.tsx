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
    <>
      {/* Noise Texture Overlay */}
      <div className="noise-overlay" />

      {/* Floating Red Auras */}
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
            <span className="break">Spend. Save. Speculate.</span>
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

      <style jsx>{`
        :root {
          --bg-color: #F0F0F2;
          --text-main: #1D1D1F;
          --text-muted: #86868B;
          --bands-red: #FF3B30;
          --bands-dark-red: #D70015;
          --glass-border: rgba(255, 255, 255, 0.6);
          --glass-bg: rgba(255, 255, 255, 0.35);
          --glass-shadow: 0 8px 32px 0 rgba(186, 186, 200, 0.2);
        }

        /* Noise Overlay */
        .noise-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 9999;
          opacity: 0.08;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
          mix-blend-mode: overlay;
        }

        /* Ethereal Red Auras */
        .aura {
          position: fixed;
          border-radius: 50%;
          filter: blur(80px);
          z-index: 0;
          animation: float 10s infinite ease-in-out;
          opacity: 0.8;
        }

        .aura-1 {
          width: 600px;
          height: 600px;
          background: radial-gradient(circle, var(--bands-red) 0%, transparent 70%);
          top: -10%;
          left: -10%;
          animation-delay: 0s;
        }

        .aura-2 {
          width: 500px;
          height: 500px;
          background: radial-gradient(circle, var(--bands-dark-red) 0%, transparent 70%);
          bottom: -10%;
          right: -5%;
          animation-delay: 2s;
        }

        .aura-3 {
          width: 300px;
          height: 300px;
          background: radial-gradient(circle, #FF9F0A 0%, transparent 70%);
          top: 40%;
          left: 50%;
          transform: translate(-50%, -50%);
          opacity: 0.4;
          animation-delay: 4s;
        }

        @keyframes float {
          0% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.95); }
          100% { transform: translate(0, 0) scale(1); }
        }

        /* Glassmorphism Nav */
        .glass-nav {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 40px;
          position: fixed;
          top: 0;
          width: 100%;
          z-index: 100;
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }

        .logo {
          font-weight: 800;
          font-size: 1.5rem;
          letter-spacing: -0.05em;
          color: var(--text-main);
        }

        .nav-links {
          display: flex;
          gap: 24px;
          align-items: center;
        }

        .nav-item {
          text-decoration: none;
          color: var(--text-muted);
          font-size: 0.9rem;
          font-weight: 500;
          transition: color 0.3s;
        }

        .nav-item:hover {
          color: var(--text-main);
        }

        .glass-button-sm {
          background: var(--glass-bg);
          border: 1px solid var(--glass-border);
          padding: 8px 16px;
          border-radius: 20px;
          font-weight: 600;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.3s ease;
          backdrop-filter: blur(4px);
          color: var(--text-main);
        }

        .glass-button-sm:hover {
          background: rgba(255, 255, 255, 0.6);
          box-shadow: 0 0 15px rgba(255, 59, 48, 0.3);
        }

        /* Hero Section */
        .hero-section {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          text-align: center;
          position: relative;
          padding: 0 20px;
          background-color: var(--bg-color);
        }

        .content-wrapper {
          position: relative;
          z-index: 10;
        }

        .glass-pill-label {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 14px;
          background: rgba(255, 255, 255, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.6);
          border-radius: 50px;
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--text-muted);
          margin-bottom: 24px;
          backdrop-filter: blur(4px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
        }

        .status-dot {
          width: 6px;
          height: 6px;
          background-color: #34C759;
          border-radius: 50%;
          box-shadow: 0 0 8px #34C759;
        }

        .hero-title {
          font-size: 5rem;
          line-height: 0.95;
          font-weight: 800;
          letter-spacing: -0.04em;
          margin-bottom: 24px;
          color: var(--text-main);
        }

        .text-red-gradient {
          background: linear-gradient(135deg, var(--bands-red), var(--bands-dark-red));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          position: relative;
          display: inline-block;
        }

        .text-red-gradient::after {
          content: 'RAIN';
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          height: 100%;
          background: inherit;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          filter: blur(12px);
          opacity: 0.4;
          z-index: -1;
        }

        .hero-sub {
          font-size: 1.25rem;
          color: var(--text-muted);
          max-width: 500px;
          margin: 0 auto 40px;
          line-height: 1.5;
        }

        .break {
          display: block;
          color: var(--text-main);
          font-weight: 500;
          margin-top: 8px;
        }

        /* CTA Buttons */
        .cta-group {
          display: flex;
          gap: 16px;
          justify-content: center;
          flex-wrap: wrap;
        }

        .glass-button-lg {
          position: relative;
          background: rgba(255, 255, 255, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.8);
          padding: 16px 48px;
          border-radius: 50px;
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--bands-dark-red);
          cursor: pointer;
          overflow: hidden;
          backdrop-filter: blur(10px);
          box-shadow: 0 20px 40px rgba(215, 0, 21, 0.15), inset 0 0 0 1px rgba(255, 255, 255, 0.5);
          transition: transform 0.2s, background 0.2s;
        }

        .glass-button-lg:hover {
          transform: scale(1.02);
          background: rgba(255, 255, 255, 0.4);
        }

        .shine {
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
          50% { left: 100%; }
          100% { left: 100%; }
        }

        .glass-button-secondary {
          background: transparent;
          border: 1px solid transparent;
          padding: 16px 32px;
          border-radius: 50px;
          font-size: 1rem;
          font-weight: 500;
          color: var(--text-muted);
          cursor: pointer;
          transition: color 0.2s;
        }

        .glass-button-secondary:hover {
          color: var(--text-main);
        }

        /* Floating Card */
        .floating-card {
          position: absolute;
          right: 15%;
          bottom: 20%;
          width: 220px;
          background: rgba(255, 255, 255, 0.15);
          border: 1px solid rgba(255, 255, 255, 0.4);
          border-radius: 24px;
          padding: 20px;
          backdrop-filter: blur(12px);
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.05);
          transform: rotate(-5deg);
          animation: float 8s infinite ease-in-out reverse;
          z-index: 10;
        }

        .card-row {
          display: flex;
          justify-content: space-between;
          font-weight: 600;
          margin-bottom: 12px;
          color: var(--text-main);
        }

        .value {
          color: #34C759;
        }

        .card-loader {
          width: 100%;
          height: 6px;
          background: rgba(0, 0, 0, 0.05);
          border-radius: 10px;
          overflow: hidden;
        }

        .loader-bar {
          width: 60%;
          height: 100%;
          background: var(--bands-red);
          border-radius: 10px;
          animation: loading 2s infinite ease-in-out;
        }

        @keyframes loading {
          0% { width: 40%; }
          50% { width: 80%; }
          100% { width: 40%; }
        }

        /* Mobile Responsiveness */
        @media (max-width: 768px) {
          .hero-title {
            font-size: 3.5rem;
          }
          .floating-card {
            display: none;
          }
          .glass-nav {
            padding: 16px 20px;
          }
          .nav-item {
            display: none;
          }
          .aura-1 {
            width: 400px;
            height: 400px;
          }
          .aura-2 {
            width: 350px;
            height: 350px;
          }
        }
      `}</style>
    </>
  )
}
