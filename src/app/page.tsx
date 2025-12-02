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
      {/* Subtle gradient overlay */}
      <div className="gradient-overlay" />

      {/* Navigation */}
      <header className="navbar">
        <div className="logo">
          <div className="logo-icon">$</div>
          <span>bands</span>
        </div>
        <nav className="nav-links">
          <a href="#features" className="nav-link">Features</a>
          <a href="#transparency" className="nav-link">Transparency</a>
          <button onClick={login} className="btn btn-connect">Connect</button>
        </nav>
      </header>

      {/* Hero Section */}
      <main className="hero">
        <div className="hero-content">
          <div className="status-pill">
            <span className="status-dot" />
            Live on Base
          </div>
          
          <h1 className="hero-title">
            Your money,<br />
            <span className="text-gradient">upgraded</span>
          </h1>
          
          <p className="subtitle">
            The stablecoin neobank for degens.<br />
            Spend. Save. Speculate.
          </p>
          
          <div className="cta-group">
            <button onClick={login} className="btn btn-primary">
              <svg className="apple-icon" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              Download on iOS
            </button>
            <button onClick={login} className="btn btn-secondary">
              Open Web App
            </button>
          </div>
        </div>

        {/* Hero Phone Image */}
        <div className="hero-image-container">
          {/* Placeholder for the composite image - replace with actual image */}
          <div className="phone-mockup">
            <div className="phone-frame">
              <div className="phone-notch" />
              <div className="phone-screen">
                {/* Bands UI Preview */}
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
                  <button className="action-btn add-funds">+ Add Funds</button>
                  <div className="action-row">
                    <div className="action-item">↑ Send</div>
                    <div className="action-item">↓ Receive</div>
                    <div className="action-item">🛒 Buy</div>
                  </div>
                </div>
              </div>
            </div>
            {/* Concrete texture effect */}
            <div className="concrete-surface" />
          </div>
        </div>
      </main>

      {/* Features Section */}
      <section id="features" className="features-section">
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">⚡</div>
            <h3>Instant Transfers</h3>
            <p>Send USDC anywhere in seconds. No banks, no delays.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🔐</div>
            <h3>Self-Custody</h3>
            <p>Your keys, your money. Always in control.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">📈</div>
            <h3>Earn Yield</h3>
            <p>Put your stables to work with DeFi integrations.</p>
          </div>
        </div>
      </section>

      <style jsx global>{`
        .landing-page {
          --bg-color: #000000;
          --bg-secondary: #0a0a0a;
          --text-primary: #ffffff;
          --text-secondary: #888888;
          --accent-red: #FF3B30;
          --accent-red-dark: #D70015;
          --nav-height: 80px;
          
          min-height: 100vh;
          width: 100%;
          background-color: var(--bg-color);
          color: var(--text-primary);
          font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
          overflow-x: hidden;
        }

        /* Subtle gradient overlay */
        .landing-page .gradient-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: 
            radial-gradient(ellipse at 20% 0%, rgba(255, 59, 48, 0.08) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 100%, rgba(255, 59, 48, 0.05) 0%, transparent 50%);
          pointer-events: none;
          z-index: 0;
        }

        /* Navigation */
        .landing-page .navbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 48px;
          height: var(--nav-height);
          width: 100%;
          position: fixed;
          top: 0;
          left: 0;
          z-index: 100;
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .landing-page .logo {
          display: flex;
          align-items: center;
          gap: 12px;
          font-weight: 700;
          font-size: 1.3rem;
          letter-spacing: -0.02em;
        }

        .landing-page .logo-icon {
          width: 36px;
          height: 36px;
          background: var(--accent-red);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 1.1rem;
          box-shadow: 0 0 20px rgba(255, 59, 48, 0.4);
        }

        .landing-page .nav-links {
          display: flex;
          align-items: center;
          gap: 32px;
        }

        .landing-page .nav-link {
          color: var(--text-secondary);
          text-decoration: none;
          font-size: 0.95rem;
          font-weight: 500;
          transition: color 0.2s;
        }

        .landing-page .nav-link:hover {
          color: var(--text-primary);
        }

        /* Buttons */
        .landing-page .btn {
          padding: 14px 28px;
          border-radius: 50px;
          font-weight: 600;
          font-size: 0.95rem;
          cursor: pointer;
          transition: all 0.2s ease;
          border: none;
          display: inline-flex;
          align-items: center;
          gap: 10px;
        }

        .landing-page .btn-connect {
          background: var(--accent-red);
          color: white;
        }

        .landing-page .btn-connect:hover {
          background: var(--accent-red-dark);
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(255, 59, 48, 0.3);
        }

        .landing-page .btn-primary {
          background: var(--accent-red);
          color: white;
          font-size: 1.1rem;
          padding: 18px 36px;
          box-shadow: 0 8px 32px rgba(255, 59, 48, 0.3);
        }

        .landing-page .btn-primary:hover {
          background: var(--accent-red-dark);
          transform: translateY(-2px);
          box-shadow: 0 12px 40px rgba(255, 59, 48, 0.4);
        }

        .landing-page .btn-secondary {
          background: rgba(255, 255, 255, 0.08);
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.15);
          font-size: 1.1rem;
          padding: 18px 36px;
        }

        .landing-page .btn-secondary:hover {
          background: rgba(255, 255, 255, 0.12);
          border-color: rgba(255, 255, 255, 0.25);
        }

        .landing-page .apple-icon {
          width: 20px;
          height: 20px;
        }

        /* Hero Section */
        .landing-page .hero {
          min-height: 100vh;
          padding-top: calc(var(--nav-height) + 80px);
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          position: relative;
          z-index: 1;
        }

        .landing-page .hero-content {
          max-width: 900px;
          padding: 0 24px;
          margin-bottom: 60px;
        }

        .landing-page .status-pill {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 10px 20px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 50px;
          font-size: 0.85rem;
          font-weight: 500;
          color: var(--text-secondary);
          margin-bottom: 32px;
        }

        .landing-page .status-dot {
          width: 8px;
          height: 8px;
          background: #34C759;
          border-radius: 50%;
          box-shadow: 0 0 12px #34C759;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(0.9); }
        }

        .landing-page .hero-title {
          font-size: clamp(3.5rem, 10vw, 6rem);
          font-weight: 700;
          letter-spacing: -0.03em;
          line-height: 1.05;
          margin-bottom: 24px;
        }

        .landing-page .text-gradient {
          background: linear-gradient(135deg, var(--accent-red) 0%, #FF6B6B 50%, var(--accent-red) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .landing-page .subtitle {
          font-size: 1.35rem;
          color: var(--text-secondary);
          line-height: 1.6;
          margin-bottom: 40px;
          max-width: 500px;
          margin-left: auto;
          margin-right: auto;
        }

        .landing-page .cta-group {
          display: flex;
          gap: 16px;
          justify-content: center;
          flex-wrap: wrap;
        }

        /* Hero Phone Mockup */
        .landing-page .hero-image-container {
          width: 100%;
          max-width: 500px;
          padding: 0 24px;
          position: relative;
        }

        .landing-page .phone-mockup {
          position: relative;
          perspective: 1000px;
        }

        .landing-page .phone-frame {
          width: 280px;
          height: 580px;
          background: #1a1a1a;
          border-radius: 44px;
          padding: 12px;
          margin: 0 auto;
          position: relative;
          box-shadow: 
            0 50px 100px rgba(0, 0, 0, 0.5),
            0 0 0 1px rgba(255, 255, 255, 0.1),
            inset 0 0 0 1px rgba(255, 255, 255, 0.05);
          transform: rotateX(5deg);
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
          margin-bottom: 32px;
        }

        .landing-page .app-logo {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          font-size: 1rem;
        }

        .landing-page .app-logo-icon {
          width: 28px;
          height: 28px;
          background: var(--accent-red);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.9rem;
        }

        .landing-page .app-balance {
          text-align: center;
          margin-bottom: 24px;
        }

        .landing-page .balance-label {
          display: block;
          font-size: 0.75rem;
          color: var(--text-secondary);
          margin-bottom: 4px;
        }

        .landing-page .balance-value {
          display: block;
          font-size: 2.2rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          margin-bottom: 4px;
        }

        .landing-page .balance-token {
          display: block;
          font-size: 0.75rem;
          color: var(--accent-red);
          font-weight: 500;
        }

        .landing-page .app-actions {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .landing-page .add-funds {
          width: 100%;
          padding: 14px;
          background: var(--accent-red);
          color: white;
          border: none;
          border-radius: 14px;
          font-weight: 600;
          font-size: 0.9rem;
          cursor: pointer;
        }

        .landing-page .action-row {
          display: flex;
          gap: 8px;
        }

        .landing-page .action-item {
          flex: 1;
          padding: 16px 8px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 14px;
          font-size: 0.7rem;
          color: var(--text-secondary);
          text-align: center;
        }

        .landing-page .concrete-surface {
          position: absolute;
          bottom: -40px;
          left: 50%;
          transform: translateX(-50%);
          width: 400px;
          height: 100px;
          background: linear-gradient(180deg, transparent 0%, rgba(60, 60, 60, 0.3) 100%);
          border-radius: 50%;
          filter: blur(20px);
        }

        /* Features Section */
        .landing-page .features-section {
          padding: 120px 24px;
          position: relative;
          z-index: 1;
        }

        .landing-page .features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 24px;
          max-width: 1000px;
          margin: 0 auto;
        }

        .landing-page .feature-card {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 24px;
          padding: 32px;
          transition: all 0.3s ease;
        }

        .landing-page .feature-card:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.1);
          transform: translateY(-4px);
        }

        .landing-page .feature-icon {
          font-size: 2rem;
          margin-bottom: 16px;
        }

        .landing-page .feature-card h3 {
          font-size: 1.2rem;
          font-weight: 600;
          margin-bottom: 8px;
        }

        .landing-page .feature-card p {
          color: var(--text-secondary);
          font-size: 0.95rem;
          line-height: 1.5;
        }

        /* Mobile Responsiveness */
        @media (max-width: 768px) {
          .landing-page .navbar {
            padding: 0 20px;
          }

          .landing-page .nav-link {
            display: none;
          }

          .landing-page .hero-title {
            font-size: 3rem;
          }

          .landing-page .subtitle {
            font-size: 1.1rem;
          }

          .landing-page .cta-group {
            flex-direction: column;
            width: 100%;
            padding: 0 20px;
          }

          .landing-page .btn-primary,
          .landing-page .btn-secondary {
            width: 100%;
            justify-content: center;
          }

          .landing-page .phone-frame {
            width: 240px;
            height: 500px;
          }
        }
      `}</style>
    </div>
  )
}
