'use client'
import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'

interface TokenCardProps {
  token: {
    id: string
    name: string
    symbol: string
    description?: string
    imageUrl?: string
    bannerUrl?: string
    price: number
    marketCap: number
    rugScore: number
    isGraduated: boolean
    createdAt: string
    website?: string
    twitter?: string
    telegram?: string
  }
  variant?: 'hot' | 'default'
  onAddToWatchlist?: () => void
  isInWatchlist?: boolean
}

export function TokenCard({ token, variant = 'default', onAddToWatchlist, isInWatchlist }: TokenCardProps) {
  const [imageError, setImageError] = useState(false)
  const [imageLoading, setImageLoading] = useState(true)
  
  const getSymbolDisplay = (symbol?: string) => {
    if (!symbol) return '??'
    return symbol.slice(0, 2).toUpperCase()
  }

  const getSafeSymbol = (symbol?: string) => {
    return symbol || 'UNKNOWN'
  }

  const formatPrice = (price: number) => {
    if (!price || isNaN(price)) return '$0.00'
    if (price < 0.000001) return price.toExponential(2)
    if (price < 0.001) return price.toFixed(8)
    if (price < 1) return price.toFixed(6)
    return price.toFixed(4)
  }

  const formatMarketCap = (marketCap: number) => {
    if (!marketCap || isNaN(marketCap)) return '$0'
    if (marketCap >= 1000000) return `$${(marketCap / 1000000).toFixed(1)}M`
    if (marketCap >= 1000) return `$${(marketCap / 1000).toFixed(0)}K`
    return `$${marketCap.toFixed(0)}`
  }

  const generateGradientAvatar = (symbol?: string) => {
    const colors = [
      'from-violet-600 to-indigo-600',
      'from-blue-600 to-cyan-600', 
      'from-emerald-600 to-green-600',
      'from-orange-600 to-red-600',
      'from-pink-600 to-purple-600',
      'from-gray-600 to-gray-800'
    ]
    const safeSymbol = getSafeSymbol(symbol)
    const colorIndex = safeSymbol.charCodeAt(0) % colors.length
    return colors[colorIndex]
  }

  const formatTimeAgo = (dateString: string) => {
    if (!dateString) return 'Recently'
    try {
      const date = new Date(dateString)
      const now = new Date()
      const diff = now.getTime() - date.getTime()
      
      const minutes = Math.floor(diff / (1000 * 60))
      const hours = Math.floor(diff / (1000 * 60 * 60))
      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      
      if (days > 0) return `${days}d`
      if (hours > 0) return `${hours}h`
      return `${Math.max(1, minutes)}m`
    } catch (error) {
      return 'Recently'
    }
  }

  const getProgressPercentage = () => {
    if (token.marketCap >= 1000000) return 100
    if (token.marketCap >= 500000) return 80
    if (token.marketCap >= 100000) return 60
    if (token.marketCap >= 50000) return 40
    if (token.marketCap >= 10000) return 20
    return 5
  }

  const isUiAvatarsUrl = (url: string) => {
    return url.includes('ui-avatars.com')
  }

  const shouldShowImage = token.imageUrl && !imageError && !isUiAvatarsUrl(token.imageUrl)
  const safeTokenName = token.name || 'Unknown Token'
  const safeTokenSymbol = getSafeSymbol(token.symbol)
  const progress = getProgressPercentage()

  // Compact variant for hot tokens
  if (variant === 'hot') {
    return (
      <Link href={`/token/${token.id}`}>
        <motion.div
          whileHover={{ x: 2 }}
          className="bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 hover:border-white/10 rounded-lg p-4 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              {/* Token Avatar */}
              <div className="relative w-10 h-10 rounded-lg overflow-hidden bg-white/5 flex-shrink-0">
                {shouldShowImage ? (
                  <>
                    {imageLoading && (
                      <div className="absolute inset-0 bg-white/5 animate-pulse" />
                    )}
                    <Image
                      src={token.imageUrl!}
                      alt={safeTokenName}
                      fill
                      className={`object-cover transition-opacity ${imageLoading ? 'opacity-0' : 'opacity-100'}`}
                      onLoad={() => setImageLoading(false)}
                      onError={() => {
                        setImageError(true)
                        setImageLoading(false)
                      }}
                    />
                  </>
                ) : (
                  <div className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${generateGradientAvatar(token.symbol)}`}>
                    <span className="text-xs font-bold text-white">
                      {getSymbolDisplay(token.symbol)}
                    </span>
                  </div>
                )}
              </div>

              {/* Token Info */}
              <div className="min-w-0">
                <h3 className="font-medium text-white text-sm truncate">
                  {safeTokenName}
                </h3>
                <p className="text-xs text-white/40">
                  {safeTokenSymbol}
                </p>
              </div>
            </div>

            {/* Right Side Info */}
            <div className="text-right">
              <p className="text-sm font-medium text-white">
                {formatMarketCap(token.marketCap)}
              </p>
              <p className={`text-xs ${progress > 50 ? 'text-green-400' : 'text-white/40'}`}>
                {progress}%
              </p>
            </div>
          </div>

          {/* Mini Progress Bar */}
          <div className="mt-3 w-full bg-white/5 rounded-full h-1 overflow-hidden">
            <motion.div 
              className="bg-gradient-to-r from-white/40 to-white/20 h-full rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.8, delay: 0.1 }}
            />
          </div>
        </motion.div>
      </Link>
    )
  }

  // Default variant - clean and modern
  return (
    <Link href={`/token/${token.id}`}>
      <motion.div
        whileHover={{ y: -2 }}
        className="bg-white/[0.02] hover:bg-white/[0.04] border border-[#C0283D]/40 hover:border-[#C0283D]/50 rounded-xl overflow-hidden transition-all cursor-pointer h-full"
      >
        {/* Main Content */}
        <div className="p-5">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3 min-w-0">
              {/* Token Avatar */}
              <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-white/5 flex-shrink-0">
                {shouldShowImage ? (
                  <>
                    {imageLoading && (
                      <div className="absolute inset-0 bg-white/5 animate-pulse" />
                    )}
                    <Image
                      src={token.imageUrl!}
                      alt={safeTokenName}
                      fill
                      className={`object-cover transition-opacity ${imageLoading ? 'opacity-0' : 'opacity-100'}`}
                      onLoad={() => setImageLoading(false)}
                      onError={() => {
                        setImageError(true)
                        setImageLoading(false)
                      }}
                    />
                  </>
                ) : (
                  <div className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${generateGradientAvatar(token.symbol)}`}>
                    <span className="text-sm font-bold text-white">
                      {getSymbolDisplay(token.symbol)}
                    </span>
                  </div>
                )}
              </div>

              {/* Token Info */}
              <div className="min-w-0">
                <h3 className="font-semibold text-white text-base truncate">
                  {safeTokenName}
                </h3>
                <p className="text-xs text-white/40">
                  {safeTokenSymbol} • {formatTimeAgo(token.createdAt)}
                </p>
              </div>
            </div>

            {/* Watchlist Indicator */}
            {isInWatchlist && (
              <div className="w-2 h-2 bg-yellow-400 rounded-full" />
            )}
          </div>

          {/* Description */}
          {token.description && (
            <p className="text-sm text-white/60 mb-4 line-clamp-2">
              {token.description}
            </p>
          )}

          {/* Stats */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs text-white/40">Market Cap</span>
              <span className="text-sm font-medium text-white">
                {formatMarketCap(token.marketCap)}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-xs text-white/40">Progress</span>
              <span className={`text-sm font-medium ${progress > 50 ? 'text-green-400' : 'text-white'}`}>
                {progress}%
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
              <motion.div 
                className={`h-full rounded-full ${
                  progress > 75 ? 'bg-green-400' : 
                  progress > 50 ? 'bg-yellow-400' : 
                  'bg-white/40'
                }`}
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.8, delay: 0.2 }}
              />
            </div>

            {/* Status */}
            <div className="flex justify-between items-center pt-2">
              <span className={`text-xs ${
                token.isGraduated ? 'text-green-400' : 'text-yellow-400'
              }`}>
                {token.isGraduated ? 'Graduated' : 'Active'}
              </span>
              
              <span className="text-xs text-white/40">
                Risk: {100 - (token.rugScore || 50)}%
              </span>
            </div>
          </div>
        </div>

        {/* Footer Actions - Only if watchlist function available */}
        {onAddToWatchlist && (
          <div className="px-5 py-3">
            <button
              onClick={(e) => {
                e.preventDefault()
                onAddToWatchlist()
              }}
              className={`w-full py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                isInWatchlist
                  ? 'bg-yellow-400/10 text-yellow-400 hover:bg-yellow-400/20'
                  : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
              }`}
            >
              {isInWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
            </button>
          </div>
        )}
      </motion.div>
    </Link>
  )
}