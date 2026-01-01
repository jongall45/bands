'use client'

import * as React from "react"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { useAuth } from "@/hooks/useAuth"
import { Loader2 } from "lucide-react"

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
const AnimatedLogo = () => {
    const paperVariants = {
        hidden: {
            y: -800,
            opacity: 0,
            rotate: Math.random() * 90 - 45,
            scale: 0.8
        },
        visible: (i: number) => ({
            y: 0,
            opacity: 1,
            rotate: i % 2 === 0 ? Math.random() * 3 + 1 : -(Math.random() * 3 + 1),
            scale: 1,
            transition: {
                delay: 0.2 + (i * 0.12),
                duration: 0.8,
                type: "spring" as const,
                stiffness: 120,
                damping: 18,
            },
        }),
    }

    const papers = [
        colors.brandRed, colors.offWhite,
        colors.brandRed, colors.offWhite,
        colors.brandRed, colors.offWhite
    ]

    return (
        <div style={{ position: "relative", width: 300, height: 160, display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: 30 }}>
            {papers.map((color, i) => {
                const isTopPaper = i === papers.length - 1;
                const isWhite = color === colors.offWhite;

                return (
                    <motion.div
                        key={i}
                        custom={i}
                        variants={paperVariants}
                        initial="hidden"
                        animate="visible"
                        style={{
                            position: "absolute",
                            width: 280,
                            height: 120,
                            backgroundColor: color,
                            border: isWhite ? `1px solid ${colors.brightWhite}` : `1px solid rgba(255,255,255,0.1)`,
                            boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
                            zIndex: i,
                            borderRadius: "4px",
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        {isTopPaper && (
                            <motion.span
                                initial={{ opacity: 0, filter: "blur(10px)" }}
                                animate={{ opacity: 1, filter: "blur(0px)" }}
                                transition={{ delay: 1.5, duration: 0.4 }}
                                style={{
                                    fontWeight: 900,
                                    fontSize: "64px",
                                    letterSpacing: "-4px",
                                    color: colors.brandRed,
                                    fontFamily: industrialFontStack,
                                    fontStyle: "italic",
                                    lineHeight: 1,
                                    marginTop: -6,
                                    textShadow: `
                                        -2px -2px 0 ${colors.brightWhite},
                                        2px -2px 0 ${colors.brightWhite},
                                        -2px 2px 0 ${colors.brightWhite},
                                        2px 2px 0 ${colors.brightWhite},
                                        0 0 20px ${colors.brandRed},
                                        0 0 40px ${colors.brandRed}
                                    `,
                                    WebkitTextStroke: `2px ${colors.brightWhite}`,
                                }}
                            >
                                BANDS
                            </motion.span>
                        )}
                    </motion.div>
                )
            })}
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
    const [isLoggingIn, setIsLoggingIn] = useState(false)

    // Redirect to dashboard when connected
    useEffect(() => {
        if (isReady && isAuthenticated && address && !hasNavigatedRef.current) {
            hasNavigatedRef.current = true
            router.replace('/dashboard')
        }
    }, [isAuthenticated, address, isReady, router])

    const handleLogin = async () => {
        if (!isReady) return
        setIsLoggingIn(true)
        try {
            await login()
        } catch (error) {
            console.error('Login error:', error)
            setIsLoggingIn(false)
        }
    }

    return (
        <div style={pageBackgroundStyle}>
            <div style={gridBackgroundStyle} />
            <div style={crosshairOverlayStyle} />

            <div style={masterContainerStyle}>

                {/* 1. ANIMATED LOGO */}
                <AnimatedLogo />

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
                                padding: "20px 0"
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

                {/* 3. CTA SECTION */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 2.3, duration: 0.6 }}
                    style={{ marginTop: 30, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}
                >
                    <motion.button
                        type="button"
                        style={{
                            ...mainCtaHangtagStyle,
                            opacity: !isReady || isLoggingIn ? 0.7 : 1,
                            cursor: !isReady || isLoggingIn ? 'not-allowed' : 'pointer',
                            WebkitTapHighlightColor: 'transparent',
                        }}
                        onClick={handleLogin}
                        onTouchEnd={(e) => {
                            e.preventDefault()
                            handleLogin()
                        }}
                        disabled={!isReady || isLoggingIn}
                        whileTap={{ scale: 0.95 }}
                    >
                        <div style={zipTieStyle}></div>
                        <span style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ background: colors.black, color: colors.brandRed, padding: "2px 4px", fontSize: 10 }}>→</span>
                            {isLoggingIn ? (
                                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    CONNECTING...
                                </span>
                            ) : (
                                'SIGN IN'
                            )}
                        </span>
                    </motion.button>
                </motion.div>

            </div>
        </div>
    )
}

// --- STYLES ---

const pageBackgroundStyle: React.CSSProperties = {
    width: "100%",
    height: "100vh",
    maxHeight: "100vh",
    backgroundColor: colors.black,
    color: colors.offWhite,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "hidden",
    fontFamily: industrialFontStack,
    textTransform: "uppercase",
    letterSpacing: "1px",
    paddingTop: "env(safe-area-inset-top, 0px)",
    paddingBottom: "env(safe-area-inset-bottom, 0px)",
}

const masterContainerStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: "600px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    zIndex: 10,
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
    width: "180px",
    minWidth: "180px",
    height: "220px",
    padding: "24px",
    backgroundColor: "transparent",
}

const iconBoxStyle: React.CSSProperties = {
    width: "44px",
    height: "44px",
    backgroundColor: colors.black,
    border: `1px solid rgba(255,255,255,0.5)`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "16px",
    borderRadius: "8px",
    boxShadow: `0 4px 12px rgba(0,0,0,0.4)`,
    padding: "6px",
}

const cardTitleStyle: React.CSSProperties = {
    fontSize: "14px",
    fontWeight: 900,
    marginBottom: "8px",
    color: colors.offWhite,
    backgroundColor: colors.brandRed,
    padding: "4px 8px",
    borderRadius: "2px",
    display: "inline-block",
    boxShadow: `0 2px 4px rgba(0,0,0,0.3)`
}

const cardBodyStyle: React.CSSProperties = {
    fontSize: "10px",
    color: colors.offWhite,
    lineHeight: "1.4",
    fontFamily: "monospace",
    fontWeight: 600,
    opacity: 0.9
}

const marqueeMaskStyle: React.CSSProperties = {
    width: "100%",
    overflow: "hidden",
    padding: "20px 0",
    maskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
    WebkitMaskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
}

// CTA BUTTON - compact for mobile
const mainCtaHangtagStyle: React.CSSProperties = {
    position: "relative",
    padding: "10px 20px",
    backgroundColor: colors.brandRed,
    border: `1px solid ${colors.black}`,
    boxShadow: `0 0 0 1px ${colors.black}, 0 0 0 2px ${colors.brightWhite}, 0 5px 20px rgba(255, 59, 48, 0.4)`,
    clipPath: "polygon(8% 0, 100% 0, 100% 80%, 92% 100%, 0 100%, 0 20%)",
    paddingLeft: "28px",
    color: colors.black,
    fontSize: "12px",
    fontWeight: 900,
    fontFamily: industrialFontStack,
    letterSpacing: "0.5px",
    transition: "all 0.2s ease-in-out"
}

const zipTieStyle: React.CSSProperties = {
    position: "absolute",
    left: "12px",
    top: "50%",
    transform: "translateY(-50%)",
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    background: colors.black,
    border: `1px solid ${colors.brightWhite}`,
    zIndex: 3,
}
