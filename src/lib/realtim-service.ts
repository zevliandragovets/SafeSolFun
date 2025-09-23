import { EventEmitter } from 'events'

interface TokenUpdate {
  tokenId: string
  price: number
  marketCap: number
  volume24h: number
  priceChange24h: number
  timestamp: number
}

interface TransactionUpdate {
  tokenId: string
  transaction: {
    id: string
    type: 'buy' | 'sell'
    amount: number
    solAmount: number
    price: number
    userAddress: string
    createdAt: string
    txHash?: string
  }
}

interface HolderUpdate {
  tokenId: string
  holders: Array<{
    address: string
    balance: number
    percentage: number
    value: number
  }>
}

interface PriceHistoryUpdate {
  tokenId: string
  pricePoint: {
    time: string
    price: number
    volume: number
    timestamp: number
  }
}

interface SubscriptionOptions {
  tokenId: string
  includeTransactions?: boolean
  includeHolders?: boolean
  includePriceHistory?: boolean
  updateInterval?: number
}

class RealTimeService extends EventEmitter {
  private subscriptions: Map<string, SubscriptionOptions> = new Map()
  private intervals: Map<string, NodeJS.Timeout> = new Map()
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private isConnected = false

  constructor() {
    super()
    this.setupWebSocket()
  }

  // WebSocket connection management
  private setupWebSocket() {
    try {
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001'
      this.ws = new WebSocket(`${wsUrl}/realtime`)
      
      this.ws.onopen = () => {
        console.log('WebSocket connected')
        this.isConnected = true
        this.reconnectAttempts = 0
        this.emit('connected')
        
        // Resubscribe to all tokens
        this.subscriptions.forEach((options, tokenId) => {
          this.sendWebSocketMessage('subscribe', options)
        })
      }

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          this.handleWebSocketMessage(data)
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }

      this.ws.onclose = () => {
        console.log('WebSocket disconnected')
        this.isConnected = false
        this.emit('disconnected')
        this.handleReconnect()
      }

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        this.emit('error', error)
      }

    } catch (error) {
      console.warn('WebSocket not available, using polling fallback')
      this.setupPollingFallback()
    }
  }

  private handleWebSocketMessage(data: any) {
    switch (data.type) {
      case 'token_update':
        this.emit('tokenUpdate', data as TokenUpdate)
        break
      case 'transaction_update':
        this.emit('transactionUpdate', data as TransactionUpdate)
        break
      case 'holder_update':
        this.emit('holderUpdate', data as HolderUpdate)
        break
      case 'price_history_update':
        this.emit('priceHistoryUpdate', data as PriceHistoryUpdate)
        break
      case 'error':
        this.emit('error', new Error(data.message))
        break
    }
  }

  private sendWebSocketMessage(type: string, data: any) {
    if (this.ws && this.isConnected) {
      this.ws.send(JSON.stringify({ type, ...data }))
    }
  }

  private handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)
      
      console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`)
      
      setTimeout(() => {
        this.setupWebSocket()
      }, delay)
    } else {
      console.log('Max reconnect attempts reached, switching to polling fallback')
      this.setupPollingFallback()
    }
  }

  // Polling fallback when WebSocket is not available
  private setupPollingFallback() {
    console.log('Setting up polling fallback for real-time updates')
    
    this.subscriptions.forEach((options, tokenId) => {
      this.startPolling(tokenId, options)
    })
  }

  private startPolling(tokenId: string, options: SubscriptionOptions) {
    const intervalId = setInterval(async () => {
      try {
        await this.pollTokenData(tokenId, options)
      } catch (error) {
        console.error(`Polling error for token ${tokenId}:`, error)
      }
    }, options.updateInterval || 5000)

    this.intervals.set(tokenId, intervalId)
  }

  private async pollTokenData(tokenId: string, options: SubscriptionOptions) {
    const promises: Promise<any>[] = []

    // Poll token basic data
    promises.push(this.fetchTokenUpdate(tokenId))

    // Poll transactions if enabled
    if (options.includeTransactions) {
      promises.push(this.fetchRecentTransactions(tokenId))
    }

    // Poll holders if enabled
    if (options.includeHolders) {
      promises.push(this.fetchHoldersUpdate(tokenId))
    }

    // Poll price history if enabled
    if (options.includePriceHistory) {
      promises.push(this.fetchPriceHistoryUpdate(tokenId))
    }

    await Promise.allSettled(promises)
  }

  private async fetchTokenUpdate(tokenId: string) {
    try {
      const response = await fetch(`/api/tokens/${tokenId}`)
      if (response.ok) {
        const data = await response.json()
        const tokenData = data.data || data
        
        const update: TokenUpdate = {
          tokenId,
          price: parseFloat(tokenData.price?.toString() || '0'),
          marketCap: parseFloat(tokenData.marketCap?.toString() || '0'),
          volume24h: parseFloat(tokenData.volume24h?.toString() || '0'),
          priceChange24h: parseFloat(tokenData.priceChange24h?.toString() || '0'),
          timestamp: Date.now()
        }
        
        this.emit('tokenUpdate', update)
      }
    } catch (error) {
      console.error('Failed to fetch token update:', error)
    }
  }

  private async fetchRecentTransactions(tokenId: string) {
    try {
      const response = await fetch(`/api/tokens/${tokenId}/transactions?realtime=true&limit=10`)
      if (response.ok) {
        const result = await response.json()
        const transactions = result.data || []
        
        transactions.forEach((tx: any) => {
          const update: TransactionUpdate = {
            tokenId,
            transaction: {
              id: tx.id,
              type: tx.type,
              amount: parseFloat(tx.amount?.toString() || '0'),
              solAmount: parseFloat(tx.solAmount?.toString() || '0'),
              price: parseFloat(tx.price?.toString() || '0'),
              userAddress: tx.userAddress,
              createdAt: tx.createdAt,
              txHash: tx.txHash
            }
          }
          
          this.emit('transactionUpdate', update)
        })
      }
    } catch (error) {
      console.error('Failed to fetch recent transactions:', error)
    }
  }

  private async fetchHoldersUpdate(tokenId: string) {
    try {
      const response = await fetch(`/api/tokens/${tokenId}/holders?realtime=true&limit=20`)
      if (response.ok) {
        const result = await response.json()
        const holdersData = result.data || []
        
        const holders = holdersData.map((holder: any) => ({
          address: holder.address,
          balance: parseFloat(holder.balance?.toString() || '0'),
          percentage: parseFloat(holder.percentage?.toString() || '0'),
          value: holder.value || 0
        }))
        
        const update: HolderUpdate = {
          tokenId,
          holders
        }
        
        this.emit('holderUpdate', update)
      }
    } catch (error) {
      console.error('Failed to fetch holders update:', error)
    }
  }

  private async fetchPriceHistoryUpdate(tokenId: string) {
    try {
      const response = await fetch(`/api/tokens/${tokenId}/price-history?realtime=true&hours=1`)
      if (response.ok) {
        const result = await response.json()
        const historyData = result.data || []
        
        if (historyData.length > 0) {
          const latestPoint = historyData[historyData.length - 1]
          const update: PriceHistoryUpdate = {
            tokenId,
            pricePoint: {
              time: latestPoint.time,
              price: parseFloat(latestPoint.price?.toString() || '0'),
              volume: parseFloat(latestPoint.volume?.toString() || '0'),
              timestamp: latestPoint.timestamp || Date.now()
            }
          }
          
          this.emit('priceHistoryUpdate', update)
        }
      }
    } catch (error) {
      console.error('Failed to fetch price history update:', error)
    }
  }

  // Public methods for subscription management
  public subscribe(tokenId: string, options: Partial<SubscriptionOptions> = {}) {
    const subscriptionOptions: SubscriptionOptions = {
      tokenId,
      includeTransactions: true,
      includeHolders: false,
      includePriceHistory: true,
      updateInterval: 5000,
      ...options
    }

    this.subscriptions.set(tokenId, subscriptionOptions)

    if (this.isConnected && this.ws) {
      // Use WebSocket subscription
      this.sendWebSocketMessage('subscribe', subscriptionOptions)
    } else {
      // Use polling fallback
      this.startPolling(tokenId, subscriptionOptions)
    }

    console.log(`Subscribed to real-time updates for token ${tokenId}`)
    return () => this.unsubscribe(tokenId)
  }

  public unsubscribe(tokenId: string) {
    this.subscriptions.delete(tokenId)
    
    // Clear polling interval
    const intervalId = this.intervals.get(tokenId)
    if (intervalId) {
      clearInterval(intervalId)
      this.intervals.delete(tokenId)
    }

    // Send WebSocket unsubscribe message
    if (this.isConnected && this.ws) {
      this.sendWebSocketMessage('unsubscribe', { tokenId })
    }

    console.log(`Unsubscribed from real-time updates for token ${tokenId}`)
  }

  public unsubscribeAll() {
    const tokenIds = Array.from(this.subscriptions.keys())
    tokenIds.forEach(tokenId => this.unsubscribe(tokenId))
  }

  // Utility methods
  public isSubscribed(tokenId: string): boolean {
    return this.subscriptions.has(tokenId)
  }

  public getSubscriptions(): string[] {
    return Array.from(this.subscriptions.keys())
  }

  public getConnectionStatus(): 'connected' | 'disconnected' | 'connecting' {
    if (this.isConnected) return 'connected'
    if (this.reconnectAttempts > 0 && this.reconnectAttempts < this.maxReconnectAttempts) {
      return 'connecting'
    }
    return 'disconnected'
  }

  // Manual data refresh methods
  public async refreshToken(tokenId: string): Promise<void> {
    await this.fetchTokenUpdate(tokenId)
  }

  public async refreshTransactions(tokenId: string): Promise<void> {
    await this.fetchRecentTransactions(tokenId)
  }

  public async refreshHolders(tokenId: string): Promise<void> {
    await this.fetchHoldersUpdate(tokenId)
  }

  public async refreshPriceHistory(tokenId: string): Promise<void> {
    await this.fetchPriceHistoryUpdate(tokenId)
  }

  // Cleanup method
  public cleanup() {
    this.unsubscribeAll()
    
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    
    this.isConnected = false
    this.removeAllListeners()
  }
}

// Singleton instance
let realTimeServiceInstance: RealTimeService | null = null

export function getRealTimeService(): RealTimeService {
  if (!realTimeServiceInstance) {
    realTimeServiceInstance = new RealTimeService()
  }
  return realTimeServiceInstance
}

// Hook for React components
export function useRealTimeService() {
  return getRealTimeService()
}

// Types for external use
export type {
  TokenUpdate,
  TransactionUpdate,
  HolderUpdate,
  PriceHistoryUpdate,
  SubscriptionOptions
}

export { RealTimeService }