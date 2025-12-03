'use client'

import Image from 'next/image'
import { formatVolume, parseMarket, formatProbability } from '@/lib/polymarket/api'
import type { PolymarketEvent } from '@/lib/polymarket/api'
import { TrendingUp, Clock, ChevronRight, Flame } from 'lucide-react'

interface EventCardProps {
  event: PolymarketEvent
  onSelect: (event: PolymarketEvent) => void
}

export function EventCard({ event, onSelect }: EventCardProps) {
  const endDate = new Date(event.endDate)
  const isEndingSoon = endDate.getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000 // 7 days
  
  // Get the first market's probability for display
  const firstMarket = event.markets?.[0]
  const parsed = firstMarket ? parseMarket(firstMarket) : null

  return (
    <button
      onClick={() => onSelect(event)}
      className="w-full bg-[#111] hover:bg-[#1a1a1a] border border-white/[0.06] rounded-2xl p-4 transition-all text-left group"
    >
      <div className="flex gap-3">
        {/* Image */}
        {event.image && (
          <div className="relative w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-white/[0.05]">
            <Image
              src={event.image}
              alt={event.title}
              fill
              className="object-cover"
              unoptimized
            />
          </div>
        )}

        <div className="flex-1 min-w-0">
          {/* Title */}
          <h3 className="text-white font-medium text-sm mb-1.5 line-clamp-2">
            {event.title}
          </h3>

          {/* Tags */}
          <div className="flex flex-wrap gap-1 mb-2">
            {event.tags?.slice(0, 2).map((tag) => (
              <span
                key={tag.id}
                className="text-white/40 text-xs bg-white/[0.05] px-2 py-0.5 rounded"
              >
                {tag.label}
              </span>
            ))}
            {event.new && (
              <span className="text-green-400 text-xs bg-green-500/10 px-2 py-0.5 rounded flex items-center gap-1">
                <Flame className="w-3 h-3" />
                HOT
              </span>
            )}
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-white/30" />
              <span className="text-white/40 text-xs">{formatVolume(event.volume)}</span>
            </div>
            
            {isEndingSoon && (
              <div className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-orange-400/60" />
                <span className="text-orange-400/60 text-xs">Ending soon</span>
              </div>
            )}

            {event.markets && event.markets.length > 1 && (
              <span className="text-white/30 text-xs">
                {event.markets.length} markets
              </span>
            )}
          </div>
        </div>

        {/* Probability Badge */}
        <div className="flex flex-col items-end justify-between">
          {parsed && (
            <div className={`text-sm font-bold ${
              parsed.yesPrice >= 0.7 ? 'text-green-400' :
              parsed.yesPrice <= 0.3 ? 'text-red-400' :
              'text-yellow-400'
            }`}>
              {formatProbability(parsed.yesPrice)}
            </div>
          )}
          <ChevronRight className="w-5 h-5 text-white/20 group-hover:text-white/40 transition-colors" />
        </div>
      </div>
    </button>
  )
}

