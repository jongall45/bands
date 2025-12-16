'use client'

import { memo } from 'react'
import Image from 'next/image'
import { SportsGame, formatVolume, formatCents } from '@/lib/polymarket/sports'

interface GameCardProps {
  game: SportsGame
  onSelectTeam: (game: SportsGame, teamIndex: 0 | 1) => void
}

/**
 * Frens-style Game Card
 * 
 * Shows:
 * - Team logos, abbreviations, records
 * - Volume in center
 * - Two large CTA buttons with team colors
 */
export const GameCard = memo(function GameCard({ game, onSelectTeam }: GameCardProps) {
  const { team1, team2, totalVolume, startDate } = game
  
  // Format start time
  const gameTime = new Date(startDate).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
  
  return (
    <div className="w-[320px] flex-shrink-0 bg-gradient-to-b from-white/[0.08] to-white/[0.03] backdrop-blur-xl rounded-2xl border border-white/[0.08] overflow-hidden">
      {/* Header: Teams */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          {/* Team 1 */}
          <div className="flex flex-col items-center gap-1 flex-1">
            {team1.logo ? (
              <div className="w-12 h-12 relative">
                <Image
                  src={team1.logo}
                  alt={team1.name}
                  fill
                  className="object-contain"
                  unoptimized
                />
              </div>
            ) : (
              <div 
                className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg"
                style={{ backgroundColor: team1.color }}
              >
                {team1.abbreviation.charAt(0)}
              </div>
            )}
            <span className="text-white font-semibold text-sm">{team1.abbreviation}</span>
            {team1.record && (
              <span className="text-white/40 text-xs">{team1.record}</span>
            )}
          </div>
          
          {/* Center: Time & Volume */}
          <div className="flex flex-col items-center gap-1 px-3">
            <span className="text-white/60 text-xs font-medium">{gameTime}</span>
            <span className="text-white/40 text-xs">{formatVolume(totalVolume)}</span>
          </div>
          
          {/* Team 2 */}
          <div className="flex flex-col items-center gap-1 flex-1">
            {team2.logo ? (
              <div className="w-12 h-12 relative">
                <Image
                  src={team2.logo}
                  alt={team2.name}
                  fill
                  className="object-contain"
                  unoptimized
                />
              </div>
            ) : (
              <div 
                className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg"
                style={{ backgroundColor: team2.color }}
              >
                {team2.abbreviation.charAt(0)}
              </div>
            )}
            <span className="text-white font-semibold text-sm">{team2.abbreviation}</span>
            {team2.record && (
              <span className="text-white/40 text-xs">{team2.record}</span>
            )}
          </div>
        </div>
      </div>
      
      {/* CTA Buttons */}
      <div className="flex gap-2 p-3 pt-0">
        <button
          onClick={() => onSelectTeam(game, 0)}
          className="flex-1 py-3.5 rounded-xl font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98]"
          style={{ backgroundColor: team1.color }}
        >
          <span className="text-sm">{team1.abbreviation}</span>
          <span className="ml-1.5 text-white/90">{formatCents(team1.price || 0)}</span>
        </button>
        
        <button
          onClick={() => onSelectTeam(game, 1)}
          className="flex-1 py-3.5 rounded-xl font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98]"
          style={{ backgroundColor: team2.color }}
        >
          <span className="text-sm">{team2.abbreviation}</span>
          <span className="ml-1.5 text-white/90">{formatCents(team2.price || 0)}</span>
        </button>
      </div>
    </div>
  )
})
