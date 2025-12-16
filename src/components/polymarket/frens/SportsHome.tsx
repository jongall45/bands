'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, RefreshCw, Loader2 } from 'lucide-react'
import { GameCard } from './GameCard'
import { TradeTicket } from './TradeTicket'
import { SportsGame, fetchSportsGamesByLeague } from '@/lib/polymarket/sports'
import { preloadTeams } from '@/lib/espn/teams'

interface SportsHomeProps {
  cashBalance: number
  onTradeComplete?: () => void
}

const LEAGUES = ['NBA', 'NFL', 'NHL', 'NCAAF', 'NCAAB'] as const

export function SportsHome({ cashBalance, onTradeComplete }: SportsHomeProps) {
  const [selectedGame, setSelectedGame] = useState<SportsGame | null>(null)
  const [selectedTeamIndex, setSelectedTeamIndex] = useState<0 | 1>(0)
  const [showTradeTicket, setShowTradeTicket] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  
  // Preload ESPN teams on mount
  useEffect(() => {
    preloadTeams()
  }, [])
  
  // Fetch sports games
  const { data: gamesByLeague, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['sports-games'],
    queryFn: fetchSportsGamesByLeague,
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 60 * 1000,
  })
  
  const handleSelectTeam = useCallback((game: SportsGame, teamIndex: 0 | 1) => {
    setSelectedGame(game)
    setSelectedTeamIndex(teamIndex)
    setShowTradeTicket(true)
  }, [])
  
  const handleCloseTicket = useCallback(() => {
    setShowTradeTicket(false)
    setSelectedGame(null)
  }, [])
  
  const handleTradeSuccess = useCallback(() => {
    onTradeComplete?.()
  }, [onTradeComplete])
  
  // Filter games by search
  const filteredGames = gamesByLeague
    ? Object.entries(gamesByLeague).reduce((acc, [league, games]) => {
        if (searchQuery) {
          const filtered = games.filter(g => 
            g.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            g.team1.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            g.team2.name.toLowerCase().includes(searchQuery.toLowerCase())
          )
          acc[league] = filtered
        } else {
          acc[league] = games
        }
        return acc
      }, {} as Record<string, SportsGame[]>)
    : {}
  
  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#09090b]/95 backdrop-blur-lg border-b border-white/[0.06]">
        {/* Search */}
        <div className="px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              type="text"
              placeholder="Search games..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white/[0.05] border border-white/[0.08] rounded-xl text-white placeholder:text-white/30 outline-none focus:border-white/[0.15] transition-colors"
            />
          </div>
        </div>
        
        {/* Cash Balance Bar */}
        <div className="px-4 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-white/50 text-sm">Cash:</span>
            <span className="text-green-400 font-semibold">${cashBalance.toFixed(2)}</span>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="p-2 rounded-lg hover:bg-white/[0.05] transition-colors"
          >
            <RefreshCw className={`w-4 h-4 text-white/40 ${isRefetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 pb-24">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-white/30 animate-spin" />
          </div>
        ) : (
          <div className="py-4 space-y-6">
            {LEAGUES.map((league) => {
              const games = filteredGames[league] || []
              if (games.length === 0) return null
              
              return (
                <div key={league}>
                  {/* League Header */}
                  <div className="px-4 mb-3 flex items-center justify-between">
                    <h2 className="text-white font-semibold text-lg">{league}</h2>
                    <span className="text-white/40 text-sm">{games.length} games</span>
                  </div>
                  
                  {/* Horizontal Carousel */}
                  <div className="overflow-x-auto scrollbar-hide">
                    <div className="flex gap-3 px-4 pb-2">
                      {games.slice(0, 10).map((game) => (
                        <GameCard
                          key={game.id}
                          game={game}
                          onSelectTeam={handleSelectTeam}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
            
            {/* No Results */}
            {Object.values(filteredGames).every(g => g.length === 0) && (
              <div className="text-center py-12">
                <p className="text-white/40">
                  {searchQuery ? 'No games match your search' : 'No games available'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Trade Ticket Modal */}
      {selectedGame && (
        <TradeTicket
          isOpen={showTradeTicket}
          onClose={handleCloseTicket}
          game={selectedGame}
          selectedTeamIndex={selectedTeamIndex}
          cashBalance={cashBalance}
          onTradeSuccess={handleTradeSuccess}
        />
      )}
    </div>
  )
}
