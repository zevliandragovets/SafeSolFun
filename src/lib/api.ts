import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000, // 30 second timeout for blockchain operations
})

// Add request interceptor for debugging
api.interceptors.request.use((config) => {
  console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`, config.data)
  return config
})

// Add response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.data || error.message)
    return Promise.reject(error)
  }
)

export interface CreateTokenData {
  name: string
  symbol: string
  description?: string
  imageUrl?: string
  bannerUrl?: string
  website?: string
  twitter?: string
  telegram?: string
  creatorAddress: string
  totalSupply?: number
  initialBuy?: number
}

export interface TokenFilters {
  search?: string
  sortBy?: 'newest' | 'oldest' | 'marketCap' | 'price' | 'name' | 'symbol'
  category?: 'new' | 'graduating' | 'graduated' | 'watchlist' | 'all'
  limit?: number
}

export interface TradeData {
  solAmount?: number
  tokenAmount?: number
  slippage: number
  buyerAddress?: string
  sellerAddress?: string
}

export interface PaginationParams {
  page?: number
  limit?: number
  type?: 'BUY' | 'SELL'
  userAddress?: string
}

export const tokenApi = {
  // Token CRUD operations
  createToken: (data: CreateTokenData) => 
    api.post('/tokens', data),
  
  getTokens: (filters: TokenFilters = {}) => 
    api.get('/tokens', { params: filters }),
  
  getToken: (id: string) => 
    api.get(`/tokens/${id}`),
  
  // Trading operations
  buyToken: (tokenId: string, solAmount: number, slippage: number = 5, buyerAddress: string) => 
    api.post(`/tokens/${tokenId}/buy`, { 
      solAmount, 
      slippage, 
      buyerAddress 
    }),
  
  sellToken: (tokenId: string, tokenAmount: number, slippage: number = 5, sellerAddress: string) => 
    api.post(`/tokens/${tokenId}/sell`, { 
      tokenAmount, 
      slippage, 
      sellerAddress 
    }),

  // Transaction history
  getTransactions: (tokenId: string, params: PaginationParams = {}) =>
    api.get(`/tokens/${tokenId}/transactions`, { params }),

  // Watchlist operations
  addToWatchlist: (tokenId: string, userAddress: string) => 
    api.post(`/tokens/${tokenId}/watchlist`, { userAddress }),
  
  removeFromWatchlist: (tokenId: string, userAddress: string) => 
    api.delete(`/tokens/${tokenId}/watchlist`, { data: { userAddress } }),
  
  getUserWatchlist: (userAddress: string, limit: number = 50) =>
    api.get(`/watchlist/${userAddress}`, { params: { limit } }),

  // Creator fees
  getCreatorFees: (creatorAddress: string) => 
    api.get(`/creator-fees/${creatorAddress}`),
  
  claimCreatorFees: (creatorAddress: string, tokenAddress?: string) => 
    api.post('/creator-fees/claim', { creatorAddress, tokenAddress }),

  // Analytics and statistics
  getAnalytics: (period: '24h' | '7d' | '30d' = '24h') =>
    api.get('/analytics', { params: { period } }),

  // Price calculation helpers (client-side)
  calculateBuyAmount: (solAmount: number, currentSupply: number) => {
    // Implement bonding curve calculation on client side for preview
    const INITIAL_VIRTUAL_SOL_RESERVES = 30
    const INITIAL_VIRTUAL_TOKEN_RESERVES = 1_073_000_000
    
    const virtualSolReserves = INITIAL_VIRTUAL_SOL_RESERVES
    const virtualTokenReserves = INITIAL_VIRTUAL_TOKEN_RESERVES - currentSupply
    const k = virtualSolReserves * virtualTokenReserves
    const newTokenReserves = k / (virtualSolReserves + solAmount)
    
    return Math.floor(virtualTokenReserves - newTokenReserves)
  },

  calculateSellAmount: (tokenAmount: number, currentSupply: number) => {
    // Calculate SOL received for selling tokens
    const INITIAL_VIRTUAL_SOL_RESERVES = 30
    const INITIAL_VIRTUAL_TOKEN_RESERVES = 1_073_000_000
    
    const virtualSolReserves = INITIAL_VIRTUAL_SOL_RESERVES
    const virtualTokenReserves = INITIAL_VIRTUAL_TOKEN_RESERVES - currentSupply
    const k = virtualSolReserves * virtualTokenReserves
    const newSolReserves = k / (virtualTokenReserves + tokenAmount)
    
    const solOut = virtualSolReserves - newSolReserves
    return Math.max(0, solOut * 0.95) // Apply 5% sell fee
  }
}

// Utility functions for the API client
export const apiUtils = {
  /**
   * Format API errors for display
   */
  formatError: (error: any): string => {
    if (error.response?.data?.error) {
      return error.response.data.error
    }
    if (error.response?.data?.message) {
      return error.response.data.message
    }
    if (error.message) {
      return error.message
    }
    return 'An unexpected error occurred'
  },

  /**
   * Check if error is a validation error
   */
  isValidationError: (error: any): boolean => {
    return error.response?.status === 400 && error.response?.data?.details
  },

  /**
   * Get validation error details
   */
  getValidationErrors: (error: any): string[] => {
    if (error.response?.data?.details) {
      return error.response.data.details
    }
    return []
  },

  /**
   * Retry function for failed requests
   */
  retry: async <T>(
    fn: () => Promise<T>, 
    retries: number = 3, 
    delay: number = 1000
  ): Promise<T> => {
    try {
      return await fn()
    } catch (error) {
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, delay))
        return apiUtils.retry(fn, retries - 1, delay * 2)
      }
      throw error
    }
  },

  /**
   * Debounced API call
   */
  debounce: <T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): T => {
    let timeout: NodeJS.Timeout
    return ((...args: any[]) => {
      clearTimeout(timeout)
      timeout = setTimeout(() => func.apply(null, args), wait)
    }) as T
  }
}

// WebSocket connection for real-time updates (optional enhancement)
export class TokenWebSocket {
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  
  constructor(private url: string = 'ws://localhost:3000/api/ws') {}

  connect() {
    try {
      this.ws = new WebSocket(this.url)
      
      this.ws.onopen = () => {
        console.log('WebSocket connected')
        this.reconnectAttempts = 0
      }
      
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          this.handleMessage(data)
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }
      
      this.ws.onclose = () => {
        console.log('WebSocket disconnected')
        this.reconnect()
      }
      
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error)
      }
    } catch (error) {
      console.error('Failed to connect WebSocket:', error)
      this.reconnect()
    }
  }

  private reconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      setTimeout(() => {
        this.reconnectAttempts++
        console.log(`Reconnecting WebSocket (attempt ${this.reconnectAttempts})`)
        this.connect()
      }, this.reconnectDelay * Math.pow(2, this.reconnectAttempts))
    }
  }

  private handleMessage(data: any) {
    // Handle different message types
    switch (data.type) {
      case 'PRICE_UPDATE':
        // Dispatch price update event
        window.dispatchEvent(new CustomEvent('tokenPriceUpdate', { detail: data }))
        break
      case 'NEW_TRANSACTION':
        // Dispatch transaction event
        window.dispatchEvent(new CustomEvent('newTransaction', { detail: data }))
        break
      case 'TOKEN_GRADUATED':
        // Dispatch graduation event
        window.dispatchEvent(new CustomEvent('tokenGraduated', { detail: data }))
        break
      default:
        console.log('Unknown WebSocket message type:', data.type)
    }
  }

  subscribeToToken(tokenId: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'SUBSCRIBE',
        tokenId
      }))
    }
  }

  unsubscribeFromToken(tokenId: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'UNSUBSCRIBE',
        tokenId
      }))
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }
}

// Export default api instance
export default api