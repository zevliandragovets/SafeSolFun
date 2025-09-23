'use client'
import { useState, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { motion } from 'framer-motion'
import { 
  DollarSign, 
  TrendingUp, 
  Clock, 
  Download, 
  Wallet, 
  ArrowUpRight, 
  Info,
  Sparkles,
  ChevronRight,
  Activity,
  Zap,
  Shield,
  Award,
  ArrowDownRight,
  Coins
} from 'lucide-react'
import { tokenApi } from '@/lib/api'
import toast from 'react-hot-toast'

interface CreatorFee {
  id: string
  tokenAddress: string
  tokenName: string
  tokenSymbol: string
  totalFees: number
  claimedFees: number
  availableFees: number // Changed from unclaimedFees to match API response
  lastClaimedAt?: string
}

interface CreatorFeesResponse {
  success: boolean
  data: {
    creatorAddress: string
    summary: {
      totalEarned: number
      totalClaimed: number
      availableToClaim: number
      activeTokens: number
      tokensWithClaimableFees: number
      fullyClaimedTokens: number
    }
    fees: CreatorFee[]
  }
}

export default function CreatorFeesPage() {
  const { connected, publicKey } = useWallet()
  const [fees, setFees] = useState<CreatorFee[]>([])
  const [loading, setLoading] = useState(true)
  const [claimingFees, setClaimingFees] = useState<string | null>(null)
  const [summary, setSummary] = useState({
    totalEarned: 0,
    totalClaimed: 0,
    availableToClaim: 0
  })

  useEffect(() => {
    if (connected && publicKey) {
      fetchCreatorFees()
    } else {
      setLoading(false)
      setFees([])
      setSummary({ totalEarned: 0, totalClaimed: 0, availableToClaim: 0 })
    }
  }, [connected, publicKey])

  const fetchCreatorFees = async () => {
    if (!publicKey) return
    
    setLoading(true)
    try {
      // Assuming your API returns the structure from the route we fixed earlier
      const response = await fetch(`/api/creator-fees/${publicKey.toString()}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch creator fees')
      }
      
      const data: CreatorFeesResponse = await response.json()
      
      if (data.success) {
        setFees(data.data.fees || [])
        setSummary({
          totalEarned: data.data.summary.totalEarned,
          totalClaimed: data.data.summary.totalClaimed,
          availableToClaim: data.data.summary.availableToClaim
        })
      } else {
        throw new Error('API returned error')
      }
    } catch (error) {
      console.error('Failed to fetch creator fees:', error)
      toast.error('Failed to load creator fees')
      setFees([])
      setSummary({ totalEarned: 0, totalClaimed: 0, availableToClaim: 0 })
    } finally {
      setLoading(false)
    }
  }

  const handleClaimFees = async (tokenAddress: string) => {
    if (!publicKey) return
    
    setClaimingFees(tokenAddress)
    try {
      const response = await fetch('/api/creator-fees/claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          creatorAddress: publicKey.toString(),
          tokenAddress
        })
      })
      
      if (!response.ok) {
        throw new Error('Failed to claim fees')
      }
      
      const result = await response.json()
      
      if (result.success) {
        toast.success('Fees claimed successfully!')
        fetchCreatorFees() // Refresh the data
      } else {
        throw new Error(result.error || 'Failed to claim fees')
      }
    } catch (error) {
      console.error('Claim fees error:', error)
      toast.error('Failed to claim fees. Please try again.')
    } finally {
      setClaimingFees(null)
    }
  }

  const handleClaimAll = async () => {
    if (!publicKey) return
    
    const tokensWithFees = Array.isArray(fees) ? fees.filter(fee => fee.availableFees > 0) : []
    if (tokensWithFees.length === 0) return

    setClaimingFees('all')
    try {
      const response = await fetch('/api/creator-fees/claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          creatorAddress: publicKey.toString()
          // No tokenAddress means claim all
        })
      })
      
      if (!response.ok) {
        throw new Error('Failed to claim all fees')
      }
      
      const result = await response.json()
      
      if (result.success) {
        toast.success('All fees claimed successfully!')
        fetchCreatorFees() // Refresh the data
      } else {
        throw new Error(result.error || 'Failed to claim all fees')
      }
    } catch (error) {
      console.error('Claim all fees error:', error)
      toast.error('Failed to claim some fees. Please try again.')
    } finally {
      setClaimingFees(null)
    }
  }

  // Safe calculations with fallbacks
  const totalUnclaimedFees = summary.availableToClaim
  const totalClaimedFees = summary.totalClaimed
  const totalEarnings = summary.totalEarned
  
  // Ensure fees is always an array
  const safeFeesArray = Array.isArray(fees) ? fees : []

  if (!connected) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-md"
        >
          <div className="relative mb-8">
            <div className="w-24 h-24 bg-gradient-to-br from-[#C0283D] to-[#C0283D]/60 rounded-3xl flex items-center justify-center mx-auto shadow-2xl shadow-[#C0283D]/30">
              <Wallet className="text-white" size={40} />
            </div>
            <div className="absolute -top-2 -right-2 w-6 h-6 bg-[#C0283D] rounded-full animate-pulse" />
          </div>
          
          <h2 className="text-4xl font-bold mb-4 text-white">Connect Your Wallet</h2>
          <p className="text-gray-400 leading-relaxed mb-8">
            Connect your wallet to access your creator dashboard and claim your earnings from token trading activity.
          </p>
          
          <div className="flex items-center justify-center gap-6 text-gray-500">
            <div className="flex items-center gap-2">
              <Shield size={16} />
              <span className="text-sm">Secure</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap size={16} />
              <span className="text-sm">Instant</span>
            </div>
            <div className="flex items-center gap-2">
              <Award size={16} />
              <span className="text-sm">Rewards</span>
            </div>
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Professional Header */}
      <div className="relative overflow-hidden border-b border-gray-900">
        <div className="absolute inset-0 bg-gradient-to-br from-[#C0283D]/5 to-transparent" />
        <div className="relative px-6 py-12">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="items-center text-center">
              <div>
                <div className="inline-flex items-center gap-2 bg-[#C0283D]/10 border border-[#C0283D]/30 rounded-full px-4 py-1.5 mb-4">
                  <Sparkles size={14} className="text-[#C0283D]" />
                  <span className="text-xs font-medium text-[#C0283D] uppercase tracking-wider">Creator Dashboard</span>
                </div>
                <h1 className="text-5xl font-bold text-white mb-3 tracking-tight">
                  Your Earnings
                </h1>
                <p className="text-gray-400 text-lg">
                  Track and claim your creator fees from token trading activity
                </p>
              </div>
              
              {totalUnclaimedFees > 0 && safeFeesArray.filter(f => f.availableFees > 0).length > 1 && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleClaimAll}
                  disabled={claimingFees === 'all'}
                  className="hidden md:flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#C0283D] to-[#C0283D]/80 text-white font-medium rounded-2xl shadow-xl shadow-[#C0283D]/20 hover:shadow-2xl hover:shadow-[#C0283D]/30 transition-all"
                >
                  {claimingFees === 'all' ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Claiming All...</span>
                    </>
                  ) : (
                    <>
                      <Download size={18} />
                      <span>Claim All Fees</span>
                    </>
                  )}
                </motion.button>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Enhanced Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          {/* Available to Claim - Primary Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            whileHover={{ y: -4 }}
            className="relative group"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-[#C0283D]/20 to-[#C0283D]/5 rounded-3xl blur-xl group-hover:blur-2xl transition-all" />
            <div className="relative bg-gradient-to-br from-[#C0283D]/10 via-black to-black border border-[#C0283D]/30 rounded-3xl p-8 backdrop-blur-sm">
              <div className="flex items-start justify-between mb-6">
                <div className="p-3 bg-[#C0283D]/20 rounded-2xl backdrop-blur-sm">
                  <DollarSign className="text-[#C0283D]" size={28} />
                </div>
                {totalUnclaimedFees > 0 && (
                  <div className="flex items-center gap-1.5 text-[#C0283D] bg-[#C0283D]/10 px-3 py-1 rounded-full">
                    <div className="w-2 h-2 bg-[#C0283D] rounded-full animate-pulse" />
                    <span className="text-xs font-semibold">Available</span>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <h3 className="text-4xl font-bold text-white">
                  {totalUnclaimedFees.toFixed(4)}
                </h3>
                <p className="text-sm text-gray-400">SOL ready to claim</p>
              </div>
              {totalUnclaimedFees > 0 && (
                <div className="mt-6 flex items-center text-[#C0283D]">
                  <Activity size={16} className="mr-2 animate-pulse" />
                  <span className="text-sm font-medium">Claim now to receive funds</span>
                </div>
              )}
            </div>
          </motion.div>

          {/* Total Earnings */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            whileHover={{ y: -4 }}
            className="relative bg-black border border-gray-800 rounded-3xl p-8 backdrop-blur-sm hover:border-gray-700 transition-all"
          >
            <div className="flex items-start justify-between mb-6">
              <div className="p-3 bg-gray-900 rounded-2xl">
                <TrendingUp className="text-gray-400" size={28} />
              </div>
              <div className="flex items-center gap-1 text-gray-500 text-xs">
                <span>All-time</span>
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-4xl font-bold text-white">
                {totalEarnings.toFixed(4)}
              </h3>
              <p className="text-sm text-gray-400">SOL total earnings</p>
            </div>
            <div className="mt-6 flex items-center justify-between text-xs">
              <span className="text-gray-500">Lifetime performance</span>
              <ArrowUpRight size={14} className="text-green-500" />
            </div>
          </motion.div>

          {/* Claimed */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            whileHover={{ y: -4 }}
            className="relative bg-black border border-gray-800 rounded-3xl p-8 backdrop-blur-sm hover:border-gray-700 transition-all"
          >
            <div className="flex items-start justify-between mb-6">
              <div className="p-3 bg-gray-900 rounded-2xl">
                <Coins className="text-gray-400" size={28} />
              </div>
              <div className="flex items-center gap-1 text-gray-500 text-xs">
                <span>Withdrawn</span>
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-4xl font-bold text-white">
                {totalClaimedFees.toFixed(4)}
              </h3>
              <p className="text-sm text-gray-400">SOL claimed</p>
            </div>
            <div className="mt-6 flex items-center justify-between text-xs">
              <span className="text-gray-500">Successfully withdrawn</span>
              <Download size={14} className="text-gray-500" />
            </div>
          </motion.div>
        </div>

        {/* Professional Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-black/50 backdrop-blur-sm rounded-3xl border border-gray-800 overflow-hidden"
        >
          {/* Table Header */}
          <div className="px-8 py-6 border-b border-gray-800 bg-gradient-to-r from-gray-900/50 to-transparent">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-white">Your Tokens</h2>
                <p className="text-sm text-gray-400 mt-1">
                  Manage creator fees from your deployed tokens
                </p>
              </div>
              {safeFeesArray.length > 0 && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 rounded-full">
                    <Info size={14} className="text-gray-400" />
                    <span className="text-sm text-gray-400">
                      {safeFeesArray.length} {safeFeesArray.length === 1 ? 'Token' : 'Tokens'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {loading ? (
            <div className="px-8 py-20">
              <div className="flex flex-col items-center justify-center">
                <div className="relative w-16 h-16 mb-6">
                  <div className="absolute inset-0 border-4 border-[#C0283D]/20 rounded-full"></div>
                  <div className="absolute inset-0 border-4 border-[#C0283D] border-t-transparent rounded-full animate-spin"></div>
                </div>
                <p className="text-gray-400 text-lg">Loading your creator fees...</p>
              </div>
            </div>
          ) : safeFeesArray.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="px-8 py-5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Token
                    </th>
                    <th className="px-8 py-5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Total Earned
                    </th>
                    <th className="px-8 py-5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Available
                    </th>
                    <th className="px-8 py-5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Last Claim
                    </th>
                    <th className="px-8 py-5 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {safeFeesArray.map((fee) => (
                    <motion.tr 
                      key={fee.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      whileHover={{ backgroundColor: 'rgba(31, 41, 55, 0.3)' }}
                      className="group transition-colors"
                    >
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-4">
                          <div className="relative">
                            <div className="w-12 h-12 bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl flex items-center justify-center group-hover:from-gray-700 group-hover:to-gray-800 transition-all">
                              <span className="text-sm font-bold text-gray-300">
                                {fee.tokenSymbol.slice(0, 2).toUpperCase()}
                              </span>
                            </div>
                            {fee.availableFees > 0 && (
                              <div className="absolute -top-1 -right-1 w-3 h-3 bg-[#C0283D] rounded-full animate-pulse" />
                            )}
                          </div>
                          <div>
                            <div className="font-semibold text-white text-base">{fee.tokenName}</div>
                            <div className="text-sm text-gray-500">${fee.tokenSymbol}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex flex-col">
                          <span className="text-white font-semibold text-base">
                            {fee.totalFees.toFixed(4)} SOL
                          </span>
                          <span className="text-xs text-gray-500 mt-1">Lifetime</span>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        {fee.availableFees > 0 ? (
                          <div className="flex items-center gap-2">
                            <div className="relative flex items-center gap-2">
                              <div className="w-2 h-2 bg-[#C0283D] rounded-full animate-pulse"></div>
                              <span className="text-[#C0283D] font-bold text-base">
                                {fee.availableFees.toFixed(4)} SOL
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                      <td className="px-8 py-6">
                        {fee.lastClaimedAt ? (
                          <div className="flex items-center gap-2 text-sm text-gray-400">
                            <Clock size={14} />
                            <span>{new Date(fee.lastClaimedAt).toLocaleDateString()}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-500">Never claimed</span>
                        )}
                      </td>
                      <td className="px-8 py-6 text-right">
                        <motion.button
                          whileHover={{ scale: fee.availableFees > 0 ? 1.05 : 1 }}
                          whileTap={{ scale: fee.availableFees > 0 ? 0.95 : 1 }}
                          onClick={() => handleClaimFees(fee.tokenAddress)}
                          disabled={fee.availableFees <= 0 || claimingFees === fee.tokenAddress}
                          className={`
                            px-5 py-2.5 rounded-xl text-sm font-semibold transition-all
                            ${fee.availableFees > 0 
                              ? 'bg-gradient-to-r from-[#C0283D] to-[#C0283D]/80 hover:from-[#C0283D]/90 hover:to-[#C0283D]/70 text-white shadow-lg shadow-[#C0283D]/25 hover:shadow-xl hover:shadow-[#C0283D]/30' 
                              : 'bg-gray-800/50 text-gray-500 cursor-not-allowed'
                            }
                            ${claimingFees === fee.tokenAddress ? 'opacity-75' : ''}
                          `}
                        >
                          {claimingFees === fee.tokenAddress ? (
                            <div className="flex items-center justify-center gap-2">
                              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                              <span>Claiming...</span>
                            </div>
                          ) : fee.availableFees > 0 ? (
                            <div className="flex items-center gap-2">
                              <span>Claim</span>
                              <ChevronRight size={14} />
                            </div>
                          ) : (
                            'No Fees'
                          )}
                        </motion.button>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-8 py-20">
              <div className="text-center max-w-md mx-auto">
                <div className="w-20 h-20 bg-gradient-to-br from-gray-800 to-gray-900 rounded-3xl flex items-center justify-center mx-auto mb-6">
                  <DollarSign className="text-gray-600" size={36} />
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">No Tokens Yet</h3>
                <p className="text-gray-400 mb-8 leading-relaxed">
                  Create your first token to start earning creator fees from trading activity
                </p>
                <motion.a
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  href="/create"
                  className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-[#C0283D] to-[#C0283D]/80 text-white font-semibold rounded-2xl shadow-xl shadow-[#C0283D]/20 hover:shadow-2xl hover:shadow-[#C0283D]/30 transition-all"
                >
                  <Zap size={18} />
                  <span>Create Your First Token</span>
                  <ArrowUpRight size={18} />
                </motion.a>
              </div>
            </div>
          )}
        </motion.div>

        {/* Mobile Claim All Button */}
        {totalUnclaimedFees > 0 && safeFeesArray.filter(f => f.availableFees > 0).length > 1 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="md:hidden mt-6"
          >
            <button
              onClick={handleClaimAll}
              disabled={claimingFees === 'all'}
              className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-[#C0283D] to-[#C0283D]/80 text-white font-semibold rounded-2xl shadow-xl shadow-[#C0283D]/20"
            >
              {claimingFees === 'all' ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Claiming All Fees...</span>
                </>
              ) : (
                <>
                  <Download size={18} />
                  <span>Claim All Available Fees</span>
                </>
              )}
            </button>
          </motion.div>
        )}
      </div>
    </div>
  )
}