'use client'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TokenCard } from '@/components/TokenCard'
import { Search, TrendingUp, Grid3X3, List, RefreshCw, Sparkles, Activity, DollarSign, Zap } from 'lucide-react'
import { tokenApi } from '@/lib/api'
import { useWallet } from '@solana/wallet-adapter-react'
import { useRouter } from 'next/navigation'

// Type definitions
type CategoryType = 'all' | 'new' | 'graduating' | 'graduated' | 'watchlist'
type SortType = 'newest' | 'oldest' | 'marketCap' | 'price'
type ViewType = 'grid' | 'list'

interface Token {
  id: string
  name: string
  symbol: string
  description?: string
  imageUrl?: string
  bannerUrl?: string
  tokenAddress: string
  creatorAddress: string
  bondingCurveAddress: string
  totalSupply: number
  currentSupply: number
  price: number
  marketCap: number
  website?: string
  twitter?: string
  telegram?: string
  isGraduated: boolean
  graduatedAt?: string | null
  rugScore: number
  riskLevel?: string
  createdAt: string
  updatedAt: string
}

interface ApiResponse {
  success: boolean
  data: Token[]
  count?: number
  error?: string
  message?: string
}

export default function AdvancedPage() {
  const { publicKey, connected } = useWallet()
  const router = useRouter()
  const [tokens, setTokens] = useState<Token[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<CategoryType>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortType>('newest')
  const [watchlist, setWatchlist] = useState(new Set<string>())
  const [mounted, setMounted] = useState(false)
  const [viewType, setViewType] = useState<ViewType>('grid')
  const [refreshing, setRefreshing] = useState(false)

  const categories = [
    { id: 'all' as const, name: 'All Tokens', icon: Grid3X3 },
    { id: 'new' as const, name: 'New Launches', icon: Sparkles },
    { id: 'graduating' as const, name: 'Graduating Soon', icon: TrendingUp },
    { id: 'graduated' as const, name: 'Graduated', icon: Zap },
    { id: 'watchlist' as const, name: 'My Watchlist', icon: Activity },
  ]

  const sortOptions = [
    { value: 'newest' as const, label: 'Newest First' },
    { value: 'oldest' as const, label: 'Oldest First' },
    { value: 'marketCap' as const, label: 'Market Cap' },
    { value: 'price' as const, label: 'Token Price' },
  ]

  // Handle hydration
  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (mounted) {
      fetchTokens()
    }
  }, [activeCategory, sortBy, searchQuery, mounted])

  const fetchTokens = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const params = new URLSearchParams()
      
      if (activeCategory !== 'all' && activeCategory !== 'watchlist') {
        params.append('category', activeCategory)
      }
      
      params.append('sortBy', sortBy)
      
      if (searchQuery && searchQuery.trim()) {
        params.append('search', searchQuery.trim())
      }
      
      params.append('limit', '50')

      const response = await fetch(`/api/tokens?${params.toString()}`)
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data: ApiResponse = await response.json()
      
      if (data.success && Array.isArray(data.data)) {
        let filteredTokens = data.data

        if (activeCategory === 'watchlist') {
          filteredTokens = data.data.filter(token => watchlist.has(token.id))
        }

        setTokens(filteredTokens)
        setError(null)
      } else {
        setError(data.error || 'Failed to load tokens')
        setTokens([])
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to fetch tokens')
      setTokens([])
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchTokens()
    setTimeout(() => setRefreshing(false), 500)
  }

  const handleAddToWatchlist = async (tokenId: string) => {
    if (!connected || !publicKey) {
      router.push('/connect-wallet')
      return
    }
    
    try {
      const isInWatchlist = watchlist.has(tokenId)
      
      if (isInWatchlist) {
        await tokenApi.removeFromWatchlist(tokenId, publicKey.toString())
        setWatchlist(prev => {
          const newSet = new Set(prev)
          newSet.delete(tokenId)
          return newSet
        })
      } else {
        await tokenApi.addToWatchlist(tokenId, publicKey.toString())
        setWatchlist(prev => new Set([...prev, tokenId]))
      }

      if (activeCategory === 'watchlist') {
        fetchTokens()
      }
    } catch (error) {
      console.error('Failed to update watchlist:', error)
    }
  }

  const getCategoryCount = (categoryId: CategoryType) => {
    switch (categoryId) {
      case 'all':
        return tokens.length
      case 'new':
        return tokens.filter(t => !t.isGraduated).length
      case 'graduated':
        return tokens.filter(t => t.isGraduated).length
      case 'watchlist':
        return watchlist.size
      default:
        return 0
    }
  }

  if (!mounted) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-[#C0283D]/30 border-t-[#C0283D] rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white/40 text-sm font-medium">Loading tokens...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#C0283D]/5 to-transparent pointer-events-none"></div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12">
          <div className="text-center mb-8">
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#C0283D]/10 backdrop-blur-sm border border-[#C0283D]/20 rounded-full mb-6"
            >
              <Sparkles size={16} className="text-[#C0283D]" />
              <span className="text-sm text-[#C0283D]">Advanced Token</span>
            </motion.div>
            
            <motion.h1 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-4xl sm:text-5xl font-bold text-white mb-4"
            >
              Discover & Track Tokens
            </motion.h1>
            
            <motion.p 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-white/60 text-lg max-w-2xl mx-auto"
            >
              Monitor real-time token performance and market trends
            </motion.p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        {/* Controls Section */}
        <div className="bg-white/[0.02] backdrop-blur-sm border border-[#C0283D]/40 rounded-2xl p-6 mb-6">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search Bar */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-white/30" size={20} />
                <input
                  type="text"
                  placeholder="Search by name, symbol, or address..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-black/40 border border-[#C0283D]/40 rounded-xl pl-12 pr-4 py-3.5 text-white placeholder-white/30 focus:bg-black/60 focus:border-[#C0283D]/50 focus:outline-none transition-all"
                />
              </div>
            </div>

            {/* Sort and View Controls */}
            <div className="flex items-center gap-3">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortType)}
                className="bg-black/40 border border-[#C0283D]/40 rounded-xl px-4 py-3.5 text-white focus:bg-black/60 focus:border-[#C0283D]/50 focus:outline-none transition-all appearance-none cursor-pointer"
              >
                {sortOptions.map(option => (
                  <option key={option.value} value={option.value} className="bg-black">
                    {option.label}
                  </option>
                ))}
              </select>

              <div className="flex bg-black/40 border border-[#C0283D]/40 rounded-xl p-1">
                <button
                  onClick={() => setViewType('grid')}
                  className={`p-2.5 rounded-lg transition-all ${
                    viewType === 'grid' 
                      ? 'bg-[#C0283D]/20 text-[#C0283D]' 
                      : 'text-white/30 hover:text-white/50'
                  }`}
                >
                  <Grid3X3 size={20} />
                </button>
                <button
                  onClick={() => setViewType('list')}
                  className={`p-2.5 rounded-lg transition-all ${
                    viewType === 'list' 
                      ? 'bg-[#C0283D]/20 text-[#C0283D]' 
                      : 'text-white/30 hover:text-white/50'
                  }`}
                >
                  <List size={20} />
                </button>
              </div>

              <button
                onClick={handleRefresh}
                disabled={loading || refreshing}
                className="bg-black/40 hover:bg-black/60 border border-[#C0283D]/40 hover:border-[#C0283D]/50 disabled:opacity-50 disabled:cursor-not-allowed p-3.5 rounded-xl transition-all group"
              >
                <RefreshCw 
                  className={`${refreshing ? 'animate-spin' : 'group-hover:rotate-180'} text-white/50 group-hover:text-[#C0283D] transition-all duration-500`} 
                  size={20} 
                />
              </button>
            </div>
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-2 mt-6 overflow-x-auto scrollbar-hide">
            {categories.map((category) => {
              const Icon = category.icon
              const count = getCategoryCount(category.id)
              const isActive = activeCategory === category.id
              
              return (
                <button
                  key={category.id}
                  onClick={() => setActiveCategory(category.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-[#C0283D]/10 text-[#C0283D] border border-[#C0283D]/20'
                      : 'bg-black/30 text-white/50 border border-[#C0283D]/40 hover:bg-black/50 hover:text-white/70 hover:border-[#C0283D]/40'
                  }`}
                >
                  <Icon size={16} />
                  <span className="text-sm">{category.name}</span>
                  {count > 0 && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      isActive 
                        ? 'bg-[#C0283D]/20 text-[#C0283D]' 
                        : 'bg-white/5 text-white/40'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Error State */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-red-500/10 backdrop-blur-sm border border-red-500/20 rounded-2xl p-4 mb-6"
            >
              <p className="text-red-400 text-sm font-medium">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tokens Grid/List */}
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={`grid gap-4 ${viewType === 'grid' ? 'md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1'}`}
            >
              {[...Array(8)].map((_, i) => (
                <div key={i} className="bg-white/[0.02] border border-[#C0283D]/40 rounded-2xl p-6 animate-pulse">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="w-12 h-12 bg-white/5 rounded-xl"></div>
                    <div className="flex-1">
                      <div className="h-4 bg-white/5 rounded-lg w-24 mb-2"></div>
                      <div className="h-3 bg-white/5 rounded-lg w-16"></div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 bg-white/5 rounded-lg"></div>
                    <div className="h-3 bg-white/5 rounded-lg w-3/4"></div>
                  </div>
                </div>
              ))}
            </motion.div>
          ) : tokens.length > 0 ? (
            <motion.div
              key="tokens"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={`grid gap-4 ${viewType === 'grid' ? 'md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1'}`}
            >
              {tokens.map((token, index) => (
                <motion.div
                  key={token.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                >
                  <TokenCard
                    token={token}
                    onAddToWatchlist={() => handleAddToWatchlist(token.id)}
                    isInWatchlist={watchlist.has(token.id)}
                  />
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-20"
            >
              <div className="inline-flex items-center justify-center w-20 h-20 bg-white/[0.02] rounded-2xl mb-4">
                <Grid3X3 size={32} className="text-white/20" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">No tokens found</h3>
              <p className="text-white/40 text-sm max-w-md mx-auto">
                {searchQuery 
                  ? `No tokens match "${searchQuery}". Try a different search term.`
                  : activeCategory === 'watchlist'
                  ? 'Your watchlist is empty. Add tokens to track them here.'
                  : 'No tokens available in this category at the moment.'
                }
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}