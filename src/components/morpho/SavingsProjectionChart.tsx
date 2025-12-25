'use client'

import { useMemo, useState } from 'react'
import { TrendingUp } from 'lucide-react'

interface SavingsProjectionChartProps {
  totalDeposited: number
  avgApy: number // as decimal (0.05 = 5%)
}

export function SavingsProjectionChart({ totalDeposited, avgApy }: SavingsProjectionChartProps) {
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null)

  // Generate projection data for 12 months
  const projectionData = useMemo(() => {
    const data = []
    const now = new Date()
    const dailyRate = avgApy / 365

    for (let month = 0; month <= 12; month++) {
      const daysElapsed = month * 30
      const projectedBalance = totalDeposited * (1 + dailyRate * daysElapsed)
      const date = new Date(now)
      date.setMonth(date.getMonth() + month)

      data.push({
        month,
        date,
        balance: projectedBalance,
        earnings: projectedBalance - totalDeposited,
      })
    }

    return data
  }, [totalDeposited, avgApy])

  // Calculate yearly projection
  const yearlyEarnings = totalDeposited * avgApy
  const apyPercent = avgApy * 100

  // Chart dimensions
  const chartWidth = 340
  const chartHeight = 120
  const padding = { top: 10, right: 10, bottom: 25, left: 45 }
  const innerWidth = chartWidth - padding.left - padding.right
  const innerHeight = chartHeight - padding.top - padding.bottom

  // Scale values
  const minBalance = totalDeposited
  const maxBalance = projectionData[projectionData.length - 1].balance
  const balanceRange = maxBalance - minBalance || 1

  // Generate SVG path
  const pathPoints = projectionData.map((d, i) => {
    const x = padding.left + (i / 12) * innerWidth
    const y = padding.top + innerHeight - ((d.balance - minBalance) / balanceRange) * innerHeight
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
  }).join(' ')

  // Generate area path
  const areaPath = pathPoints +
    ` L ${padding.left + innerWidth} ${padding.top + innerHeight}` +
    ` L ${padding.left} ${padding.top + innerHeight} Z`

  // Format date for x-axis
  const formatMonth = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'short' })
  }

  // Get point position for hover
  const getPointPosition = (index: number) => {
    const d = projectionData[index]
    const x = padding.left + (index / 12) * innerWidth
    const y = padding.top + innerHeight - ((d.balance - minBalance) / balanceRange) * innerHeight
    return { x, y, ...d }
  }

  if (totalDeposited <= 0) return null

  return (
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-4">
      {/* Header Stats */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-white/50 text-xs">Current APY</span>
            <span className="text-green-400 font-bold text-lg">{apyPercent.toFixed(2)}%</span>
          </div>
        </div>
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-1.5">
          <span className="text-green-400 text-sm font-medium">
            +${yearlyEarnings.toFixed(2)}/year
          </span>
        </div>
      </div>

      {/* Interactive Chart */}
      <div className="relative">
        <svg
          width={chartWidth}
          height={chartHeight}
          className="w-full"
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          onMouseLeave={() => setHoveredPoint(null)}
        >
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
            <line
              key={i}
              x1={padding.left}
              x2={padding.left + innerWidth}
              y1={padding.top + innerHeight * (1 - ratio)}
              y2={padding.top + innerHeight * (1 - ratio)}
              stroke="rgba(255,255,255,0.05)"
              strokeDasharray="2,4"
            />
          ))}

          {/* Gradient definition */}
          <defs>
            <linearGradient id="areaGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgb(34, 197, 94)" stopOpacity="0.3" />
              <stop offset="100%" stopColor="rgb(34, 197, 94)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Area fill */}
          <path d={areaPath} fill="url(#areaGradient)" />

          {/* Line */}
          <path
            d={pathPoints}
            fill="none"
            stroke="rgb(34, 197, 94)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Interactive points */}
          {projectionData.map((_, i) => {
            const pos = getPointPosition(i)
            return (
              <g key={i}>
                {/* Invisible hover area */}
                <rect
                  x={pos.x - innerWidth / 24}
                  y={padding.top}
                  width={innerWidth / 12}
                  height={innerHeight}
                  fill="transparent"
                  onMouseEnter={() => setHoveredPoint(i)}
                />
                {/* Visible point on hover */}
                {hoveredPoint === i && (
                  <>
                    <line
                      x1={pos.x}
                      x2={pos.x}
                      y1={padding.top}
                      y2={padding.top + innerHeight}
                      stroke="rgba(255,255,255,0.2)"
                      strokeDasharray="2,2"
                    />
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r="5"
                      fill="rgb(34, 197, 94)"
                      stroke="white"
                      strokeWidth="2"
                    />
                  </>
                )}
              </g>
            )
          })}

          {/* X-axis labels */}
          {[0, 3, 6, 9, 12].map((month) => {
            const x = padding.left + (month / 12) * innerWidth
            return (
              <text
                key={month}
                x={x}
                y={chartHeight - 5}
                textAnchor="middle"
                fill="rgba(255,255,255,0.4)"
                fontSize="10"
              >
                {formatMonth(projectionData[month].date)}
              </text>
            )
          })}

          {/* Y-axis labels */}
          <text
            x={padding.left - 5}
            y={padding.top + 4}
            textAnchor="end"
            fill="rgba(255,255,255,0.4)"
            fontSize="9"
          >
            ${maxBalance.toFixed(0)}
          </text>
          <text
            x={padding.left - 5}
            y={padding.top + innerHeight}
            textAnchor="end"
            fill="rgba(255,255,255,0.4)"
            fontSize="9"
          >
            ${minBalance.toFixed(0)}
          </text>
        </svg>

        {/* Hover tooltip */}
        {hoveredPoint !== null && (
          <div
            className="absolute bg-black/90 border border-white/20 rounded-lg px-3 py-2 pointer-events-none z-10"
            style={{
              left: `${(hoveredPoint / 12) * 100}%`,
              top: '-10px',
              transform: 'translateX(-50%)',
            }}
          >
            <p className="text-white text-xs font-medium">
              ${projectionData[hoveredPoint].balance.toFixed(2)}
            </p>
            <p className="text-green-400 text-xs">
              +${projectionData[hoveredPoint].earnings.toFixed(2)}
            </p>
            <p className="text-white/40 text-xs">
              {formatMonth(projectionData[hoveredPoint].date)}
            </p>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-3 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-white/50">Projected Balance</span>
        </div>
      </div>
    </div>
  )
}
