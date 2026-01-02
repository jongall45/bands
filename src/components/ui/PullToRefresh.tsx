'use client'

import { useState, useRef, useCallback, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import haptics from '@/lib/haptics'

interface PullToRefreshProps {
  children: ReactNode
  onRefresh: () => Promise<void> | void
  disabled?: boolean
}

const PULL_THRESHOLD = 80
const RESISTANCE = 2.5

export function PullToRefresh({ children, onRefresh, disabled = false }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isPulling, setIsPulling] = useState(false)
  const startY = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled || isRefreshing) return

    // Only enable pull-to-refresh when at top of scroll
    const container = containerRef.current
    if (container && container.scrollTop > 0) return

    startY.current = e.touches[0].clientY
    setIsPulling(true)
  }, [disabled, isRefreshing])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling || disabled || isRefreshing) return

    const container = containerRef.current
    if (container && container.scrollTop > 0) {
      setPullDistance(0)
      return
    }

    const currentY = e.touches[0].clientY
    const diff = currentY - startY.current

    if (diff > 0) {
      // Apply resistance to make it feel more natural
      const distance = Math.min(diff / RESISTANCE, 120)
      setPullDistance(distance)

      // Haptic feedback when crossing threshold
      if (distance >= PULL_THRESHOLD && pullDistance < PULL_THRESHOLD) {
        haptics.impact('medium')
      }
    }
  }, [isPulling, disabled, isRefreshing, pullDistance])

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling) return
    setIsPulling(false)

    if (pullDistance >= PULL_THRESHOLD && !isRefreshing) {
      setIsRefreshing(true)
      haptics.impact('light')

      try {
        await onRefresh()
      } finally {
        setIsRefreshing(false)
        setPullDistance(0)
        haptics.success()
      }
    } else {
      setPullDistance(0)
    }
  }, [isPulling, pullDistance, isRefreshing, onRefresh])

  const progress = Math.min(pullDistance / PULL_THRESHOLD, 1)

  return (
    <div
      ref={containerRef}
      className="relative h-full overflow-y-auto"
      style={{ WebkitOverflowScrolling: 'touch' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator */}
      <div
        className="absolute left-0 right-0 flex items-center justify-center pointer-events-none z-10"
        style={{
          top: 0,
          height: pullDistance,
          transition: isPulling ? 'none' : 'height 0.2s ease-out',
        }}
      >
        {(pullDistance > 10 || isRefreshing) && (
          <div
            className="flex items-center justify-center"
            style={{
              opacity: isRefreshing ? 1 : progress,
              transform: `scale(${0.5 + progress * 0.5})`,
            }}
          >
            <RefreshCw
              className={`w-6 h-6 text-[#FF3B30] ${isRefreshing ? 'animate-spin' : ''}`}
              style={{
                transform: isRefreshing ? 'none' : `rotate(${progress * 180}deg)`,
              }}
            />
          </div>
        )}
      </div>

      {/* Content with pull offset */}
      <div
        style={{
          transform: `translateY(${pullDistance}px)`,
          transition: isPulling ? 'none' : 'transform 0.2s ease-out',
        }}
      >
        {children}
      </div>
    </div>
  )
}
