'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Loader2 } from 'lucide-react'
import { motion, useMotionValue, useMotionTemplate } from 'framer-motion'
import IOSLandingPage from '@/components/landing/IOSLandingPage'

// Feature card data
const featureCardsData = [
  {
    logo: "https://pbs.twimg.com/profile_images/1902346061005676544/e6WybE_v_400x400.jpg",
    title: "EMAIL LOGIN & EMBEDDED WALLET",
    body: "Powered by Privy. Self-custodial wallet architecture.",
  },
  {
    logo: "https://pbs.twimg.com/profile_images/1960334543052816384/ejODKCzq_400x400.jpg",
    title: "CROSSCHAIN SWAPS",
    body: "Instant bridging across chains powered by Relay Protocol.",
  },
  {
    logo: "https://pbs.twimg.com/profile_images/1930600293915410432/dgTU7UNU_400x400.jpg",
    title: "EMBEDDED DEFI YIELDS",
    body: "Earn yield on stables powered by Morpho Optimizer.",
  },
  {
    logo: "https://www.svgrepo.com/show/393995/apple-pay.svg",
    title: "EASY ONRAMP WITH APPLE PAY",
    body: "Seamless Fiat to Stablecoin deposits.",
    isApplePay: true,
  },
]

// Animation variants
const staggerContainer = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.3 },
  },
}

const scrollReveal = {
  hidden: { opacity: 0, y: 50, filter: "blur(5px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.8, ease: "easeOut" as const },
  },
}

// SplitText component for character-by-character animation
function SplitText({ children, className = "" }: { children: string; className?: string }) {
  return (
    <span className={className} style={{ display: "inline-block" }}>
      {children.split("").map((char, i) => (
        <motion.span
          key={i}
          style={{ display: "inline-block" }}
          variants={{
            hidden: { y: "100%", opacity: 0 },
            visible: { y: 0, opacity: 1 },
          }}
          transition={{ duration: 0.5, ease: [0.2, 0.65, 0.3, 0.9] }}
        >
          {char === " " ? "\u00A0" : char}
        </motion.span>
      ))}
    </span>
  )
}

// FlashlightCard with mouse-following glow effect
function FlashlightCard({
  children,
  className = "",
  glowColor = "rgba(255, 59, 48, 0.15)"
}: {
  children: React.ReactNode
  className?: string
  glowColor?: string
}) {
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)
  const [isHovered, setIsHovered] = useState(false)

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const { left, top } = e.currentTarget.getBoundingClientRect()
    mouseX.set(e.clientX - left)
    mouseY.set(e.clientY - top)
  }

  return (
    <div
      className={`feature-card ${className}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Flashlight glow effect */}
      <motion.div
        className="flashlight-glow"
        style={{
          background: useMotionTemplate`radial-gradient(600px circle at ${mouseX}px ${mouseY}px, ${glowColor}, transparent 40%)`,
          opacity: isHovered ? 1 : 0,
        }}
      />
      {/* Top edge highlight */}
      <div className="top-highlight" />
      {/* Content */}
      <div className="card-content">
        {children}
      </div>
    </div>
  )
}

export default function Home() {
  const { isAuthenticated, address, isReady, login, isLoginDisabled } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const hasNavigatedRef = useRef(false)
  const [isLoggingIn, setIsLoggingIn] = useState(false)

  // Check if running in iOS app via query param
  const isIOSApp = searchParams.get('app') === 'ios'

  // Global mouse tracking for red glow effect
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set(e.clientX)
      mouseY.set(e.clientY)
    }
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [mouseX, mouseY])

  // Redirect to dashboard when connected
  useEffect(() => {
    if (isReady && isAuthenticated && address && !hasNavigatedRef.current) {
      hasNavigatedRef.current = true
      router.replace('/dashboard')
    }
  }, [isAuthenticated, address, isReady, router])

  // Show iOS-specific landing page for native app
  if (isIOSApp) {
    return <IOSLandingPage />
  }

  const handleLogin = async () => {
    setIsLoggingIn(true)
    try {
      login()
    } catch (error) {
      console.error('Login error:', error)
    } finally {
      setTimeout(() => setIsLoggingIn(false), 1000)
    }
  }

  // Triple the cards for seamless infinite scroll
  const marqueeCards = [...featureCardsData, ...featureCardsData, ...featureCardsData]

  return (
    <div className="landing-page">
      {/* Subtle Grid Background */}
      <div className="grid-background" />

      {/* Mouse-following Red Glow */}
      <motion.div
        className="mouse-glow"
        style={{
          background: useMotionTemplate`radial-gradient(800px circle at ${mouseX}px ${mouseY}px, rgba(255, 59, 48, 0.08), transparent 40%)`,
        }}
      />

      {/* Master Container */}
      <div className="master-container">
        {/* Navigation */}
        <motion.nav
          className="navbar"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <div className="logo">
            <span className="logo-icon">$</span>
            <span className="logo-text">bands</span>
          </div>
          <motion.button
            className="sign-in-btn"
            onClick={handleLogin}
            disabled={!isReady || isLoggingIn}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {isLoggingIn ? '[ ... ]' : '[ SIGN IN ]'}
          </motion.button>
        </motion.nav>

        {/* Hero Section */}
        <motion.main
          className="hero"
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
        >
          <h1 className="hero-title">
            <div style={{ overflow: "hidden" }}>
              <SplitText>SPEND.</SplitText>
            </div>
            <div style={{ overflow: "hidden" }}>
              <SplitText>SAVE.</SplitText>
            </div>
            <div style={{ overflow: "hidden", marginTop: 10 }}>
              <motion.span
                className="speculate"
                variants={{
                  hidden: { y: "100%", opacity: 0 },
                  visible: { y: 0, opacity: 1 },
                }}
                transition={{ duration: 0.6, ease: [0.2, 0.65, 0.3, 0.9], delay: 0.4 }}
              >
                SPECULATE.
              </motion.span>
            </div>
          </h1>

          <motion.div className="subheading" variants={scrollReveal}>
            <span className="def-text">STABLECOIN NEOBANK DESIGNED FOR DEGENS.</span>
          </motion.div>

          <motion.button
            className="main-cta"
            onClick={handleLogin}
            disabled={!isReady || isLoggingIn}
            variants={scrollReveal}
            whileHover={{ y: -4, boxShadow: "0 20px 40px rgba(255, 59, 48, 0.4)" }}
            whileTap={{ scale: 0.98 }}
          >
            <span className="zip-tie" />
            <span className="cta-content">
              <span className="cta-arrow">→</span>
              {isLoggingIn ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  CONNECTING...
                </>
              ) : (
                <>SIGN IN WITH EMAIL</>
              )}
            </span>
          </motion.button>
        </motion.main>

        {/* Features Section */}
        <motion.section
          className="features-section"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
        >
          <motion.div className="section-label" variants={scrollReveal}>
            (FEATURES)
          </motion.div>

          <div className="marquee-mask">
            <motion.div
              className="marquee-track"
              animate={{ x: ["0%", "-33.33%"] }}
              transition={{
                duration: 25,
                repeat: Infinity,
                ease: "linear",
              }}
            >
              {marqueeCards.map((card, i) => (
                <FlashlightCard key={i}>
                  <div className={`card-icon ${card.isApplePay ? 'apple-pay' : ''}`}>
                    <img
                      src={card.logo}
                      alt={card.title}
                      className={card.isApplePay ? 'apple-pay-logo' : ''}
                    />
                  </div>
                  <h3 className="card-title">{card.title}</h3>
                  <p className="card-body">{card.body}</p>
                </FlashlightCard>
              ))}
            </motion.div>
          </div>
        </motion.section>
      </div>

      <style jsx global>{`
        .landing-page {
          --brand-red: #FF3B30;
          --off-white: #f0f0f0;
          --industrial-grey: #8c8c8c;
          --tape-grey: rgba(255,255,255,0.2);
          --glass-bg: linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%);
          --glass-border: rgba(255,255,255,0.12);

          min-height: 100vh;
          min-height: 100dvh;
          width: 100%;
          background-color: #050505;
          color: var(--off-white);
          font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
          text-transform: uppercase;
          letter-spacing: 1px;
          overflow-x: hidden;
          position: relative;
        }

        /* Subtle Grid Background */
        .landing-page .grid-background {
          position: fixed;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
          background-size: 50px 50px;
          z-index: 0;
          pointer-events: none;
        }

        /* Mouse-following Red Glow */
        .landing-page .mouse-glow {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
          z-index: 0;
          filter: blur(60px);
          pointer-events: none;
        }

        /* Master Container */
        .landing-page .master-container {
          width: 90%;
          max-width: 1100px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          z-index: 10;
          position: relative;
          padding-bottom: 100px;
        }

        /* Navigation */
        .landing-page .navbar {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          width: 100%;
          padding: 32px 0;
          padding-top: calc(32px + env(safe-area-inset-top, 0px));
          border-bottom: 1px dashed var(--tape-grey);
        }

        .landing-page .logo {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .landing-page .logo-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          background: var(--brand-red);
          border-radius: 10px;
          color: white;
          font-weight: 800;
          font-size: 20px;
        }

        .landing-page .logo-text {
          font-weight: 700;
          font-size: 24px;
          letter-spacing: -0.5px;
          color: var(--off-white);
          text-transform: lowercase;
        }

        .landing-page .sign-in-btn {
          padding: 12px 24px;
          background-color: rgba(255, 59, 48, 0.1);
          border: 1px solid var(--brand-red);
          color: var(--brand-red);
          font-weight: 700;
          font-size: 12px;
          cursor: pointer;
          font-family: monospace;
          border-radius: 4px;
          backdrop-filter: blur(4px);
          transition: background-color 0.2s;
        }

        .landing-page .sign-in-btn:hover {
          background-color: rgba(255, 59, 48, 0.2);
        }

        .landing-page .sign-in-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* Hero Section */
        .landing-page .hero {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          width: 100%;
          padding-top: 80px;
          margin-bottom: 120px;
        }

        .landing-page .hero-title {
          font-size: clamp(48px, 10vw, 90px);
          line-height: 0.9;
          font-weight: 900;
          letter-spacing: -4px;
          margin: 0 0 32px 0;
          color: var(--off-white);
        }

        .landing-page .speculate {
          color: var(--brand-red);
          text-shadow: 4px 4px 0px #000, -2px -2px 10px var(--brand-red);
          border-bottom: 6px solid var(--brand-red);
          padding: 0 10px;
          display: inline-block;
          transform: rotate(-2deg);
        }

        /* Subheading */
        .landing-page .subheading {
          font-size: 16px;
          color: var(--off-white);
          font-weight: 600;
          max-width: 600px;
          margin-bottom: 50px;
          font-family: monospace;
          border: 1px solid var(--tape-grey);
          padding: 16px;
          display: flex;
          align-items: center;
          gap: 12px;
          background: rgba(0,0,0,0.3);
          backdrop-filter: blur(4px);
          border-radius: 12px;
          flex-wrap: wrap;
          justify-content: center;
        }

        .landing-page .def-label {
          background: var(--brand-red);
          color: black;
          padding: 3px 6px;
          font-size: 9px;
          border-radius: 4px;
          letter-spacing: 1px;
        }

        .landing-page .def-text {
          text-align: center;
        }

        /* Main CTA */
        .landing-page .main-cta {
          position: relative;
          padding: 16px 32px;
          padding-left: 40px;
          background-color: var(--brand-red);
          border: 2px solid #000;
          clip-path: polygon(10% 0, 100% 0, 100% 100%, 10% 100%, 0 50%);
          color: #000;
          font-size: 20px;
          font-weight: 900;
          cursor: pointer;
          box-shadow: 0 10px 30px rgba(255, 59, 48, 0.3);
          font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
          text-transform: uppercase;
        }

        .landing-page .main-cta:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .landing-page .zip-tie {
          position: absolute;
          left: 15px;
          top: 50%;
          transform: translateY(-50%);
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #000;
          border: 2px solid var(--off-white);
          z-index: 3;
        }

        .landing-page .cta-content {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .landing-page .cta-arrow {
          background: #000;
          color: var(--brand-red);
          padding: 2px 6px;
          font-size: 12px;
        }

        /* Features Section */
        .landing-page .features-section {
          margin-bottom: 100px;
          width: 100%;
          position: relative;
        }

        .landing-page .section-label {
          font-family: monospace;
          color: var(--off-white);
          margin-bottom: 20px;
          font-weight: 700;
          font-size: 12px;
          letter-spacing: 2px;
        }

        /* Marquee */
        .landing-page .marquee-mask {
          width: 100%;
          overflow: hidden;
          padding: 20px 0;
          mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent);
          -webkit-mask-image: linear-gradient(to right, transparent, black 10%, black 90%, transparent);
        }

        .landing-page .marquee-track {
          display: flex;
          gap: 16px;
          width: max-content;
        }

        /* Feature Card */
        .landing-page .feature-card {
          width: 240px;
          min-width: 240px;
          height: 320px;
          min-height: 320px;
          background: var(--glass-bg);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid var(--glass-border);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
          border-radius: 24px;
          position: relative;
          overflow: hidden;
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        }

        .landing-page .feature-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
        }

        .landing-page .feature-card .flashlight-glow {
          position: absolute;
          inset: 0;
          border-radius: inherit;
          pointer-events: none;
          z-index: 1;
          transition: opacity 0.3s ease;
        }

        .landing-page .feature-card .top-highlight {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
          z-index: 2;
        }

        .landing-page .feature-card .card-content {
          position: relative;
          z-index: 3;
          padding: 24px;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
        }

        .landing-page .card-icon {
          width: 48px;
          height: 48px;
          background-color: #000;
          border: 2px solid var(--brand-red);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 16px;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 4px 12px rgba(255, 59, 48, 0.2);
          padding: 8px;
        }

        .landing-page .card-icon img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          filter: grayscale(100%) contrast(120%) opacity(0.8);
          transition: filter 0.3s ease;
        }

        .landing-page .feature-card:hover .card-icon img {
          filter: none;
        }

        .landing-page .card-icon img.apple-pay-logo {
          filter: invert(1) opacity(0.7);
        }

        .landing-page .feature-card:hover .card-icon img.apple-pay-logo {
          filter: invert(1) opacity(1);
        }

        .landing-page .card-title {
          font-size: 16px;
          font-weight: 900;
          margin-bottom: 12px;
          color: var(--off-white);
          background-color: var(--brand-red);
          padding: 4px 8px;
          display: inline-block;
          border-radius: 4px;
          text-transform: uppercase;
        }

        .landing-page .card-body {
          font-size: 12px;
          color: var(--off-white);
          line-height: 1.4;
          font-family: monospace;
          font-weight: 600;
          text-transform: uppercase;
        }

        /* === MOBILE RESPONSIVE === */
        @media (max-width: 768px) {
          .landing-page .master-container {
            width: 92%;
          }

          .landing-page .navbar {
            padding: 20px 0;
            padding-top: calc(20px + env(safe-area-inset-top, 0px));
            align-items: center;
          }

          .landing-page .logo-icon {
            width: 28px;
            height: 28px;
            font-size: 16px;
          }

          .landing-page .logo-text {
            font-size: 20px;
          }

          .landing-page .sign-in-btn {
            padding: 10px 16px;
            font-size: 10px;
          }

          .landing-page .hero {
            padding-top: 50px;
            margin-bottom: 80px;
          }

          .landing-page .hero-title {
            font-size: 48px;
            letter-spacing: -2px;
            margin-bottom: 24px;
          }

          .landing-page .speculate {
            border-bottom-width: 4px;
            padding: 0 6px;
          }

          .landing-page .subheading {
            font-size: 12px;
            padding: 12px;
            margin-bottom: 32px;
            gap: 8px;
          }

          .landing-page .def-label {
            font-size: 8px;
          }

          .landing-page .main-cta {
            font-size: 14px;
            padding: 14px 24px;
            padding-left: 32px;
          }

          .landing-page .zip-tie {
            left: 12px;
            width: 6px;
            height: 6px;
          }

          .landing-page .cta-arrow {
            font-size: 10px;
            padding: 2px 4px;
          }

          .landing-page .features-section {
            margin-bottom: 60px;
          }

          .landing-page .section-label {
            font-size: 10px;
          }

          .landing-page .feature-card {
            width: 200px;
            min-width: 200px;
            height: 280px;
            min-height: 280px;
          }

          .landing-page .feature-card .card-content {
            padding: 20px;
          }

          .landing-page .card-icon {
            width: 40px;
            height: 40px;
            padding: 6px;
          }

          .landing-page .card-title {
            font-size: 13px;
            padding: 3px 6px;
          }

          .landing-page .card-body {
            font-size: 11px;
          }
        }

        /* Extra small screens */
        @media (max-width: 480px) {
          .landing-page .hero-title {
            font-size: 38px;
            letter-spacing: -1.5px;
          }

          .landing-page .subheading {
            font-size: 11px;
            flex-direction: column;
            gap: 8px;
          }

          .landing-page .main-cta {
            font-size: 12px;
            padding: 12px 20px;
            padding-left: 28px;
          }

          .landing-page .feature-card {
            width: 180px;
            min-width: 180px;
            height: 260px;
            min-height: 260px;
          }

          .landing-page .feature-card .card-content {
            padding: 16px;
          }

          .landing-page .card-title {
            font-size: 12px;
          }

          .landing-page .card-body {
            font-size: 10px;
          }
        }
      `}</style>
    </div>
  )
}
