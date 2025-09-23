'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import { motion } from 'framer-motion'
import Image from 'next/image'
import { TradingInterface } from '@/components/TradingInterface'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'
import { Globe, Twitter, MessageCircle, Shield, TrendingUp, Users, Activity, RefreshCw, DollarSign, BarChart3, PieChart, Zap } from 'lucide-react'
import { tokenApi } from '@/lib/api'
import { RugDetector } from '@/lib/solana'

// Define interfaces (same as before)
interface PriceHistoryData {
  time: string;
  price: number;
  volume?: number;
  timestamp: number;
}

interface TransactionData {
  id: string;
  type: 'buy' | 'sell';
  amount: string;
  solAmount: string;
  price: string;
  userAddress: string;
  createdAt: string;
  txHash?: string;
  pnl?: number;
  pnlPercentage?: number;
}

interface HolderData {
  address: string;
  balance: string;
  percentage: number;
  value?: number;
  lastActivity?: string;
}

interface TokenData {
  id: string;
  name: string;
  symbol: string;
  price: number;
  marketCap: number;
  description?: string;
  imageUrl?: string;
  bannerUrl?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  rugScore: number;
  isGraduated: boolean;
  transactions?: TransactionData[];
  currentSupply?: number;
  totalSupply?: number;
  riskLevel?: string;
  formattedPrice?: string;
  formattedMarketCap?: string;
  volume24h?: number;
  priceChange24h?: number;
}

export default function TokenPage() {
  const { id } = useParams()
  const [token, setToken] = useState<TokenData | null>(null)
  const [transactions, setTransactions] = useState<TransactionData[]>([])
  const [priceHistory, setPriceHistory] = useState<PriceHistoryData[]>([])
  const [holders, setHolders] = useState<HolderData[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('trade')
  const [refreshing, setRefreshing] = useState(false)
  const [dataLoading, setDataLoading] = useState({
    priceHistory: false,
    transactions: false,
    holders: false
  })
  const [isLiveUpdating, setIsLiveUpdating] = useState(true)
  
  const wsRef = useRef<WebSocket | null>(null)
  const intervalsRef = useRef<{
    price: NodeJS.Timeout | null;
    transactions: NodeJS.Timeout | null;
    holders: NodeJS.Timeout | null;
  }>({
    price: null,
    transactions: null,
    holders: null
  })

  // All the existing functions remain the same...
  useEffect(() => {
    if (id) {
      initializeRealTimeData()
      return () => {
        cleanupIntervals()
        if (wsRef.current) {
          wsRef.current.close()
        }
      }
    }
  }, [id])

  const cleanupIntervals = () => {
    Object.values(intervalsRef.current).forEach(interval => {
      if (interval) clearInterval(interval)
    })
  }

  const initializeRealTimeData = async () => {
    try {
      await fetchTokenDetails()
      if (isLiveUpdating) {
        setupWebSocket()
        setupPollingIntervals()
      }
    } catch (error) {
      console.error('Failed to initialize real-time data:', error)
    }
  }

  const setupWebSocket = () => {
    try {
      const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001'}/tokens/${id}/live`
      wsRef.current = new WebSocket(wsUrl)
      
      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          handleWebSocketMessage(data)
        } catch (error) {
          console.error('WebSocket message parsing error:', error)
        }
      }
      
      wsRef.current.onerror = (error) => {
        console.warn('WebSocket error, falling back to polling:', error)
        setupPollingIntervals()
      }
    } catch (error) {
      console.warn('WebSocket not available, using polling:', error)
      setupPollingIntervals()
    }
  }

  const handleWebSocketMessage = (data: any) => {
    switch (data.type) {
      case 'price_update':
        updateTokenPrice(data.price, data.marketCap)
        addPricePoint(data.price, data.timestamp)
        break
      case 'new_transaction':
        addNewTransaction(data.transaction)
        break
      case 'holders_update':
        updateHolders(data.holders)
        break
    }
  }

  const setupPollingIntervals = () => {
    intervalsRef.current.price = setInterval(async () => {
      await refreshTokenPrice()
      await fetchPriceHistory()
    }, 5000)

    intervalsRef.current.transactions = setInterval(async () => {
      await fetchTransactions()
    }, 10000)

    intervalsRef.current.holders = setInterval(async () => {
      await fetchHolders()
    }, 30000)
  }

  const fetchTokenDetails = async () => {
    try {
      setLoading(true)
      console.log('Fetching token details for ID:', id)
      
      const response = await fetch(`/api/tokens/${id}`)
      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch token details')
      }

      const tokenData = result.data || result
      
      const validatedToken: TokenData = {
        id: tokenData.id || id as string,
        name: tokenData.name || 'Unknown Token',
        symbol: tokenData.symbol || 'UNKNOWN',
        price: parseFloat(tokenData.price?.toString() || '0'),
        marketCap: parseFloat(tokenData.marketCap?.toString() || '0'),
        rugScore: parseInt(tokenData.rugScore?.toString() || '50'),
        isGraduated: tokenData.isGraduated || false,
        description: tokenData.description || 'No description available',
        imageUrl: tokenData.imageUrl,
        bannerUrl: tokenData.bannerUrl,
        website: tokenData.website,
        twitter: tokenData.twitter,
        telegram: tokenData.telegram,
        transactions: tokenData.transactions || tokenData.recentTransactions,
        currentSupply: parseFloat(tokenData.currentSupply?.toString() || '0'),
        totalSupply: parseFloat(tokenData.totalSupply?.toString() || '0'),
        riskLevel: tokenData.riskLevel,
        formattedPrice: tokenData.formattedPrice,
        formattedMarketCap: tokenData.formattedMarketCap,
        volume24h: parseFloat(tokenData.volume24h?.toString() || '0'),
        priceChange24h: parseFloat(tokenData.priceChange24h?.toString() || '0')
      }
      
      setToken(validatedToken)
      
      await Promise.all([
        fetchPriceHistory(),
        fetchTransactions(),
        fetchHolders()
      ])
    } catch (error) {
      console.error('Failed to fetch token details:', error)
      const fallbackToken: TokenData = {
        id: id as string,
        name: 'Unknown Token',
        symbol: 'UNKNOWN',
        price: 0,
        marketCap: 0,
        rugScore: 50,
        isGraduated: false,
        description: 'Token data could not be loaded'
      }
      setToken(fallbackToken)
    } finally {
      setLoading(false)
    }
  }

  const refreshTokenPrice = useCallback(async () => {
    if (!token || refreshing) return
    
    try {
      setRefreshing(true)
      const response = await fetch(`/api/tokens/${id}`)
      const result = await response.json()
      
      if (response.ok && result.data) {
        const updatedData = result.data
        setToken(prev => prev ? {
          ...prev,
          price: parseFloat(updatedData.price?.toString() || prev.price.toString()),
          marketCap: parseFloat(updatedData.marketCap?.toString() || prev.marketCap.toString()),
          formattedPrice: updatedData.formattedPrice || prev.formattedPrice,
          formattedMarketCap: updatedData.formattedMarketCap || prev.formattedMarketCap,
          volume24h: parseFloat(updatedData.volume24h?.toString() || prev.volume24h?.toString() || '0'),
          priceChange24h: parseFloat(updatedData.priceChange24h?.toString() || prev.priceChange24h?.toString() || '0')
        } : null)
      }
    } catch (error) {
      console.error('Failed to refresh token price:', error)
    } finally {
      setRefreshing(false)
    }
  }, [id, token, refreshing])

  const fetchPriceHistory = async () => {
    try {
      setDataLoading(prev => ({ ...prev, priceHistory: true }))
      const response = await fetch(`/api/tokens/${id}/price-history`)
      if (response.ok) {
        const data = await response.json()
        if (data && Array.isArray(data)) {
          const formattedData = data.map((item: any) => ({
            time: item.time,
            price: parseFloat(item.price?.toString() || '0'),
            volume: parseFloat(item.volume?.toString() || '0'),
            timestamp: new Date(item.createdAt || Date.now()).getTime()
          }))
          setPriceHistory(formattedData)
        }
      }
    } catch (error) {
      console.error('Failed to fetch price history:', error)
    } finally {
      setDataLoading(prev => ({ ...prev, priceHistory: false }))
    }
  }

  const fetchTransactions = async () => {
    try {
      setDataLoading(prev => ({ ...prev, transactions: true }))
      const response = await fetch(`/api/tokens/${id}/transactions?limit=50`)
      if (response.ok) {
        const result = await response.json()
        const data = result.data || result
        
        if (Array.isArray(data)) {
          const processedTransactions = data.map((tx: any) => {
            const currentPrice = token?.price || 0
            const txPrice = parseFloat(tx.price?.toString() || tx.solAmount?.toString() || '0')
            const amount = parseFloat(tx.amount?.toString() || '0')
            
            let pnl = 0
            let pnlPercentage = 0
            
            if (tx.type === 'buy' && currentPrice > 0 && txPrice > 0) {
              pnl = (currentPrice - txPrice) * amount
              pnlPercentage = ((currentPrice - txPrice) / txPrice) * 100
            } else if (tx.type === 'sell' && txPrice > 0) {
              pnl = parseFloat(tx.solAmount?.toString() || '0')
              pnlPercentage = 0
            }
            
            return {
              ...tx,
              pnl,
              pnlPercentage
            }
          })
          
          setTransactions(processedTransactions)
        }
      }
    } catch (error) {
      console.error('Failed to fetch transactions:', error)
    } finally {
      setDataLoading(prev => ({ ...prev, transactions: false }))
    }
  }

  const fetchHolders = async () => {
    try {
      setDataLoading(prev => ({ ...prev, holders: true }))
      const response = await fetch(`/api/tokens/${id}/holders`)
      if (response.ok) {
        const data = await response.json()
        
        if (Array.isArray(data)) {
          const processedHolders = data.map((holder: any) => {
            const balance = parseFloat(holder.balance?.toString() || '0')
            const value = balance * (token?.price || 0)
            
            return {
              ...holder,
              balance: balance.toString(),
              value,
              percentage: parseFloat(holder.percentage?.toString() || '0')
            }
          })
          
          setHolders(processedHolders)
        }
      }
    } catch (error) {
      console.error('Failed to fetch holders:', error)
    } finally {
      setDataLoading(prev => ({ ...prev, holders: false }))
    }
  }

  const updateTokenPrice = (newPrice: number, newMarketCap: number) => {
    setToken(prev => prev ? {
      ...prev,
      price: newPrice,
      marketCap: newMarketCap
    } : null)
  }

  const addPricePoint = (price: number, timestamp: number) => {
    const newPoint: PriceHistoryData = {
      time: new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      price,
      timestamp
    }
    
    setPriceHistory(prev => {
      const updated = [...prev, newPoint].slice(-100)
      return updated.sort((a, b) => a.timestamp - b.timestamp)
    })
  }

  const addNewTransaction = (transaction: any) => {
    const processedTx = {
      ...transaction,
      pnl: 0,
      pnlPercentage: 0
    }
    
    setTransactions(prev => [processedTx, ...prev].slice(0, 50))
  }

  const updateHolders = (newHolders: any[]) => {
    const processedHolders = newHolders.map(holder => ({
      ...holder,
      value: parseFloat(holder.balance) * (token?.price || 0)
    }))
    setHolders(processedHolders)
  }

  const formatAddress = (address: string) => {
    if (!address) return 'Unknown'
    return `${address.slice(0, 4)}...${address.slice(-4)}`
  }

  const formatTimeAgo = (dateString: string) => {
    if (!dateString) return 'Unknown'
    const date = new Date(dateString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    
    const minutes = Math.floor(diff / (1000 * 60))
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    
    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    return `${minutes}m ago`
  }

  const formatPNL = (pnl: number, percentage: number) => {
    const color = pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
    const sign = pnl >= 0 ? '+' : ''
    return (
      <div className={`text-sm font-semibold ${color}`}>
        <div>{sign}${Math.abs(pnl).toFixed(4)}</div>
        {percentage !== 0 && (
          <div className="text-xs opacity-70">{sign}{percentage.toFixed(2)}%</div>
        )}
      </div>
    )
  }

  const getSymbolDisplay = (symbol?: string) => {
    if (!symbol) return '?'
    return symbol.charAt(0).toUpperCase()
  }

  const formatPrice = (price: number) => {
    if (!price || isNaN(price)) return '$0.00000000'
    if (price < 0.000001) return `$${price.toExponential(2)}`
    if (price < 0.001) return `$${price.toFixed(8)}`
    if (price < 1) return `$${price.toFixed(6)}`
    return `$${price.toFixed(4)}`
  }

  const formatMarketCap = (marketCap: number) => {
    if (!marketCap || isNaN(marketCap)) return '$0'
    if (marketCap >= 1000000) return `$${(marketCap / 1000000).toFixed(2)}M`
    if (marketCap >= 1000) return `$${(marketCap / 1000).toFixed(1)}K`
    return `$${marketCap.toFixed(2)}`
  }

  const formatValue = (value: number) => {
    if (!value || isNaN(value)) return '$0.00'
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`
    return `$${value.toFixed(2)}`
  }

  if (loading) {
    return (
      <div className="min-h-screen relative overflow-hidden bg-black">
        {/* Background Effects */}
        <div className="absolute inset-0">
          <div className="absolute top-20 left-10 w-72 h-72 bg-[#C0283D]/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-[#C0283D]/5 rounded-full blur-3xl"></div>
        </div>
        
        <div className="relative z-10 flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="relative w-16 h-16 mx-auto mb-8">
              <div className="absolute inset-0 border-4 border-gray-800 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-[#C0283D] border-t-transparent rounded-full animate-spin"></div>
            </div>
            <p className="text-white text-xl font-medium">Loading token data...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!token) {
    return (
      <div className="min-h-screen relative overflow-hidden bg-black">
        {/* Background Effects */}
        <div className="absolute inset-0">
          <div className="absolute top-20 left-10 w-72 h-72 bg-[#C0283D]/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-[#C0283D]/5 rounded-full blur-3xl"></div>
        </div>
        
        <div className="relative z-10 flex items-center justify-center min-h-screen">
          <div className="text-center max-w-md mx-auto p-8">
            <div className="w-24 h-24 mx-auto mb-8 rounded-3xl bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center border border-[#C0283D]/40">
              <span className="text-4xl">📊</span>
            </div>
            <h2 className="text-3xl font-bold mb-4 text-white">Token Not Found</h2>
            <p className="text-gray-400 leading-relaxed">
              The token you're looking for doesn't exist or couldn't be loaded. Please check the address and try again.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const riskLevel = token.riskLevel || RugDetector.getRiskLevel(token.rugScore) || 'MEDIUM'
  const riskColorMap: Record<string, string> = {
    LOW: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
    MEDIUM: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30',
    HIGH: 'text-orange-400 bg-orange-400/10 border-orange-400/30',
    EXTREME: 'text-red-400 bg-red-400/10 border-red-400/30'
  }
  const riskColors = riskColorMap[riskLevel] || 'text-gray-400 bg-gray-400/10 border-gray-400/30'

  const tabs = [
    { id: 'trade', name: 'Live Feed' },
    { id: 'chart', name: 'Chart' },
    { id: 'pnl', name: 'P&L Analysis' },
    { id: 'holders', name: 'Holders' },
  ]

  return (
    <div className="min-h-screen relative overflow-hidden bg-black">
      {/* Background Effects */}
      <div className="absolute inset-0">
        <div className="absolute top-20 left-10 w-72 h-72 bg-[#C0283D]/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-[#C0283D]/5 rounded-full blur-3xl"></div>
      </div>
      
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Token Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative mb-8 overflow-hidden rounded-2xl bg-black backdrop-blur-xl border border-[#C0283D]/40"
        >
          {token.bannerUrl && (
            <div className="absolute inset-0 opacity-20">
              <Image
                src={token.bannerUrl}
                alt="Token banner"
                width={1200}
                height={300}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-black/90"></div>
            </div>
          )}

          <div className="relative p-8">
            <div className="flex flex-col lg:flex-row items-start lg:items-center gap-8">
              <div className="flex items-center space-x-6">
                <div className="relative">
                  <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center overflow-hidden border border-[#C0283D]/40 shadow-2xl">
                    {token.imageUrl ? (
                      <Image src={token.imageUrl} alt={token.name} width={96} height={96} className="rounded-2xl" />
                    ) : (
                      <span className="text-2xl font-bold text-white">{getSymbolDisplay(token.symbol)}</span>
                    )}
                  </div>
                  {isLiveUpdating && (
                    <div className="absolute -top-2 -right-2 w-6 h-6 bg-emerald-400 rounded-full flex items-center justify-center animate-pulse border-2 border-black">
                      <div className="w-2 h-2 bg-white rounded-full"></div>
                    </div>
                  )}
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-center space-x-4">
                    <h1 className="text-4xl font-bold text-white">{token.name}</h1>
                    <button
                      onClick={() => refreshTokenPrice()}
                      disabled={refreshing}
                      className="p-3 rounded-xl bg-black/50 hover:bg-black/70 text-white/70 hover:text-white transition-all duration-200 border border-[#C0283D]/40 hover:border-[#C0283D]/40"
                      title="Refresh data"
                    >
                      <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
                    </button>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-lg font-mono text-white/90 px-4 py-2 bg-black/30 rounded-xl border border-[#C0283D]/40">
                      {token.symbol}
                    </span>
                    <div className={`flex items-center space-x-2 px-3 py-2 rounded-xl border text-sm font-medium ${riskColors}`}>
                      <Shield size={14} />
                      <span>{riskLevel} RISK</span>
                    </div>
                    {token.isGraduated && (
                      <div className="flex items-center space-x-2 text-emerald-400 px-3 py-2 bg-emerald-400/10 rounded-xl border border-emerald-400/30 text-sm font-medium">
                        <TrendingUp size={14} />
                        <span>Graduated</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex-1 lg:text-right">
                <div className="space-y-2">
                  <div className="text-3xl font-mono font-bold text-white">
                    {formatPrice(token.price)}
                  </div>
                  <div className={`text-lg font-semibold ${
                    (token.priceChange24h || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {(token.priceChange24h || 0) >= 0 ? '+' : ''}{(token.priceChange24h || 0).toFixed(2)}% 24h
                  </div>
                  <div className="text-white/70 font-medium">
                    Market Cap: {formatMarketCap(token.marketCap)}
                  </div>
                </div>
              </div>
            </div>

            {token.description && (
              <div className="mt-6 p-6 bg-black/30 backdrop-blur-xl rounded-xl border border-[#C0283D]/40">
                <p className="text-white/90 leading-relaxed">{token.description}</p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 mt-6">
              {token.website && (
                <a
                  href={token.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center space-x-2 text-white/70 hover:text-white transition-all duration-200 px-4 py-2 rounded-xl bg-black/30 hover:bg-black/50 border border-[#C0283D]/40 hover:border-[#C0283D]/40"
                >
                  <Globe size={16} />
                  <span className="text-sm font-medium">Website</span>
                </a>
              )}
              {token.twitter && (
                <a
                  href={token.twitter.startsWith('http') ? token.twitter : `https://twitter.com/${token.twitter.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center space-x-2 text-white/70 hover:text-blue-400 transition-all duration-200 px-4 py-2 rounded-xl bg-black/30 hover:bg-blue-400/10 border border-[#C0283D]/40 hover:border-blue-400/30"
                >
                  <Twitter size={16} />
                  <span className="text-sm font-medium">Twitter</span>
                </a>
              )}
              {token.telegram && (
                <a
                  href={token.telegram.startsWith('http') ? token.telegram : `https://t.me/${token.telegram.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center space-x-2 text-white/70 hover:text-blue-400 transition-all duration-200 px-4 py-2 rounded-xl bg-black/30 hover:bg-blue-400/10 border border-[#C0283D]/40 hover:border-blue-400/30"
                >
                  <MessageCircle size={16} />
                  <span className="text-sm font-medium">Telegram</span>
                </a>
              )}
            </div>
          </div>
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Tabs */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <div className="flex space-x-1 bg-black backdrop-blur-xl rounded-2xl p-2 border border-[#C0283D]/40">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 px-6 py-3 rounded-xl transition-all duration-200 font-medium text-sm ${
                      activeTab === tab.id
                        ? 'bg-[#C0283D]/20 text-white border border-[#C0283D]/40'
                        : 'text-white/70 hover:text-white hover:bg-black/50'
                    }`}
                  >
                    {tab.name}
                  </button>
                ))}
              </div>
            </motion.div>

            {/* Tab Content */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-black backdrop-blur-xl rounded-2xl p-8 border border-[#C0283D]/40"
            >
              {activeTab === 'chart' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-2xl font-bold text-white">Price Chart</h3>
                    <div className="flex items-center space-x-2 text-sm text-white/70 bg-black/50 px-4 py-2 rounded-xl border border-[#C0283D]/40">
                      <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                      <span className="font-medium">Live</span>
                    </div>
                  </div>
                  
                  {dataLoading.priceHistory ? (
                    <div className="flex items-center justify-center h-96 bg-black/50 rounded-2xl border border-[#C0283D]/40">
                      <div className="relative w-12 h-12">
                        <div className="absolute inset-0 border-4 border-gray-800 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-[#C0283D] border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    </div>
                  ) : priceHistory.length > 0 ? (
                    <div className="h-96 bg-black/50 rounded-2xl p-6 border border-[#C0283D]/40">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={priceHistory}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#FFFFFF" opacity={0.1} />
                          <XAxis dataKey="time" stroke="#FFFFFF" fontSize={12} opacity={0.7} />
                          <YAxis stroke="#FFFFFF" fontSize={12} opacity={0.7} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#000000',
                              border: '1px solid rgba(192, 40, 61, 0.2)',
                              borderRadius: '16px',
                              backdropFilter: 'blur(12px)',
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="price"
                            stroke="#C0283D"
                            strokeWidth={3}
                            dot={false}
                            activeDot={{ r: 8, fill: '#C0283D', strokeWidth: 0 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-96 bg-black/50 rounded-2xl border border-[#C0283D]/40">
                      <div className="text-6xl mb-6">📈</div>
                      <p className="text-white text-lg font-medium mb-2">Waiting for price data...</p>
                      <p className="text-white/50 text-sm">Chart will update automatically</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'pnl' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-2xl font-bold text-white">P&L Analysis</h3>
                    <div className="text-sm text-white/70 bg-black/50 px-4 py-2 rounded-xl border border-[#C0283D]/40">
                      Real-time P&L tracking
                    </div>
                  </div>
                  
                  {dataLoading.transactions ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="relative w-12 h-12">
                        <div className="absolute inset-0 border-4 border-gray-800 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-[#C0283D] border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    </div>
                  ) : transactions.length > 0 ? (
                    <div className="space-y-4 max-h-96 overflow-y-auto custom-scrollbar">
                      {transactions.map((tx, index) => (
                        <motion.div 
                          key={tx.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className="group p-6 bg-black/50 hover:bg-black/70 rounded-2xl border border-[#C0283D]/40 hover:border-[#C0283D]/40 transition-all duration-200"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-6">
                              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                                tx.type === 'buy' 
                                  ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/30' 
                                  : 'bg-red-400/10 text-red-400 border border-red-400/30'
                              }`}>
                                {tx.type === 'buy' ? '↗' : '↙'}
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center space-x-4">
                                  <span className="font-mono text-sm text-white bg-black/30 px-3 py-2 rounded-lg border border-[#C0283D]/40">
                                    {formatAddress(tx.userAddress)}
                                  </span>
                                  <span className={`text-xs px-3 py-1 rounded-lg font-medium ${
                                    tx.type === 'buy' 
                                      ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/30' 
                                      : 'bg-red-400/10 text-red-400 border border-red-400/30'
                                  }`}>
                                    {tx.type.toUpperCase()}
                                  </span>
                                </div>
                                <span className="text-xs text-white/50 font-medium">
                                  {formatTimeAgo(tx.createdAt)}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center space-x-8">
                              <div className="text-right">
                                <p className="text-sm font-medium text-white">
                                  {parseFloat(tx.amount).toLocaleString()} {token.symbol}
                                </p>
                                <p className="text-xs text-white/50 font-mono">
                                  ${parseFloat(tx.solAmount || '0').toFixed(4)}
                                </p>
                              </div>
                              <div className="text-right">
                                {formatPNL(tx.pnl || 0, tx.pnlPercentage || 0)}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                      <div className="text-8xl mb-6">📊</div>
                      <h4 className="text-xl font-medium text-white mb-3">No P&L Data Available</h4>
                      <p className="text-white/50 max-w-md">
                        P&L analysis will appear here once there's transaction data available for this token.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'holders' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-2xl font-bold text-white">Token Holders</h3>
                    <div className="flex items-center space-x-4">
                      <div className="text-sm text-white/70 bg-black/50 px-4 py-2 rounded-xl border border-[#C0283D]/40">
                        Updated: {new Date().toLocaleTimeString()}
                      </div>
                      <div className="text-sm font-medium text-white bg-black/30 px-4 py-2 rounded-xl border border-[#C0283D]/40">
                        {holders.length} holders
                      </div>
                    </div>
                  </div>
                  
                  {dataLoading.holders ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="relative w-12 h-12">
                        <div className="absolute inset-0 border-4 border-gray-800 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-[#C0283D] border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    </div>
                  ) : holders.length > 0 ? (
                    <div className="space-y-4 max-h-96 overflow-y-auto custom-scrollbar">
                      {holders.map((holder, index) => (
                        <motion.div 
                          key={holder.address}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className="group p-6 bg-black/50 hover:bg-black/70 rounded-2xl border border-[#C0283D]/40 hover:border-[#C0283D]/40 transition-all duration-200"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-6">
                              <div className="w-14 h-14 bg-black/30 rounded-xl flex items-center justify-center border border-[#C0283D]/40">
                                <span className="text-sm font-medium text-white">#{index + 1}</span>
                              </div>
                              <div className="space-y-2">
                                <span className="font-mono text-sm text-white bg-black/30 px-3 py-2 rounded-lg border border-[#C0283D]/40">
                                  {formatAddress(holder.address)}
                                </span>
                                {holder.lastActivity && (
                                  <div className="text-xs text-white/50 font-medium">
                                    Last active: {formatTimeAgo(holder.lastActivity)}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="text-right space-y-2">
                              <p className="text-sm font-medium text-white">
                                {parseFloat(holder.balance).toLocaleString()} {token.symbol}
                              </p>
                              <div className="flex items-center justify-end space-x-4 text-xs">
                                <span className="text-white/50 font-medium">
                                  {holder.percentage.toFixed(2)}%
                                </span>
                                {holder.value && (
                                  <span className="text-emerald-400 font-medium bg-emerald-400/10 px-3 py-1 rounded-lg border border-emerald-400/30">
                                    {formatValue(holder.value)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                      <div className="text-8xl mb-6">👥</div>
                      <h4 className="text-xl font-medium text-white mb-3">Loading Holders</h4>
                      <p className="text-white/50">
                        Fetching holder distribution data...
                      </p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'trade' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="text-2xl font-bold text-white">Live Transaction Feed</h3>
                    <div className="flex items-center space-x-2 text-sm bg-black/50 px-4 py-2 rounded-xl border border-[#C0283D]/40">
                      <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                      <span className="text-white/70 font-medium">Real-time</span>
                    </div>
                  </div>
                  
                  {dataLoading.transactions ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="relative w-12 h-12">
                        <div className="absolute inset-0 border-4 border-gray-800 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-[#C0283D] border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    </div>
                  ) : transactions.length > 0 ? (
                    <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar">
                      {transactions.map((tx, index) => (
                        <motion.div 
                          key={tx.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className="group p-5 bg-black/50 hover:bg-black/70 rounded-2xl border-l-4 border-l-transparent hover:border-l-[#C0283D] transition-all duration-200 border border-[#C0283D]/40 hover:border-[#C0283D]/40"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-5">
                              <div className={`w-4 h-4 rounded-full ${
                                tx.type === 'buy' ? 'bg-emerald-400 shadow-lg shadow-emerald-400/50' : 'bg-red-400 shadow-lg shadow-red-400/50'
                              }`}></div>
                              <div className="space-y-1">
                                <div className="flex items-center space-x-4">
                                  <span className="font-mono text-sm text-white bg-black/30 px-3 py-2 rounded-lg border border-[#C0283D]/40">
                                    {formatAddress(tx.userAddress)}
                                  </span>
                                  <span className={`text-xs px-3 py-1 rounded-lg font-medium ${
                                    tx.type === 'buy' 
                                      ? 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/30' 
                                      : 'bg-red-400/10 text-red-400 border border-red-400/30'
                                  }`}>
                                    {tx.type.toUpperCase()}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="text-right space-y-1">
                              <p className="text-sm font-medium text-white">
                                {parseFloat(tx.amount).toLocaleString()} {token.symbol}
                              </p>
                              <div className="flex items-center justify-end space-x-3 text-xs text-white/50">
                                <span className="font-medium">{formatTimeAgo(tx.createdAt)}</span>
                                <span className="w-1 h-1 bg-white/30 rounded-full"></span>
                                <span className="font-mono">${parseFloat(tx.solAmount || '0').toFixed(4)}</span>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                      <div className="text-8xl mb-6">⚡</div>
                      <h4 className="text-xl font-medium text-white mb-3">Waiting for Live Transactions</h4>
                      <p className="text-white/50 max-w-md">
                        New trades will appear here in real-time as they happen on the blockchain.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </div>

          {/* Trading Panel */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="space-y-6"
          >
            {/* Live Stats Card */}
            <div className="bg-black backdrop-blur-xl rounded-2xl p-6 border border-[#C0283D]/40">
              <div className="flex items-center justify-between mb-6">
                <h4 className="text-lg font-semibold text-white">Token Info</h4>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                  <span className="text-xs text-white/70 font-medium">Live</span>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center p-4 bg-black/50 rounded-xl border border-[#C0283D]/40">
                  <span className="text-white/70 font-medium">Price</span>
                  <span className="font-mono text-white font-medium">{formatPrice(token.price)}</span>
                </div>
                <div className="flex justify-between items-center p-4 bg-black/50 rounded-xl border border-[#C0283D]/40">
                  <span className="text-white/70 font-medium">Market Cap</span>
                  <span className="font-mono text-white font-medium">{formatMarketCap(token.marketCap)}</span>
                </div>
                <div className="flex justify-between items-center p-4 bg-black/50 rounded-xl border border-[#C0283D]/40">
                  <span className="text-white/70 font-medium">24h Volume</span>
                  <span className="font-mono text-white font-medium">{formatValue(token.volume24h || 0)}</span>
                </div>
                <div className="flex justify-between items-center p-4 bg-black/50 rounded-xl border border-[#C0283D]/40">
                  <span className="text-white/70 font-medium">24h Change</span>
                  <span className={`font-mono font-medium ${
                    (token.priceChange24h || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {(token.priceChange24h || 0) >= 0 ? '+' : ''}{(token.priceChange24h || 0).toFixed(2)}%
                  </span>
                </div>
                <div className="flex justify-between items-center p-4 bg-black/50 rounded-xl border border-[#C0283D]/40">
                  <span className="text-white/70 font-medium">Holders</span>
                  <span className="font-mono text-white font-medium">{holders.length.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center p-4 bg-black/50 rounded-xl border border-[#C0283D]/40">
                  <span className="text-white/70 font-medium">Supply</span>
                  <span className="font-mono text-white font-medium">{(token.totalSupply || 0).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Trading Interface */}
            <TradingInterface 
              token={token} 
              onPriceUpdate={refreshTokenPrice}
              onTransactionComplete={(tx) => {
                addNewTransaction(tx)
                fetchPriceHistory()
                fetchHolders()
              }}
            />
          </motion.div>
        </div>
      </div>
      
      {/* Custom Scrollbar Styles */}
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #C0283D;
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #E53E63;
        }
      `}</style>
    </div>
  )
}