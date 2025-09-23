import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/database'

function serializeBigInt(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj
  }
  
  if (typeof obj === 'bigint') {
    return obj.toString()
  }
  
  if (obj instanceof Date) {
    return obj.toISOString()
  }
  
  if (Array.isArray(obj)) {
    return obj.map(serializeBigInt)
  }
  
  if (typeof obj === 'object') {
    const serialized: any = {}
    for (const [key, value] of Object.entries(obj)) {
      serialized[key] = serializeBigInt(value)
    }
    return serialized
  }
  
  return obj
}

function formatTimeAgo(dateString: string | Date): string {
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  
  const minutes = Math.floor(diff / (1000 * 60))
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  
  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  return `${minutes}m ago`
}

async function calculateUserPNL(userAddress: string, tokenId: string, currentPrice: number) {
  try {
    // Get all transactions for this user and token
    const userTransactions = await prisma.transaction.findMany({
      where: {
        userAddress,
        tokenId
      },
      orderBy: { createdAt: 'asc' },
      select: {
        type: true,
        amount: true,
        price: true,
        solAmount: true,
        createdAt: true
      }
    })

    let totalTokensBought = 0
    let totalSolSpent = 0
    let totalTokensSold = 0
    let totalSolReceived = 0
    let averageBuyPrice = 0

    // Calculate user's position
    userTransactions.forEach(tx => {
      const amount = parseFloat(tx.amount.toString())
      const solAmount = parseFloat(tx.solAmount?.toString() || tx.price?.toString() || '0')
      
      if (tx.type.toLowerCase() === 'buy') {
        totalTokensBought += amount
        totalSolSpent += solAmount
      } else {
        totalTokensSold += amount
        totalSolReceived += solAmount
      }
    })

    const currentTokenBalance = totalTokensBought - totalTokensSold
    
    if (totalTokensBought > 0) {
      averageBuyPrice = totalSolSpent / totalTokensBought
    }

    // Calculate unrealized P&L (for remaining tokens)
    const unrealizedPNL = currentTokenBalance > 0 ? 
      (currentPrice - averageBuyPrice) * currentTokenBalance : 0

    // Calculate realized P&L (from sold tokens)
    const realizedPNL = totalSolReceived - (totalTokensSold * averageBuyPrice)

    const totalPNL = unrealizedPNL + realizedPNL
    const pnlPercentage = totalSolSpent > 0 ? (totalPNL / totalSolSpent) * 100 : 0

    return {
      totalPNL,
      pnlPercentage,
      unrealizedPNL,
      realizedPNL,
      currentBalance: currentTokenBalance,
      averageBuyPrice,
      totalInvested: totalSolSpent
    }
  } catch (error) {
    console.error('Error calculating user P&L:', error)
    return null
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
    
    // Parse query parameters
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100) // Cap at 100
    const page = parseInt(searchParams.get('page') || '1')
    const type = searchParams.get('type') as 'BUY' | 'SELL' | null
    const userAddress = searchParams.get('userAddress')
    const includeRealtime = searchParams.get('realtime') === 'true'
    const includePNL = searchParams.get('pnl') === 'true'
    
    // Validate token exists and get current price
    const token = await prisma.token.findUnique({
      where: { id },
      select: { 
        id: true, 
        symbol: true, 
        name: true,
        price: true 
      }
    })
    
    if (!token) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 })
    }

    const currentPrice = parseFloat(token.price.toString())
    
    // Build where clause
    const where: any = { tokenId: id }
    if (type) {
      where.type = type.toLowerCase()
    }
    if (userAddress) {
      where.userAddress = userAddress
    }

    // For real-time requests, get very recent transactions (last 5 minutes)
    if (includeRealtime) {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
      where.createdAt = {
        gte: fiveMinutesAgo
      }
    }
    
    // Fetch transactions with pagination
    const [transactions, totalCount] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
        select: {
          id: true,
          type: true,
          amount: true,
          solAmount: true,
          price: true,
          userAddress: true,
          createdAt: true
          // Note: txHash removed as it's not in the Prisma schema
        }
      }),
      includeRealtime ? Promise.resolve(0) : prisma.transaction.count({ where }) // Skip count for realtime to improve performance
    ])
    
    // Process transactions for frontend
    const processedTransactions = await Promise.all(
      transactions.map(async (tx) => {
        const serialized = serializeBigInt(tx)
        const txPrice = parseFloat(serialized.price?.toString() || serialized.solAmount?.toString() || '0')
        const amount = parseFloat(serialized.amount.toString())
        
        let pnlData = null
        if (includePNL && currentPrice > 0) {
          // Calculate individual transaction P&L
          if (serialized.type.toLowerCase() === 'buy') {
            const currentValue = amount * currentPrice
            const investedValue = amount * txPrice
            const pnl = currentValue - investedValue
            const pnlPercentage = investedValue > 0 ? (pnl / investedValue) * 100 : 0
            
            pnlData = {
              pnl,
              pnlPercentage,
              currentValue,
              investedValue
            }
          } else {
            // For sell transactions, P&L is the SOL received
            const solReceived = parseFloat(serialized.solAmount?.toString() || '0')
            pnlData = {
              pnl: solReceived,
              pnlPercentage: 0, // Would need buy history to calculate
              realizedGains: solReceived
            }
          }

          // Get user's overall P&L if requested
          if (userAddress === serialized.userAddress) {
            const userPNL = await calculateUserPNL(serialized.userAddress, id, currentPrice)
            if (userPNL) {
              pnlData = { ...pnlData, userPNL }
            }
          }
        }
        
        return {
          id: serialized.id,
          type: serialized.type.toLowerCase(),
          amount: amount,
          solAmount: parseFloat(serialized.solAmount?.toString() || '0'),
          price: txPrice,
          userAddress: serialized.userAddress,
          createdAt: serialized.createdAt,
          timeAgo: formatTimeAgo(serialized.createdAt),
          txHash: null, // Set to null if not available in schema
          ...pnlData
        }
      })
    )
    
    // Calculate volume statistics
    const totalVolume = processedTransactions.reduce((sum, tx) => {
      return sum + (tx.solAmount || 0)
    }, 0)

    const buyVolume = processedTransactions
      .filter(tx => tx.type === 'buy')
      .reduce((sum, tx) => sum + (tx.solAmount || 0), 0)

    const sellVolume = processedTransactions
      .filter(tx => tx.type === 'sell')
      .reduce((sum, tx) => sum + (tx.solAmount || 0), 0)
    
    // Calculate pagination info
    const totalPages = includeRealtime ? 1 : Math.ceil(totalCount / limit)
    const hasNext = includeRealtime ? false : page < totalPages
    const hasPrev = includeRealtime ? false : page > 1
    
    const response = {
      success: true,
      data: processedTransactions,
      pagination: {
        page,
        limit,
        totalCount: includeRealtime ? processedTransactions.length : totalCount,
        totalPages,
        hasNext,
        hasPrev
      },
      meta: {
        tokenSymbol: token.symbol,
        tokenName: token.name,
        currentPrice,
        totalTransactions: includeRealtime ? processedTransactions.length : totalCount,
        totalVolume,
        buyVolume,
        sellVolume,
        volumeRatio: totalVolume > 0 ? buyVolume / totalVolume : 0,
        isRealtime: includeRealtime,
        timestamp: new Date().toISOString()
      }
    }

    // Set appropriate cache headers
    const res = NextResponse.json(response)
    
    if (includeRealtime) {
      // No caching for real-time data
      res.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
      res.headers.set('Pragma', 'no-cache')
      res.headers.set('Expires', '0')
    } else {
      // Short cache for historical data
      res.headers.set('Cache-Control', 'public, max-age=30')
    }
    
    return res
    
  } catch (error) {
    console.error('Error fetching transactions:', error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      }, 
      { status: 500 }
    )
  }
}