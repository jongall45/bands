'use client'

import * as React from "react"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { useAuth } from "@/hooks/useAuth"
import haptics from "@/lib/haptics"

// --- STYLE CONSTANTS ---
const colors = {
    brandRed: "#FF3B30",
    offWhite: "#f0f0f0",
    brightWhite: "#ffffff",
    black: "#050505",
    tapeGrey: "rgba(255,255,255,0.2)",
    glassBg: "linear-gradient(145deg, rgba(20,20,20,0.9) 0%, rgba(10,10,10,0.95) 100%)",
    industrialGrey: "#8c8c8c",
}

const industrialFontStack = '"Helvetica Neue", Helvetica, Arial, sans-serif'
const noisePattern = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.04'/%3E%3C/svg%3E")`

// --- ANIMATED LOGO COMPONENT ---
const AnimatedLogo = ({ onAnimationComplete, onCardLand }: { onAnimationComplete?: () => void; onCardLand?: (index: number) => void }) => {
    // Track which cards have already triggered haptics
    const landedCardsRef = React.useRef<Set<number>>(new Set())

    // Card dimensions - smaller cards
    const cardWidth = 130
    const cardHeight = 55

    const paperVariants = {
        hidden: {
            y: -600,
            opacity: 0,
            rotate: Math.random() * 60 - 30,
            scale: 0.8
        },
        visible: (i: number) => ({
            y: 0,
            opacity: 1,
            // More aggressive rotation and offset for visual stagger
            rotate: (i % 2 === 0 ? 1 : -1) * (3 + i * 1.2),
            scale: 1,
            transition: {
                delay: 0.1 + (i * 0.1),  // Faster start, 1 second earlier overall
                duration: 0.6,
                type: "spring" as const,
                stiffness: 150,
                damping: 16,
            },
        }),
    }

    // Changed: Last card is now red instead of white
    const papers = [
        colors.brandRed, colors.offWhite,
        colors.brandRed, colors.offWhite,
        colors.brandRed, colors.brandRed
    ]

    // Trigger haptics DURING the fall animation (midpoint of fall)
    React.useEffect(() => {
        papers.forEach((_, i) => {
            const delay = 0.1 + (i * 0.1)  // Match the animation delay
            const hapticTiming = (delay + 0.25) * 1000  // Trigger at 250ms into the 600ms animation (during fall)

            const timer = setTimeout(() => {
                if (!landedCardsRef.current.has(i)) {
                    landedCardsRef.current.add(i)
                    onCardLand?.(i)
                }
            }, hapticTiming)

            return () => clearTimeout(timer)
        })

        // Trigger onAnimationComplete after all cards
        const totalDuration = (0.1 + (papers.length - 1) * 0.1 + 0.6) * 1000
        const completeTimer = setTimeout(() => {
            onAnimationComplete?.()
        }, totalDuration)

        return () => clearTimeout(completeTimer)
    }, [])

    return (
        <div style={{ position: "relative", width: 180, height: 160, display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 12 }}>
            {/* $ Logo centered above cards - positioned higher */}
            <motion.div
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.8, duration: 0.4, type: "spring" }}
                style={{
                    width: 36,
                    height: 36,
                    backgroundColor: colors.brandRed,
                    borderRadius: 9,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 6px 20px rgba(255, 59, 48, 0.4)',
                    marginBottom: 12,
                }}
            >
                <span style={{
                    color: colors.brightWhite,
                    fontSize: 20,
                    fontWeight: 800,
                    fontFamily: industrialFontStack,
                }}>$</span>
            </motion.div>

            {/* Cards container */}
            <div style={{ position: "relative", width: cardWidth, height: cardHeight + 25 }}>
                {papers.map((color, i) => {
                    const isTopPaper = i === papers.length - 1;
                    const isRed = color === colors.brandRed;
                    // Add vertical offset for visual stacking effect
                    const yOffset = (papers.length - 1 - i) * 4;

                    return (
                        <motion.div
                            key={i}
                            custom={i}
                            variants={paperVariants}
                            initial="hidden"
                            animate="visible"
                            style={{
                                position: "absolute",
                                width: cardWidth,
                                height: cardHeight,
                                backgroundColor: color,
                                border: isRed ? `1px solid rgba(255,255,255,0.1)` : `1px solid ${colors.brightWhite}`,
                                boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
                                zIndex: i,
                                borderRadius: "3px",
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                top: yOffset,
                            }}
                        >
                            {isTopPaper && (
                                <motion.div
                                    initial={{ opacity: 0, filter: "blur(8px)" }}
                                    animate={{ opacity: 1, filter: "blur(0px)" }}
                                    transition={{ delay: 1.0, duration: 0.3 }}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6,
                                    }}
                                >
                                    <span style={{
                                        fontWeight: 700,
                                        fontSize: "26px",
                                        letterSpacing: "-1px",
                                        color: colors.brightWhite,
                                        fontFamily: industrialFontStack,
                                        lineHeight: 1,
                                        textTransform: 'lowercase',
                                    }}>
                                        bands
                                    </span>
                                </motion.div>
                            )}
                        </motion.div>
                    )
                })}
            </div>
        </div>
    )
}

// --- CARD COMPONENTS ---

const FlashlightCard = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => {
    return (
        <div
            style={{
                position: "relative",
                background: colors.glassBg,
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: `1px solid rgba(255, 255, 255, 0.4)`,
                borderRadius: "16px",
                overflow: "hidden",
                display: 'flex',
                flexDirection: 'column',
                flexShrink: 0,
                boxShadow: `inset 0 1px 1px rgba(255,255,255,0.2), 0 15px 35px rgba(0,0,0,0.7)`,
                ...style,
            }}
        >
             <div style={{position: 'absolute', inset: 0, backgroundImage: noisePattern, opacity: 0.1, pointerEvents: 'none', zIndex: 0}} />
             <div style={{position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)', zIndex: 1}} />

            <div style={{ position: "relative", zIndex: 2, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                {children}
            </div>
        </div>
    )
}

interface FeatureCard {
    logo: string;
    title: string;
    body: string;
}

const FeatureCardItem = ({ card }: { card: FeatureCard }) => {
    const isApplePay = card.title.includes("APPLE");

    return (
        <FlashlightCard style={cardStyle}>
            <div style={iconBoxStyle}>
                <img
                    src={card.logo}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        filter: isApplePay ? 'invert(1)' : 'none',
                    }}
                    alt={card.title}
                />
            </div>
            <h3 style={cardTitleStyle}>{card.title}</h3>
            <p style={{...cardBodyStyle, fontSize: "11px"}}>{card.body}</p>
        </FlashlightCard>
    );
};

// --- DATA ---
const featureCardsData: FeatureCard[] = [
    {
        logo: "https://pbs.twimg.com/profile_images/1902346061005676544/e6WybE_v_400x400.jpg",
        title: "EMAIL LOGIN",
        body: "Self-custodial wallet architecture.",
    },
    {
        logo: "https://pbs.twimg.com/profile_images/1960334543052816384/ejODKCzq_400x400.jpg",
        title: "CROSSCHAIN",
        body: "Instant bridging via Relay.",
    },
    {
        logo: "https://pbs.twimg.com/profile_images/1930600293915410432/dgTU7UNU_400x400.jpg",
        title: "DEFI YIELDS",
        body: "Earn yield on stables.",
    },
    {
        logo: "https://upload.wikimedia.org/wikipedia/commons/b/b0/Apple_Pay_logo.svg",
        title: "APPLE PAY",
        body: "Fiat to Stablecoin.",
    },
]

// --- MAIN COMPONENT ---

export default function IOSLandingPage() {
    const { isAuthenticated, address, isReady, login } = useAuth()
    const router = useRouter()
    const hasNavigatedRef = useRef(false)
    const [showContent, setShowContent] = useState(false)

    // Check if OAuth params are in URL (processing login)
    const hasOAuthParams = typeof window !== 'undefined' &&
        window.location.search.includes('privy_oauth_code')

    // Redirect to dashboard when connected
    useEffect(() => {
        if (isReady && isAuthenticated && address && !hasNavigatedRef.current) {
            hasNavigatedRef.current = true
            router.replace('/dashboard?app=ios')
        }
    }, [isAuthenticated, address, isReady, router])

    // Only show content after checking auth state
    useEffect(() => {
        if (isReady && !isAuthenticated && !hasOAuthParams) {
            // Small delay to ensure we're not about to redirect
            const timer = setTimeout(() => {
                setShowContent(true)
                haptics.impact('medium')
            }, 100)
            return () => clearTimeout(timer)
        }
    }, [isReady, isAuthenticated, hasOAuthParams])

    // Haptic feedback for each card landing
    const handleCardLand = (index: number) => {
        // Stronger haptic for each card impact
        haptics.impact('heavy')
    }

    // Haptic on logo animation complete
    const handleLogoComplete = () => {
        haptics.impact('heavy')
    }

    const handleLogin = (method?: 'apple' | 'email') => {
        if (!isReady) return
        haptics.buttonPress()
        login()
    }

    // Show loading while checking auth, processing OAuth, or already authenticated
    if (!isReady || hasOAuthParams || (isAuthenticated && address) || !showContent) {
        return (
            <div style={{
                ...pageBackgroundStyle,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        width: 40,
                        height: 40,
                        border: '3px solid rgba(255, 59, 48, 0.3)',
                        borderTopColor: colors.brandRed,
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                        margin: '0 auto 16px',
                    }} />
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    <p style={{ color: colors.offWhite, fontSize: 14, fontFamily: industrialFontStack }}>
                        {hasOAuthParams ? 'COMPLETING LOGIN...' : 'LOADING...'}
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div style={pageBackgroundStyle}>
            <div style={gridBackgroundStyle} />
            <div style={crosshairOverlayStyle} />

            <div style={masterContainerStyle}>

                {/* 1. ANIMATED LOGO */}
                <AnimatedLogo onAnimationComplete={handleLogoComplete} onCardLand={handleCardLand} />

                {/* 2. COMPACT FEATURE MARQUEE */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 2.0, duration: 1 }}
                    style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                >
                    <div style={marqueeMaskStyle}>
                        <motion.div
                            style={{
                                display: "flex",
                                gap: "20px",
                                width: "max-content",
                                padding: "10px 0"
                            }}
                            animate={{ x: ["0%", "-50%"] }}
                            transition={{
                                duration: 25,
                                repeat: Infinity,
                                ease: "linear",
                            }}
                        >
                            {[...featureCardsData, ...featureCardsData, ...featureCardsData].map((card, i) => (
                                <FeatureCardItem key={i} card={card} />
                            ))}
                        </motion.div>
                    </div>
                </motion.div>

                {/* 3. CTA SECTION - Two Sign In Buttons */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 2.3, duration: 0.6 }}
                    style={{ marginTop: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: 12, maxWidth: 280 }}
                >
                    {/* Apple Sign In Button - White */}
                    <motion.button
                        type="button"
                        style={{
                            width: '100%',
                            padding: '14px 24px',
                            backgroundColor: colors.brightWhite,
                            border: 'none',
                            borderRadius: 12,
                            color: colors.black,
                            fontSize: 16,
                            fontWeight: 600,
                            fontFamily: industrialFontStack,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 10,
                            cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                            opacity: !isReady ? 0.7 : 1,
                        }}
                        onClick={() => handleLogin('apple')}
                        disabled={!isReady}
                        whileTap={{ scale: 0.96 }}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                        </svg>
                        Sign in with Apple
                    </motion.button>

                    {/* Email Sign In Button - Black/Dark */}
                    <motion.button
                        type="button"
                        style={{
                            width: '100%',
                            padding: '14px 24px',
                            backgroundColor: colors.black,
                            border: `1px solid ${colors.tapeGrey}`,
                            borderRadius: 12,
                            color: colors.brightWhite,
                            fontSize: 16,
                            fontWeight: 600,
                            fontFamily: industrialFontStack,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 10,
                            cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                            opacity: !isReady ? 0.7 : 1,
                        }}
                        onClick={() => handleLogin('email')}
                        disabled={!isReady}
                        whileTap={{ scale: 0.96 }}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="4" width="20" height="16" rx="2"/>
                            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                        </svg>
                        Sign in with Email
                    </motion.button>
                </motion.div>

            </div>
        </div>
    )
}

// --- STYLES ---

const pageBackgroundStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    width: "100%",
    height: "100%",
    backgroundColor: colors.black,
    color: colors.offWhite,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    fontFamily: industrialFontStack,
    textTransform: "uppercase",
    letterSpacing: "1px",
    paddingTop: "env(safe-area-inset-top, 0px)",
    paddingBottom: "env(safe-area-inset-bottom, 0px)",
    zIndex: 0,
    isolation: "isolate",
}

const masterContainerStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: "600px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    padding: "20px",
}

const gridBackgroundStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    backgroundImage: `
        linear-gradient(${colors.tapeGrey} 1px, transparent 1px),
        linear-gradient(90deg, ${colors.tapeGrey} 1px, transparent 1px)
    `,
    backgroundSize: "40px 40px",
    zIndex: 0,
    pointerEvents: "none",
    opacity: 0.6
}

const crosshairOverlayStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    backgroundImage: `radial-gradient(circle at center, transparent 20%, ${colors.black} 90%)`,
    zIndex: 0,
    pointerEvents: "none",
}

// CARD STYLES
const cardStyle: React.CSSProperties = {
    width: "160px",
    minWidth: "160px",
    height: "180px",
    padding: "20px",
    backgroundColor: "transparent",
}

const iconBoxStyle: React.CSSProperties = {
    width: "40px",
    height: "40px",
    backgroundColor: colors.black,
    border: `1px solid rgba(255,255,255,0.5)`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "12px",
    borderRadius: "8px",
    boxShadow: `0 4px 12px rgba(0,0,0,0.4)`,
    padding: "6px",
}

const cardTitleStyle: React.CSSProperties = {
    fontSize: "12px",
    fontWeight: 900,
    marginBottom: "6px",
    color: colors.offWhite,
    backgroundColor: colors.brandRed,
    padding: "3px 6px",
    borderRadius: "2px",
    display: "inline-block",
    boxShadow: `0 2px 4px rgba(0,0,0,0.3)`
}

const cardBodyStyle: React.CSSProperties = {
    fontSize: "9px",
    color: colors.offWhite,
    lineHeight: "1.4",
    fontFamily: "monospace",
    fontWeight: 600,
    opacity: 0.9
}

const marqueeMaskStyle: React.CSSProperties = {
    width: "100%",
    overflow: "hidden",
    padding: "10px 0",
    maskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
    WebkitMaskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
}

