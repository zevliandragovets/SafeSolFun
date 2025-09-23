import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/database'

interface PricePoint {
  time: string;
  price: number;
  volume: number;
  timestamp: number;
  transactions: number;
}

// Generate real-time price history from actual transactions
async function generateRealTimePriceHistory(tokenId: string, hours: number = 24): Promise<PricePoint[]> {
  try {
    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000)
    
    // Get all transactions within the time period
    const transactions = await prisma.transaction.findMany({
      where: {
        tokenId,
        createdAt: {
          gte: startTime
        }
      },
      orderBy: { createdAt: 'asc' },
      select: {
        price: true,
        solAmount: true,
        amount: true,
        createdAt: true,
        type: true
      }
    })

    if (transactions.length === 0) {
      console.log(`No transactions found for token ${tokenId} in the last ${hours} hours`)
      return []
    }

    console.log(`Found ${transactions.length} transactions for price history calculation`)

    // Group transactions by time intervals (15-minute intervals for better granularity)
    const intervalMinutes = 15
    const intervalMs = intervalMinutes * 60 * 1000
    const priceMap = new Map<number, {
      prices: number[];
      volumes: number[];
      transactions: number;
      timestamp: number;
    }>()

    transactions.forEach(tx => {
      const txTime = tx.createdAt.getTime()
      const intervalStart = Math.floor(txTime / intervalMs) * intervalMs
      
      // Calculate effective price from transaction
      const solAmount = parseFloat(tx.solAmount?.toString() || '0')
      const tokenAmount = parseFloat(tx.amount.toString())
      const txPrice = tx.price ? 
        parseFloat(tx.price.toString()) : 
        (solAmount / Math.max(tokenAmount, 0.000001)) // Prevent division by zero

      if (txPrice > 0 && txPrice < 1000000) { // Filter out unrealistic prices
        if (!priceMap.has(intervalStart)) {
          priceMap.set(intervalStart, {
            prices: [],
            volumes: [],
            transactions: 0,
            timestamp: intervalStart
          })
        }

        const interval = priceMap.get(intervalStart)!
        interval.prices.push(txPrice)
        interval.volumes.push(solAmount)
        interval.transactions += 1
      }
    })

    // Convert to price history format
    const priceHistory: PricePoint[] = Array.from(priceMap.values())
      .map(interval => {
        // Calculate volume-weighted average price (VWAP)
        const totalVolume = interval.volumes.reduce((sum, vol) => sum + vol, 0)
        const vwap = totalVolume > 0 ? 
          interval.prices.reduce((sum, price, i) => sum + (price * interval.volumes[i]), 0) / totalVolume :
          interval.prices.reduce((sum, price) => sum + price, 0) / interval.prices.length

        return {
          time: new Date(interval.timestamp).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          }),
          price: vwap,
          volume: totalVolume,
          transactions: interval.transactions,
          timestamp: interval.timestamp
        }
      })
      .sort((a, b) => a.timestamp - b.timestamp)

    return priceHistory

  } catch (error) {
    console.error('Error generating real-time price history:', error)
    return []
  }
}

// Get stored price history from database
async function getStoredPriceHistory(tokenId: string, hours: number = 24): Promise<PricePoint[]> {
  try {
    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000)
    
    const storedHistory = await prisma.priceHistory.findMany({
      where: { 
        tokenId,
        createdAt: {
          gte: startTime
        }
      },
      orderBy: { createdAt: 'asc' },
      select: {
        price: true,
        volume: true,
        createdAt: true
      }
    })
    
    return storedHistory.map(entry => ({
      time: entry.createdAt.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false
      }),
      price: parseFloat(entry.price.toString()),
      volume: parseFloat(entry.volume?.toString() || '0'),
      timestamp: entry.createdAt.getTime(),
      transactions: 1
    }))
    
  } catch (error) {
    console.warn('PriceHistory table not accessible:', error)
    return []
  }
}

// Store price point in database for future use
async function storePricePoint(tokenId: string, price: number, volume: number) {
  try {
    await prisma.priceHistory.create({
      data: {
        tokenId,
        price: price.toString(),
        volume: volume.toString(),
        createdAt: new Date()
      }
    })
  } catch (error) {
    console.warn('Could not store price point:', error)
  }
}

// Calculate current price from recent transactions
async function getCurrentPrice(tokenId: string): Promise<number> {
  try {
    const recentTx = await prisma.transaction.findFirst({
      where: { tokenId },
      orderBy: { createdAt: 'desc' },
      select: {
        price: true,
        solAmount: true,
        amount: true
      }
    })

    if (recentTx) {
      const price = recentTx.price ? 
        parseFloat(recentTx.price.toString()) :
        parseFloat(recentTx.solAmount?.toString() || '0') / parseFloat(recentTx.amount.toString())
      
      return price > 0 ? price : 0
    }

    // Fallback to token's stored price
    const token = await prisma.token.findUnique({
      where: { id: tokenId },
      select: { price: true }
    })

    return token ? parseFloat(token.price.toString()) : 0

  } catch (error) {
    console.error('Error getting current price:', error)
    return 0
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    
    if (!id) {
      return NextResponse.json({ error: 'Token ID is required' }, { status: 400 })
    }
    
    const hours = parseInt(searchParams.get('hours') || '24')
    const realtime = searchParams.get('realtime') === 'true'
    const granularity = searchParams.get('granularity') || 'auto' // auto, 1m, 5m, 15m, 1h
    
    // Get token info
    const token = await prisma.token.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        symbol: true,
        price: true,
        createdAt: true
      }
    })
    
    if (!token) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 })
    }
    
    let priceHistory: PricePoint[] = []
    let source = 'none'
    
    try {
      // Priority 1: Try to get stored price history
      const storedHistory = await getStoredPriceHistory(id, hours)
      
      if (storedHistory.length >= 3) { // Need minimum data points
        priceHistory = storedHistory
        source = 'stored'
        console.log(`Using ${storedHistory.length} stored price points for ${token.symbol}`)
      } else {
        // Priority 2: Generate from transaction history
        const transactionHistory = await generateRealTimePriceHistory(id, hours)
        
        if (transactionHistory.length > 0) {
          priceHistory = transactionHistory
          source = 'transactions'
          console.log(`Generated ${transactionHistory.length} price points from transactions for ${token.symbol}`)
          
          // Store the latest price point for future use
          const latestPoint = transactionHistory[transactionHistory.length - 1]
          await storePricePoint(id, latestPoint.price, latestPoint.volume)
        }
      }
      
      // If we still don't have data, create a minimal current price point
      if (priceHistory.length === 0) {
        const currentPrice = await getCurrentPrice(id)
        if (currentPrice > 0) {
          priceHistory = [{
            time: new Date().toLocaleTimeString('en-US', { 
              hour: '2-digit', 
              minute: '2-digit',
              hour12: false
            }),
            price: currentPrice,
            volume: 0,
            timestamp: Date.now(),
            transactions: 0
          }]
          source = 'current'
          console.log(`Using current price ${currentPrice} for ${token.symbol}`)
        }
      }
      
      // Apply granularity filter if specified
      if (granularity !== 'auto' && priceHistory.length > 0) {
        priceHistory = applyGranularityFilter(priceHistory, granularity)
      }
      
      // Ensure chronological order
      priceHistory.sort((a, b) => a.timestamp - b.timestamp)
      
      // Calculate additional metrics
      const metrics = calculatePriceMetrics(priceHistory)
      
      const response = {
        success: true,
        data: priceHistory.map(point => ({
          time: point.time,
          price: point.price,
          volume: point.volume,
          transactions: point.transactions
        })),
        meta: {
          tokenSymbol: token.symbol,
          tokenName: token.name,
          dataSource: source,
          totalPoints: priceHistory.length,
          timeRange: `${hours}h`,
          granularity,
          isRealtime: realtime,
          timestamp: new Date().toISOString(),
          ...metrics
        }
      }
      
      // Set appropriate cache headers
      const res = NextResponse.json(response)
      
      if (realtime || source === 'current') {
        // No caching for real-time data
        res.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
        res.headers.set('Pragma', 'no-cache')
        res.headers.set('Expires', '0')
      } else {
        // Short cache for historical data
        res.headers.set('Cache-Control', 'public, max-age=60')
      }
      
      return res
      
    } catch (dataError) {
      console.error('Error processing price history data:', dataError)
      
      // Return minimal fallback data
      const currentPrice = await getCurrentPrice(id)
      const fallbackData = [{
        time: new Date().toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: false
        }),
        price: currentPrice || 0.000001,
        volume: 0,
        transactions: 0
      }]
      
      return NextResponse.json({
        success: true,
        data: fallbackData,
        meta: {
          tokenSymbol: token.symbol,
          dataSource: 'fallback',
          totalPoints: 1,
          timeRange: `${hours}h`,
          isRealtime: realtime,
          timestamp: new Date().toISOString(),
          warning: 'Limited data available'
        }
      })
    }
    
  } catch (error) {
    console.error('Error fetching price history:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

// Helper function to apply granularity filtering
function applyGranularityFilter(data: PricePoint[], granularity: string): PricePoint[] {
  if (data.length === 0) return data
  
  const intervals: { [key: string]: number } = {
    '1m': 1 * 60 * 1000,
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000
  }
  
  const intervalMs = intervals[granularity]
  if (!intervalMs) return data
  
  const grouped = new Map<number, PricePoint[]>()
  
  data.forEach(point => {
    const bucket = Math.floor(point.timestamp / intervalMs) * intervalMs
    if (!grouped.has(bucket)) {
      grouped.set(bucket, [])
    }
    grouped.get(bucket)!.push(point)
  })
  
  return Array.from(grouped.entries()).map(([timestamp, points]) => {
    const totalVolume = points.reduce((sum, p) => sum + p.volume, 0)
    const totalTransactions = points.reduce((sum, p) => sum + p.transactions, 0)
    
    // Volume-weighted average price
    const vwap = totalVolume > 0 ?
      points.reduce((sum, p) => sum + (p.price * p.volume), 0) / totalVolume :
      points.reduce((sum, p) => sum + p.price, 0) / points.length
    
    return {
      time: new Date(timestamp).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }),
      price: vwap,
      volume: totalVolume,
      transactions: totalTransactions,
      timestamp
    }
  }).sort((a, b) => a.timestamp - b.timestamp)
}

// Calculate price metrics
function calculatePriceMetrics(data: PricePoint[]) {
  if (data.length === 0) {
    return {
      currentPrice: 0,
      highPrice: 0,
      lowPrice: 0,
      priceChange: 0,
      priceChangePercent: 0,
      totalVolume: 0,
      averageVolume: 0,
      totalTransactions: 0
    }
  }
  
  const prices = data.map(p => p.price)
  const volumes = data.map(p => p.volume)
  
  const currentPrice = prices[prices.length - 1]
  const firstPrice = prices[0]
  const highPrice = Math.max(...prices)
  const lowPrice = Math.min(...prices.filter(p => p > 0))
  
  const priceChange = currentPrice - firstPrice
  const priceChangePercent = firstPrice > 0 ? (priceChange / firstPrice) * 100 : 0
  
  const totalVolume = volumes.reduce((sum, vol) => sum + vol, 0)
  const averageVolume = totalVolume / data.length
  const totalTransactions = data.reduce((sum, p) => sum + p.transactions, 0)
  
  return {
    currentPrice,
    highPrice,
    lowPrice,
    priceChange,
    priceChangePercent,
    totalVolume,
    averageVolume,
    totalTransactions
  }
}

// WebSocket endpoint for real-time price updates
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    
    if (!id) {
      return NextResponse.json({ error: 'Token ID is required' }, { status: 400 })
    }
    
    const { price, volume = 0, timestamp = Date.now() } = body
    
    if (!price || price <= 0) {
      return NextResponse.json({ error: 'Valid price is required' }, { status: 400 })
    }
    
    // Store the real-time price point
    await storePricePoint(id, price, volume)
    
    // Update token's current price
    await prisma.token.update({
      where: { id },
      data: { 
        price: price.toString(),
        updatedAt: new Date()
      }
    })
    
    return NextResponse.json({
      success: true,
      message: 'Price updated successfully',
      data: {
        tokenId: id,
        price,
        volume,
        timestamp: new Date().toISOString()
      }
    })
    
  } catch (error) {
    console.error('Error updating real-time price:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to update price',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}