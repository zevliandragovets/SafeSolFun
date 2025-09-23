'use client'
import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TokenCard } from '@/components/TokenCard'
import { 
  TrendingUp, 
  Shield, 
  Zap, 
  Target, 
  RefreshCw, 
  AlertCircle, 
  Activity, 
  Plus, 
  Search, 
  Filter, 
  Eye,
  ChevronRight,
  BarChart3,
  Globe,
  Clock,
  Star,
  Flame,
  Sparkles,
  Users,
  ArrowUpRight,
  TrendingDown
} from 'lucide-react'
import Link from 'next/link'

interface Token {
  id: string
  name: string
  symbol: string
  description?: string
  imageUrl?: string
  bannerUrl?: string
  price: number
  marketCap: number
  rugScore: number
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME'
  isGraduated: boolean
  createdAt: string
  website?: string
  twitter?: string
  telegram?: string
  volume24h?: number
  transactions24h?: number
  formattedMarketCap?: string
  formattedPrice?: string
  timeAgo?: string
  tokenAddress?: string
  creatorAddress?: string
  currentSupply?: number
  totalSupply?: number
}

interface TokenApiResponse {
  success: boolean
  data: Token[]
  count?: number
  message?: string
  filters?: any
}

interface LoadingState {
  hero: boolean
  hot: boolean
  new: boolean
}

interface ErrorState {
  hero: string | null
  hot: string | null
  new: string | null
}

export default function HomePage() {
  const [heroTokens, setHeroTokens] = useState<Token[]>([])
  const [hotTokens, setHotTokens] = useState<Token[]>([])
  const [newTokens, setNewTokens] = useState<Token[]>([])
  const [loading, setLoading] = useState<LoadingState>({ hero: true, hot: true, new: true })
  const [error, setError] = useState<ErrorState>({ hero: null, hot: null, new: null })
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFilter, setSelectedFilter] = useState('all')

  const fetchTokensFromAPI = async (params: Record<string, any>): Promise<TokenApiResponse> => {
    const searchParams = new URLSearchParams()
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, value.toString())
      }
    })

    console.log('Fetching tokens with params:', params)
    
    const response = await fetch(`/api/tokens?${searchParams.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store'
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()
    console.log('API Response:', data)
    
    return data
  }

  const fetchHeroTokens = async () => {
    try {
      setLoading(prev => ({ ...prev, hero: true }))
      setError(prev => ({ ...prev, hero: null }))
      
      const response = await fetchTokensFromAPI({ 
        category: 'graduated', 
        sortBy: 'marketCap', 
        limit: 4 
      })

      if (response.success && Array.isArray(response.data)) {
        setHeroTokens(response.data)
        console.log('Hero tokens loaded:', response.data.length)
      } else {
        console.warn('Invalid hero tokens response:', response)
        setHeroTokens([])
        setError(prev => ({ ...prev, hero: response.message || 'Failed to load hero tokens' }))
      }
    } catch (err) {
      console.error('Failed to fetch hero tokens:', err)
      setHeroTokens([])
      setError(prev => ({ ...prev, hero: err instanceof Error ? err.message : 'Failed to load hero tokens' }))
    } finally {
      setLoading(prev => ({ ...prev, hero: false }))
    }
  }

  const fetchHotTokens = async () => {
    try {
      setLoading(prev => ({ ...prev, hot: true }))
      setError(prev => ({ ...prev, hot: null }))
      
      const response = await fetchTokensFromAPI({ 
        category: 'trending',
        sortBy: 'marketCap', 
        limit: 12
      })

      if (response.success && Array.isArray(response.data)) {
        setHotTokens(response.data)
        console.log('Hot tokens loaded:', response.data.length)
      } else {
        console.warn('Invalid hot tokens response:', response)
        setHotTokens([])
        setError(prev => ({ ...prev, hot: response.message || 'Failed to load hot tokens' }))
      }
    } catch (err) {
      console.error('Failed to fetch hot tokens:', err)
      setHotTokens([])
      setError(prev => ({ ...prev, hot: err instanceof Error ? err.message : 'Failed to load hot tokens' }))
    } finally {
      setLoading(prev => ({ ...prev, hot: false }))
    }
  }

  const fetchNewTokens = async () => {
    try {
      setLoading(prev => ({ ...prev, new: true }))
      setError(prev => ({ ...prev, new: null }))
      
      const response = await fetchTokensFromAPI({ 
        category: 'new', 
        sortBy: 'newest', 
        limit: 12
      })

      if (response.success && Array.isArray(response.data)) {
        setNewTokens(response.data)
        console.log('New tokens loaded:', response.data.length)
      } else {
        console.warn('Invalid new tokens response:', response)
        setNewTokens([])
        setError(prev => ({ ...prev, new: response.message || 'Failed to load new tokens' }))
      }
    } catch (err) {
      console.error('Failed to fetch new tokens:', err)
      setNewTokens([])
      setError(prev => ({ ...prev, new: err instanceof Error ? err.message : 'Failed to load new tokens' }))
    } finally {
      setLoading(prev => ({ ...prev, new: false }))
    }
  }

  const fetchAllTokens = async () => {
    setIsRefreshing(true)
    try {
      await Promise.all([
        fetchHeroTokens(),
        fetchHotTokens(),
        fetchNewTokens()
      ])
      setLastUpdated(new Date())
    } catch (error) {
      console.error('Error fetching all tokens:', error)
    } finally {
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    fetchAllTokens()
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isRefreshing && !Object.values(loading).some(Boolean)) {
        fetchAllTokens()
      }
    }, 30000)

    return () => clearInterval(interval)
  }, [isRefreshing, loading])

  const filteredHotTokens = useMemo(() => 
    hotTokens.filter(token => 
      selectedFilter === 'all' || 
      (selectedFilter === 'graduated' && token.isGraduated) ||
      (selectedFilter === 'new' && !token.isGraduated)
    ), [hotTokens, selectedFilter]
  )

  const searchFilteredTokens = useMemo(() => 
    filteredHotTokens.filter(token => 
      searchQuery === '' || 
      token.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      token.symbol.toLowerCase().includes(searchQuery.toLowerCase())
    ), [filteredHotTokens, searchQuery]
  )

  const ModernTokenCard = ({ token, index }: { token: Token; index?: number }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: (index || 0) * 0.1 }}
      className="group relative bg-black border border-[#C0283D]/50 rounded-3xl p-6 hover:border-[#C0283D]/50 transition-all duration-300 hover:shadow-lg hover:shadow-[#C0283D]/10 backdrop-blur-sm"
    >
      {/* Glow Effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#C0283D]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl" />
      
      {/* Token Header */}
      <div className="relative flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#C0283D]/20 to-[#C0283D]/10 flex items-center justify-center border border-[#C0283D]/20">
              {token.imageUrl ? (
                <img src={token.imageUrl} alt={token.name} className="w-8 h-8 rounded-lg" />
              ) : (
                <span className="text-[#C0283D] font-bold text-lg">{token.symbol.charAt(0)}</span>
              )}
            </div>
            {token.isGraduated && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#C0283D] rounded-full flex items-center justify-center">
                <Star className="w-2 h-2 text-white fill-white" />
              </div>
            )}
          </div>
          
          <div>
            <h3 className="font-bold text-white group-hover:text-[#C0283D] transition-colors">{token.name}</h3>
            <p className="text-gray-400 text-sm">{token.symbol}</p>
          </div>
        </div>
        
        <div className="text-right">
          <div className="text-white font-semibold">{token.formattedPrice || `$${token.price.toFixed(4)}`}</div>
          <div className="text-xs text-gray-400">{token.timeAgo || 'just now'}</div>
        </div>
      </div>

      {/* Market Info */}
      <div className="space-y-3 mb-4">
        <div className="flex justify-between items-center">
          <span className="text-gray-400 text-sm">Market Cap:</span>
          <span className="text-white font-medium">{token.formattedMarketCap || `$${(token.marketCap / 1000).toFixed(1)}K`}</span>
        </div>
        
        {/* Progress Bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">Progress</span>
            <span className="text-[#C0283D]">{Math.min(Math.round((token.marketCap / 10000) * 100), 100)}%</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${Math.min((token.marketCap / 10000) * 100, 100)}%` }}
              transition={{ duration: 0.8, delay: (index || 0) * 0.1 }}
              className="h-full bg-gradient-to-r from-[#C0283D] to-[#C0283D]/70 rounded-full"
            />
          </div>
        </div>
      </div>

      {/* Action Button */}
      <motion.button 
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="w-full py-3 bg-[#C0283D]/10 hover:bg-[#C0283D]/20 border border-[#C0283D]/30 hover:border-[#C0283D]/50 rounded-xl text-[#C0283D] font-medium transition-all duration-200 flex items-center justify-center space-x-2 group"
      >
        <span>View Details</span>
        <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
      </motion.button>
    </motion.div>
  )

  const LoadingSkeleton = ({ count = 4 }: { count?: number }) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {[...Array(count)].map((_, i) => (
        <div key={i} className="bg-[#0C1319] rounded-2xl p-6 animate-pulse border border-gray-800/50">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-12 h-12 bg-gray-700/50 rounded-xl"></div>
            <div className="flex-1">
              <div className="h-4 bg-gray-700/50 rounded mb-2 w-20"></div>
              <div className="h-3 bg-gray-700/50 rounded w-16"></div>
            </div>
          </div>
          <div className="space-y-3">
            <div className="h-3 bg-gray-700/50 rounded"></div>
            <div className="h-2 bg-gray-700/50 rounded"></div>
            <div className="h-10 bg-gray-700/50 rounded-xl"></div>
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Modern Hero Banner */}
      <div className="relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#C0283D]/20 via-black to-black"></div>
        <div className="absolute inset-0">
          <div className="absolute top-20 left-10 w-72 h-72 bg-[#C0283D]/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-[#C0283D]/5 rounded-full blur-3xl"></div>
        </div>
        
        <div className="relative px-6 py-12">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center space-x-2 bg-[#C0283D]/10 border border-[#C0283D]/20 rounded-full px-4 py-2 mb-6">
              <Sparkles size={16} className="text-[#C0283D]" />
              <span className="text-sm text-[#C0283D]">SafeSolfun</span>
            </div>
            
            <h1 className="text-6xl font-bold mb-4 bg-gradient-to-r from-white via-gray-200 to-white bg-clip-text text-transparent">
              Safe<span className="text-[#C0283D]">Sol</span>fun
            </h1>
            <p className="text-xl text-gray-300 mb-12 max-w-2xl mx-auto leading-relaxed">
              Built for the community, by the community. The most secure and transparent memecoin launchpad on Solana.
            </p>
          </motion.div>

          {/* Hot Projects Section - Modern Design */}
          <div className="max-w-7xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-black backdrop-blur-xl rounded-3xl border border-[#C0283D]/50 p-8 shadow-2xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center space-x-4">
                  <div className="p-3 bg-[#C0283D]/20 rounded-2xl border border-[#C0283D]/30">
                    <Flame className="text-[#C0283D] w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">Hot Projects</h2>
                    <p className="text-gray-400">Join the hottest launches happening right now</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2 bg-[#C0283D]/20 border border-[#C0283D]/30 rounded-full px-3 py-1.5">
                    <div className="w-2 h-2 bg-[#C0283D] rounded-full animate-pulse"></div>
                    <span className="text-[#C0283D] text-sm font-medium">LIVE</span>
                  </div>
                </div>
              </div>
              
              {/* Tokens Grid */}
              {loading.hero ? (
                <LoadingSkeleton count={4} />
              ) : heroTokens.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {heroTokens.map((token, index) => (
                    <ModernTokenCard key={token.id} token={token} index={index} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-16">
                  <div className="w-20 h-20 mx-auto mb-6 bg-[#C0283D]/10 rounded-2xl flex items-center justify-center border border-[#C0283D]/20">
                    <Flame className="text-[#C0283D] w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">No Hot Projects</h3>
                  <p className="text-gray-400">Be the first to launch the next hot project!</p>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </div>

      {/* Modern Search and Filter Bar */}
      <div className="bg-black backdrop-blur-lg border border-[#C0283D]/50 px-6 py-6 max-w-7xl mx-auto rounded-3xl">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row items-center gap-6">
            {/* Search */}
            <div className="relative flex-1 max-w-lg">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Search tokens by name or symbol..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-black/50 border border-[#C0283D]/50 rounded-3xl text-white placeholder-gray-400 focus:outline-none focus:border-[#C0283D]/50 focus:bg-black/70 transition-all backdrop-blur-sm"
              />
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400 font-medium">Filter:</span>
              
              {[
                { id: 'lastTrade', label: 'Last Trade', icon: Activity },
                { id: 'creationTime', label: 'Creation Time', icon: Clock },
                { id: 'heatingUp', label: 'Heating Up', icon: TrendingUp },
                { id: 'watchlist', label: 'Watchlist', icon: Star }
              ].map(({ id, label, icon: Icon }) => (
                <motion.button
                  key={id}
                  whileHover={{ scale: 1.0 }}
                  whileTap={{ scale: 1.0 }}
                  onClick={() => setSelectedFilter(id)}
                  className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    selectedFilter === id 
                      ? 'bg-[#C0283D]/50 text-white' 
                      : 'bg-black text-gray-300 hover:text-[#C0283D] border border-[#C0283D]/50'
                  }`}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                </motion.button>
              ))}
              
              <motion.button 
                whileHover={{ scale: 1.0 }}
                whileTap={{ scale: 0.95 }}
                onClick={fetchAllTokens}
                disabled={isRefreshing}
                className="p-3 bg-black hover:text-[#C0283D] rounded-xl text-gray-300 transition-all border border-[#C0283D]/50"
                title="Refresh All Tokens"
              >
                <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
              </motion.button>
            </div>
          </div>
        </div>
      </div>

      {/* Featured Coins Section - Enhanced */}
      <section className="py-16 px-6 bg-gradient-to-b from-black to-[#0C1319]/20">
        <div className="max-w-7xl mx-auto">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center space-x-2 bg-[#C0283D]/10 border border-[#C0283D]/20 rounded-full px-4 py-2 mb-4">
              <Star className="w-4 h-4 text-[#C0283D]" />
              <span className="text-[#C0283D] text-sm font-medium">Featured</span>
            </div>
            <h2 className="text-4xl font-bold mb-4 text-white">Featured Coins</h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">Discover the most promising tokens that are capturing the community's attention.</p>
          </motion.div>

          {error.hot ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-24"
            >
              <div className="w-24 h-24 mx-auto mb-6 bg-[#C0283D]/10 rounded-3xl flex items-center justify-center border border-[#C0283D]/20">
                <AlertCircle className="text-[#C0283D] w-10 h-10" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">Unable to Load Featured Coins</h3>
              <p className="text-gray-400 mb-8 max-w-md mx-auto">{error.hot}</p>
              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={fetchHotTokens}
                className="px-8 py-4 bg-[#C0283D] text-white rounded-2xl hover:bg-[#C0283D]/90 transition-all duration-300 font-semibold shadow-lg shadow-[#C0283D]/25"
              >
                Try Again
              </motion.button>
            </motion.div>
          ) : loading.hot ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-gradient-to-br from-[#0C1319] to-[#0C1319]/90 border border-gray-800/50 rounded-2xl p-6 animate-pulse">
                  <div className="flex items-center space-x-4 mb-4">
                    <div className="w-16 h-16 bg-gray-700/50 rounded-2xl"></div>
                    <div className="flex-1">
                      <div className="h-6 bg-gray-700/50 rounded mb-2 w-32"></div>
                      <div className="h-4 bg-gray-700/50 rounded w-24"></div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="h-4 bg-gray-700/50 rounded"></div>
                    <div className="h-2 bg-gray-700/50 rounded"></div>
                    <div className="h-12 bg-gray-700/50 rounded-xl"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : searchFilteredTokens.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-24"
            >
              <div className="w-24 h-24 mx-auto mb-8 bg-[#C0283D]/10 rounded-3xl flex items-center justify-center border border-[#C0283D]/20">
                <Target className="text-[#C0283D] w-10 h-10" />
              </div>
              <h3 className="text-3xl font-bold text-white mb-4">No Featured Coins Found</h3>
              <p className="text-gray-400 mb-10 max-w-lg mx-auto text-lg leading-relaxed">
                Be the first to launch the next featured coin on SafeSol and build your community from the ground up!
              </p>
              <Link href="/create">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="inline-flex items-center space-x-3 px-10 py-5 bg-gradient-to-r from-[#C0283D] to-[#C0283D]/80 text-white rounded-2xl hover:shadow-lg hover:shadow-[#C0283D]/25 transition-all duration-300 font-semibold text-lg"
                >
                  <Plus size={24} />
                  <span>Create New Token</span>
                  <ArrowUpRight size={20} />
                </motion.div>
              </Link>
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {searchFilteredTokens.slice(0, 9).map((token, index) => (
                <ModernTokenCard key={token.id} token={token} index={index} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}