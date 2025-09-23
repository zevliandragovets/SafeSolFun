'use client'
import { useState, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { motion } from 'framer-motion'
import { ArrowUpDown, RefreshCw, TrendingUp, TrendingDown, AlertTriangle, Zap } from 'lucide-react'
import toast from 'react-hot-toast'

interface TradingInterfaceProps {
  token: {
    id: string
    name: string
    symbol: string
    price: number
    currentSupply?: number
    totalSupply?: number
    marketCap?: number
  }
  onPriceUpdate?: () => void
  onTransactionComplete?: (transaction: any) => void
}

interface TradingFees {
  buyFee: number
  sellFee: number
  platformFee: number
}

interface TokenBalance {
  balance: string
  usdValue: number
}

interface QuoteData {
  inputAmount: number
  outputAmount: number
  priceImpact: number
  fees: number
  minReceived: number
}

export function TradingInterface({ token, onPriceUpdate, onTransactionComplete }: TradingInterfaceProps) {
  const { connected, publicKey } = useWallet()
  const [isBuying, setIsBuying] = useState(true)
  const [amount, setAmount] = useState('')
  const [slippage, setSlippage] = useState(1)
  const [customSlippage, setCustomSlippage] = useState('')
  const [loading, setLoading] = useState(false)
  const [fees, setFees] = useState<TradingFees | null>(null)
  const [tokenBalance, setTokenBalance] = useState<TokenBalance | null>(null)
  const [solBalance, setSolBalance] = useState<number>(0)
  const [quote, setQuote] = useState<QuoteData | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [refreshingPrice, setRefreshingPrice] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Fetch user balances when wallet connects
  useEffect(() => {
    if (connected && publicKey) {
      fetchUserBalances()
      fetchTradingFees()
    } else {
      setTokenBalance(null)
      setSolBalance(0)
    }
  }, [connected, publicKey, token.id])

  // Get quote when amount or trade direction changes
  useEffect(() => {
    if (amount && parseFloat(amount) > 0) {
      fetchQuote()
    } else {
      setQuote(null)
    }
  }, [amount, isBuying, slippage, token.id])

  const fetchUserBalances = async () => {
    if (!publicKey) return

    try {
      const [solResponse, tokenResponse] = await Promise.all([
        fetch(`/api/users/${publicKey.toString()}/sol-balance`),
        fetch(`/api/users/${publicKey.toString()}/token-balance/${token.id}`)
      ])

      if (solResponse.ok) {
        const solData = await solResponse.json()
        setSolBalance(solData.balance)
      }

      if (tokenResponse.ok) {
        const tokenData = await tokenResponse.json()
        setTokenBalance(tokenData)
      }
    } catch (error) {
      console.error('Failed to fetch user balances:', error)
    }
  }

  const fetchTradingFees = async () => {
    try {
      const response = await fetch(`/api/tokens/${token.id}/fees`)
      if (response.ok) {
        const feesData = await response.json()
        setFees(feesData)
      }
    } catch (error) {
      console.error('Failed to fetch trading fees:', error)
      // Set default fees if API fails
      setFees({
        buyFee: 1,
        sellFee: 1,
        platformFee: 0.5
      })
    }
  }

  const fetchQuote = async () => {
    if (!amount || parseFloat(amount) <= 0) return

    setQuoteLoading(true)
    try {
      const response = await fetch(`/api/tokens/${token.id}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputAmount: parseFloat(amount),
          isBuying,
          slippage: customSlippage ? parseFloat(customSlippage) : slippage
        })
      })

      if (response.ok) {
        const quoteData = await response.json()
        setQuote(quoteData)
      }
    } catch (error) {
      console.error('Failed to fetch quote:', error)
    } finally {
      setQuoteLoading(false)
    }
  }

  const refreshPrice = async () => {
    setRefreshingPrice(true)
    try {
      await fetchQuote()
      if (onPriceUpdate) onPriceUpdate()
      toast.success('Price updated')
    } catch (error) {
      toast.error('Failed to refresh price')
    } finally {
      setRefreshingPrice(false)
    }
  }

  const handleMaxClick = () => {
    if (isBuying) {
      const maxSol = solBalance * 0.95 // Leave 5% for transaction fees
      setAmount(maxSol.toString())
    } else if (tokenBalance) {
      setAmount(tokenBalance.balance)
    }
  }

  const handleTrade = async () => {
    if (!connected || !publicKey) {
      toast.error('Please connect your wallet')
      return
    }

    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Please enter a valid amount')
      return
    }

    if (isBuying && parseFloat(amount) > solBalance) {
      toast.error('Insufficient SOL balance')
      return
    }

    if (!isBuying && tokenBalance && parseFloat(amount) > parseFloat(tokenBalance.balance)) {
      toast.error(`Insufficient ${token.symbol} balance`)
      return
    }

    if (!quote) {
      toast.error('Unable to get price quote. Please try again.')
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/tokens/${token.id}/${isBuying ? 'buy' : 'sell'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(amount),
          slippage: customSlippage ? parseFloat(customSlippage) : slippage,
          userAddress: publicKey.toString(),
          quote: quote
        })
      })

      const data = await response.json()

      if (response.ok) {
        toast.success(`${isBuying ? 'Buy' : 'Sell'} order executed successfully!`)
        setAmount('')
        setQuote(null)
        // Refresh balances and notify parent
        await fetchUserBalances()
        if (onTransactionComplete) onTransactionComplete(data)
      } else {
        throw new Error(data.error || 'Transaction failed')
      }
    } catch (error: any) {
      toast.error(error.message || 'Transaction failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const currentSlippage = customSlippage ? parseFloat(customSlippage) : slippage
  const isValidAmount = amount && parseFloat(amount) > 0
  const hasInsufficientBalance = isBuying 
    ? parseFloat(amount || '0') > solBalance
    : tokenBalance && parseFloat(amount || '0') > parseFloat(tokenBalance.balance)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-black backdrop-blur-xl rounded-2xl p-8 border border-[#C0283D]/40"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h4 className="text-xl font-semibold text-white">{token.symbol}</h4>
        <button
          onClick={refreshPrice}
          disabled={refreshingPrice}
          className="p-3 rounded-xl bg-black/50 hover:bg-black/70 text-white/70 hover:text-white transition-all duration-200 border border-[#C0283D]/40 hover:border-[#C0283D]/60"
          title="Refresh price"
        >
          <RefreshCw size={18} className={refreshingPrice ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Trade Type Selector */}
      <div className="mb-8">
        <div className="grid grid-cols-2 gap-2 bg-black/50 rounded-2xl p-2 border border-[#C0283D]/40">
          <button
            onClick={() => setIsBuying(true)}
            className={`flex items-center justify-center space-x-3 py-4 rounded-xl font-medium transition-all duration-200 ${
              isBuying 
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30' 
                : 'text-white/70 hover:text-white hover:bg-black/30'
            }`}
          >
            <TrendingUp size={20} />
            <span>Buy</span>
          </button>
          <button
            onClick={() => setIsBuying(false)}
            className={`flex items-center justify-center space-x-3 py-4 rounded-xl font-medium transition-all duration-200 ${
              !isBuying 
                ? 'bg-red-600 text-white shadow-lg shadow-red-600/30' 
                : 'text-white/70 hover:text-white hover:bg-black/30'
            }`}
          >
            <TrendingDown size={20} />
            <span>Sell</span>
          </button>
        </div>
      </div>

      {/* Balance Display */}
      {connected && (
        <div className="mb-8 p-6 bg-black/50 rounded-2xl border border-[#C0283D]/40">         
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-black/30 rounded-xl border border-[#C0283D]/40">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-white/70 font-medium">SOL</span>
                <span className="text-lg font-semibold text-white">{solBalance.toFixed(4)}</span>
              </div>
              <div className="text-xs text-white/40 font-medium">
                ≈ ${(solBalance * 150).toFixed(2)} USD
              </div>
            </div>
            
            <div className="p-4 bg-black/30 rounded-xl border border-[#C0283D]/40">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-white/70 font-medium">{token.symbol}</span>
                <span className="text-lg font-semibold text-white">
                  {tokenBalance ? parseFloat(tokenBalance.balance).toLocaleString() : '0'}
                </span>
              </div>
              <div className="text-xs text-white/40 font-medium">
                ≈ ${tokenBalance ? tokenBalance.usdValue.toFixed(2) : '0.00'} USD
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* Amount Input */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <label className="text-lg font-medium text-white">
              Amount ({isBuying ? 'SOL' : token.symbol})
            </label>
            {connected && (
              <button
                onClick={handleMaxClick}
                className="px-4 py-2 text-sm font-medium text-white bg-black/30 hover:bg-black/50 rounded-xl border border-[#C0283D]/40 hover:border-[#C0283D]/40 transition-all duration-200"
              >
                MAX
              </button>
            )}
          </div>
          <div className="relative">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              className={`w-full bg-black/50 border-2 rounded-2xl px-6 py-4 text-xl font-semibold text-white placeholder-white/40 focus:ring-2 focus:ring-[#C0283D] focus:border-[#C0283D] transition-all duration-200 ${
                hasInsufficientBalance ? 'border-red-400' : 'border-[#C0283D]/40'
              }`}
            />
            <div className="absolute right-6 top-1/2 transform -translate-y-1/2">
              <span className="text-white/50 font-medium text-lg">
                {isBuying ? 'SOL' : token.symbol}
              </span>
            </div>
          </div>
          {hasInsufficientBalance && (
            <div className="flex items-center space-x-3 mt-3 text-red-400">
              <AlertTriangle size={16} />
              <p className="text-sm font-medium">Insufficient balance</p>
            </div>
          )}
        </div>

        {/* Slippage Settings */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <label className="text-lg font-medium text-white">
              Slippage Tolerance
            </label>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-sm text-white/70 hover:text-white transition-colors font-medium"
            >
              {showAdvanced ? 'Simple' : 'Advanced'}
            </button>
          </div>
          
          <div className="grid grid-cols-4 gap-2 mb-4">
            {[0.5, 1, 3, 5].map((value) => (
              <button
                key={value}
                onClick={() => {
                  setSlippage(value)
                  setCustomSlippage('')
                }}
                className={`py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  slippage === value && !customSlippage
                    ? 'bg-[#C0283D] text-white shadow-lg shadow-[#C0283D]/30'
                    : 'bg-black/50 text-white/70 hover:bg-black/70 hover:text-white border border-[#C0283D]/40'
                }`}
              >
                {value}%
              </button>
            ))}
          </div>
          
          {showAdvanced && (
            <input
              type="number"
              value={customSlippage}
              onChange={(e) => setCustomSlippage(e.target.value)}
              placeholder="Custom slippage %"
              className="w-full bg-black/50 border border-[#C0283D]/40 rounded-xl px-4 py-3 text-sm font-medium text-white placeholder-white/40 focus:ring-2 focus:ring-[#C0283D] focus:border-[#C0283D] transition-all duration-200"
            />
          )}
        </div>

        {/* Quote Information */}
        <div className="bg-black/50 rounded-2xl p-6 space-y-4 border border-[#C0283D]/40">
          <div className="flex items-center space-x-3 mb-4">
            <div className="text-4xl">📊</div>
            <h4 className="text-lg font-medium text-white">Transaction Details</h4>
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-black/30 rounded-xl border border-[#C0283D]/40">
              <span className="text-white/70 font-medium">Current Price</span>
              <div className="flex items-center space-x-3">
                <span className="font-mono font-medium text-white">${token.price.toFixed(8)}</span>
              </div>
            </div>
            
            {fees && (
              <div className="flex justify-between items-center p-3 bg-black/30 rounded-xl border border-[#C0283D]/40">
                <span className="text-white/70 font-medium">Trading Fee</span>
                <span className="font-medium text-white">{isBuying ? fees.buyFee : fees.sellFee}%</span>
              </div>
            )}

            {quote && !quoteLoading ? (
              <>
                <div className="flex justify-between items-center p-3 bg-black/30 rounded-xl border border-[#C0283D]/40">
                  <span className="text-white/70 font-medium">Price Impact</span>
                  <span className={`font-medium ${quote.priceImpact > 5 ? 'text-red-400' : 'text-white'}`}>
                    {quote.priceImpact.toFixed(2)}%
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-black/30 rounded-xl border border-[#C0283D]/40">
                  <span className="text-white/70 font-medium">Min. Received</span>
                  <span className="font-medium text-white">
                    {quote.minReceived.toFixed(isBuying ? 2 : 6)} {isBuying ? token.symbol : 'SOL'}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-4 border-t border-[#C0283D]/40">
                  <span className="text-white font-medium text-lg">You will receive</span>
                  <span className="font-semibold text-xl text-emerald-400">
                    {quote.outputAmount.toFixed(isBuying ? 2 : 6)} {isBuying ? token.symbol : 'SOL'}
                  </span>
                </div>
              </>
            ) : isValidAmount && quoteLoading ? (
              <div className="flex justify-center py-6">
                <div className="w-8 h-8 border-2 border-[#C0283D] border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Trade Button */}
        <button
          onClick={handleTrade}
          disabled={loading || !connected || !isValidAmount || hasInsufficientBalance || !quote}
          className={`w-full py-4 rounded-2xl font-semibold text-lg transition-all duration-200 flex items-center justify-center space-x-4 shadow-lg ${
            isBuying
              ? loading || !connected || hasInsufficientBalance || !quote
                ? 'bg-black/30 text-white/50 cursor-not-allowed border border-[#C0283D]/40' 
                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/40 hover:shadow-emerald-600/60 border border-emerald-600'
              : loading || !connected || hasInsufficientBalance || !quote
              ? 'bg-black/30 text-white/50 cursor-not-allowed border border-[#C0283D]/40'
              : 'bg-red-600 hover:bg-red-700 text-white shadow-red-600/40 hover:shadow-red-600/60 border border-red-600'
          }`}
        >
          {loading ? (
            <>
              <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
              <span>Processing Transaction...</span>
            </>
          ) : !connected ? (
            <>
              <div className="text-2xl">🔗</div>
              <span>Connect Wallet</span>
            </>
          ) : hasInsufficientBalance ? (
            <>
              <AlertTriangle size={24} />
              <span>Insufficient Balance</span>
            </>
          ) : (
            <>
              <Zap size={24} />
              <span>{isBuying ? 'Buy' : 'Sell'} {token.symbol}</span>
            </>
          )}
        </button>

        {!connected && (
          <div className="text-center p-8 bg-black/50 rounded-2xl border border-[#C0283D]/40">
            <div className="text-8xl mb-6">👛</div>
            <p className="text-white font-medium mb-3">Wallet Not Connected</p>
            <p className="text-white/50 text-sm">
              Connect your Solana wallet to start trading this token
            </p>
          </div>
        )}
      </div>
    </motion.div>
  )
}