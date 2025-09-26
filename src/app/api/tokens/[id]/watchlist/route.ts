import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/database'
import { RugDetector, BondingCurve } from '@/lib/solana'

// Remove explicit type definitions to let TypeScript infer from Prisma
// This prevents type mismatches between expected bigint and actual number types

// Comprehensive BigInt serialization function
function serializeBigInt(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj
  }
  
  if (typeof obj === 'bigint') {
    return Number(obj)
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

// Helper function for time ago calculation
function getTimeAgo(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSeconds < 60) return `${diffSeconds}s ago`
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${diffDays}d ago`
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    
    // Check if this is a transactions request
    const endpoint = searchParams.get('endpoint')
    
    if (endpoint === 'transactions') {
      return getTransactions(request, id)
    }
    
    // Default: Get token details
    return getTokenDetails(request, id)

  } catch (error) {
    console.error('Route handler error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}

// Token details handler
async function getTokenDetails(request: NextRequest, id: string) {
  try {
    // Fetch token with related data
    const token = await prisma.token.findUnique({
      where: { id },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: {
            id: true,
            type: true,
            amount: true,
            solAmount: true,
            price: true,
            userAddress: true,
            signature: true,
            createdAt: true
          }
        },
        _count: {
          select: {
            transactions: true,
            watchlists: true
          }
        }
      }
    })

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Token not found' },
        { status: 404 }
      )
    }

    // Serialize the token data to handle BigInt fields
    const serializedToken = serializeBigInt(token)
    
    // Calculate additional analytics
    const riskAnalysis = RugDetector.getDetailedAnalysis(serializedToken)
    const bondingCurveProgress = BondingCurve.getProgress(serializedToken.currentSupply)

    // Calculate 24h statistics - remove explicit typing
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const volume24h = token.transactions
      .filter((tx) => tx.createdAt > last24h)
      .reduce((sum, tx) => sum + Number(tx.solAmount), 0)

    const uniqueHolders = new Set(token.transactions.map((tx) => tx.userAddress)).size
    
    // Mock price change (in production, you'd calculate from historical data)
    const priceChange24h = Math.random() * 20 - 10 // -10% to +10%

    // Format response data
    const responseData = {
      success: true,
      data: {
        ...serializedToken,
        riskLevel: riskAnalysis.riskLevel,
        riskScore: riskAnalysis.score,
        riskAnalysis: riskAnalysis,
        bondingCurve: {
          progress: bondingCurveProgress,
          targetSupply: BondingCurve.TARGET_SUPPLY,
          graduationMarketCap: BondingCurve.GRADUATION_MARKET_CAP,
          isGraduated: serializedToken.isGraduated
        },
        statistics: {
          priceChange24h,
          volume24h,
          transactionCount: token._count.transactions,
          watchlistCount: token._count.watchlists,
          holderCount: uniqueHolders,
          ath: serializedToken.price,
          atl: serializedToken.price * 0.1
        },
        recentTransactions: token.transactions.map((tx) => ({
          ...serializeBigInt(tx),
          userAddress: tx.userAddress.slice(0, 4) + '...' + tx.userAddress.slice(-4),
          timeAgo: getTimeAgo(tx.createdAt)
        }))
      }
    }

    return NextResponse.json(responseData)

  } catch (error) {
    console.error('Get token details error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch token details' },
      { status: 500 }
    )
  }
}

// Transactions handler
async function getTransactions(request: NextRequest, id: string) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
    const type = searchParams.get('type')
    const userAddress = searchParams.get('userAddress')

    const skip = (page - 1) * limit

    let where: any = { tokenId: id }
    
    if (type && ['BUY', 'SELL'].includes(type)) {
      where.type = type
    }
    
    if (userAddress) {
      where.userAddress = userAddress
    }

    const [transactions, totalCount] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          token: {
            select: {
              name: true,
              symbol: true,
              imageUrl: true
            }
          }
        }
      }),
      prisma.transaction.count({ where })
    ])

    const totalPages = Math.ceil(totalCount / limit)

    const responseData = {
      success: true,
      data: {
        transactions: transactions.map((tx) => ({
          ...serializeBigInt(tx),
          userAddress: tx.userAddress.slice(0, 4) + '...' + tx.userAddress.slice(-4),
          timeAgo: getTimeAgo(tx.createdAt),
          usdValue: Number(tx.solAmount) * 212.29, // Mock SOL price
          explorerUrl: `https://explorer.solana.com/tx/${tx.signature}?cluster=devnet`
        })),
        pagination: {
          page,
          limit,
          totalPages,
          totalCount,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      }
    }

    return NextResponse.json(responseData)

  } catch (error) {
    console.error('Get transactions error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch transactions' },
      { status: 500 }
    )
  }
}
