'use client'

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  variant?: 'full' | 'icon' | 'neumorphic-icon'
}

export function Logo({ size = 'md', variant = 'full' }: LogoProps) {
  const sizes = {
    sm: { container: 80, stack: { w: 56, h: 88 }, wrapper: { w: 76, h: 32 }, dollar: 14, text: 12, icon: 32 },
    md: { container: 120, stack: { w: 90, h: 140 }, wrapper: { w: 120, h: 50 }, dollar: 20, text: 18, icon: 48 },
    lg: { container: 160, stack: { w: 120, h: 186 }, wrapper: { w: 160, h: 66 }, dollar: 26, text: 24, icon: 64 },
    xl: { container: 200, stack: { w: 150, h: 232 }, wrapper: { w: 200, h: 82 }, dollar: 32, text: 30, icon: 80 },
  }

  const s = sizes[size]

  // Neumorphic Red Icon - Soft 3D lifted effect
  if (variant === 'neumorphic-icon') {
    return (
      <div className="bands-icon-neumorphic">
        <span className="dollar-sign">$</span>
        <style jsx>{`
          .bands-icon-neumorphic {
            --bands-red-base: #FF3B30;
            --bands-red-light: #ff645c;
            --bands-red-dark: #c41e14;
            
            width: ${s.icon}px;
            height: ${s.icon}px;
            border-radius: ${s.icon * 0.25}px;
            display: flex;
            justify-content: center;
            align-items: center;
            
            /* Soft gradient background */
            background: linear-gradient(145deg, var(--bands-red-light), var(--bands-red-base));
            
            /* THE NEUMORPHIC MAGIC - Red-tinted shadows only */
            box-shadow: 
              -4px -4px 10px var(--bands-red-light),
              4px 4px 10px var(--bands-red-dark),
              inset 1px 1px 2px rgba(255, 255, 255, 0.2),
              inset -1px -1px 2px rgba(150, 0, 0, 0.1);
            
            transition: all 0.3s ease;
          }
          
          .bands-icon-neumorphic:hover {
            box-shadow: 
              -6px -6px 14px var(--bands-red-light),
              6px 6px 14px var(--bands-red-dark),
              inset 1px 1px 2px rgba(255, 255, 255, 0.3),
              inset -1px -1px 2px rgba(150, 0, 0, 0.15);
            transform: translateY(-2px);
          }
          
          .dollar-sign {
            font-family: 'Inter', -apple-system, sans-serif;
            font-size: ${s.icon * 0.5}px;
            font-weight: 800;
            color: white;
            text-shadow: 
              1px 1px 2px rgba(150, 0, 0, 0.3),
              0 0 10px rgba(255, 255, 255, 0.2);
          }
        `}</style>
      </div>
    )
  }

  // Simple icon variant
  if (variant === 'icon') {
    return (
      <div className="logo-icon-only">
        <div className="icon-stack">
          <span className="icon-dollar">$</span>
        </div>
        <style jsx>{`
          .logo-icon-only {
            width: ${s.wrapper.h}px;
            height: ${s.wrapper.h}px;
            background: linear-gradient(145deg, #f0f5fa, #d1d9e6);
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 
              6px 6px 12px rgba(163, 177, 198, 0.6),
              -6px -6px 12px rgba(255, 255, 255, 0.9);
          }
          .icon-stack {
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .icon-dollar {
            font-size: ${s.dollar}px;
            font-weight: 800;
            color: #FF3B30;
            font-family: 'Inter', -apple-system, sans-serif;
            text-shadow: 1px 1px 2px rgba(255, 59, 48, 0.3);
          }
        `}</style>
      </div>
    )
  }

  // Full money stack logo
  return (
    <div className="logo-container">
      {/* Money Stack Base */}
      <div className="money-stack">
        {/* Bill lines for texture */}
        <div className="bill-lines">
          <div className="bill-line" />
          <div className="bill-line" />
          <div className="bill-line" />
          <div className="bill-line" />
          <div className="bill-line" />
        </div>
      </div>
      
      {/* Wrapper Band */}
      <div className="money-wrapper">
        <div className="wrapper-text">
          <span className="dollar-sign">$</span>
          <span className="brand-name">bands</span>
        </div>
      </div>

      <style jsx>{`
        .logo-container {
          position: relative;
          width: ${s.container}px;
          height: ${s.container * 1.33}px;
          display: flex;
          justify-content: center;
          align-items: center;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }

        .money-stack {
          position: absolute;
          width: ${s.stack.w}px;
          height: ${s.stack.h}px;
          background: linear-gradient(145deg, #e8edf4, #d1d9e6);
          border-radius: 12px;
          box-shadow: 
            8px 8px 16px rgba(163, 177, 198, 0.6),
            -8px -8px 16px rgba(255, 255, 255, 0.8);
          overflow: hidden;
        }

        .bill-lines {
          position: absolute;
          top: 8px;
          left: 50%;
          transform: translateX(-50%);
          width: 70%;
          height: calc(100% - 16px);
          display: flex;
          flex-direction: column;
          justify-content: space-evenly;
        }

        .bill-line {
          width: 100%;
          height: 2px;
          background: linear-gradient(90deg, 
            transparent 0%, 
            rgba(163, 177, 198, 0.3) 20%,
            rgba(163, 177, 198, 0.4) 50%,
            rgba(163, 177, 198, 0.3) 80%,
            transparent 100%
          );
          border-radius: 1px;
        }

        .money-wrapper {
          position: relative;
          width: ${s.wrapper.w}px;
          height: ${s.wrapper.h}px;
          background: linear-gradient(145deg, #f0f5fa, #d1d9e6);
          border-radius: 10px;
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 2;
          box-shadow: 
            6px 6px 12px rgba(163, 177, 198, 0.7),
            -6px -6px 12px rgba(255, 255, 255, 0.9),
            inset 0 1px 0 rgba(255, 255, 255, 0.6);
        }

        .wrapper-text {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 3px;
          padding: 6px 12px;
          border-radius: 6px;
          background: linear-gradient(145deg, #d1d9e6, #e8edf4);
          box-shadow: 
            inset 2px 2px 5px rgba(163, 177, 198, 0.5),
            inset -2px -2px 5px rgba(255, 255, 255, 0.7);
        }

        .dollar-sign {
          font-size: ${s.dollar}px;
          font-weight: 800;
          color: #FF3B30;
          text-shadow: 
            1px 1px 0 rgba(255, 255, 255, 0.5),
            -1px -1px 0 rgba(163, 177, 198, 0.3);
        }

        .brand-name {
          font-size: ${s.text}px;
          font-weight: 700;
          color: #3D4852;
          letter-spacing: -0.5px;
          text-shadow: 
            1px 1px 0 rgba(255, 255, 255, 0.5),
            -1px -1px 0 rgba(163, 177, 198, 0.2);
        }
      `}</style>
    </div>
  )
}

// Neumorphic Red Icon - Standalone export for nav/header use
export function NeumorphicIcon({ size = 48 }: { size?: number }) {
  return (
    <div className="bands-icon-neumorphic">
      <span className="dollar-sign">$</span>
      <style jsx>{`
        .bands-icon-neumorphic {
          --bands-red-base: #FF3B30;
          --bands-red-light: #ff645c;
          --bands-red-dark: #c41e14;
          
          width: ${size}px;
          height: ${size}px;
          border-radius: ${size * 0.25}px;
          display: flex;
          justify-content: center;
          align-items: center;
          cursor: pointer;
          
          /* Soft gradient background */
          background: linear-gradient(145deg, var(--bands-red-light), var(--bands-red-base));
          
          /* Neumorphic red-tinted shadows */
          box-shadow: 
            -4px -4px 10px var(--bands-red-light),
            4px 4px 10px var(--bands-red-dark),
            inset 1px 1px 2px rgba(255, 255, 255, 0.2),
            inset -1px -1px 2px rgba(150, 0, 0, 0.1);
          
          transition: all 0.3s ease;
        }
        
        .bands-icon-neumorphic:hover {
          box-shadow: 
            -6px -6px 14px var(--bands-red-light),
            6px 6px 14px var(--bands-red-dark),
            inset 1px 1px 2px rgba(255, 255, 255, 0.3),
            inset -1px -1px 2px rgba(150, 0, 0, 0.15);
          transform: translateY(-2px) scale(1.02);
        }
        
        .bands-icon-neumorphic:active {
          /* Pressed state - invert the shadow for "pressed in" feel */
          box-shadow: 
            inset 4px 4px 10px var(--bands-red-dark),
            inset -4px -4px 10px var(--bands-red-light);
          transform: translateY(0) scale(0.98);
        }
        
        .dollar-sign {
          font-family: 'Inter', -apple-system, sans-serif;
          font-size: ${size * 0.5}px;
          font-weight: 800;
          color: white;
          text-shadow: 
            1px 1px 2px rgba(150, 0, 0, 0.3),
            0 0 10px rgba(255, 255, 255, 0.2);
          user-select: none;
        }
      `}</style>
    </div>
  )
}

// Simple inline logo for nav (keeps existing style but with neumorphic option)
export function LogoInline({ size = 'md', neumorphic = false }: { size?: 'sm' | 'md', neumorphic?: boolean }) {
  const iconSize = size === 'sm' ? 28 : 36
  const fontSize = size === 'sm' ? '1.1rem' : '1.3rem'
  
  if (neumorphic) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <NeumorphicIcon size={iconSize} />
        <span style={{
          fontWeight: 700,
          fontSize: fontSize,
          letterSpacing: '-0.02em',
        }}>
          bands
        </span>
      </div>
    )
  }
  
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div style={{
        width: iconSize,
        height: iconSize,
        background: '#FF3B30',
        borderRadius: '10px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontWeight: 800,
        fontSize: size === 'sm' ? '0.9rem' : '1.1rem',
      }}>
        $
      </div>
      <span style={{
        fontWeight: 700,
        fontSize: fontSize,
        letterSpacing: '-0.02em',
      }}>
        bands
      </span>
    </div>
  )
}
