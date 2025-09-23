import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/database'

interface HolderData {
  address: string;
  balance: number;
  percentage: number;
  value: number;
  firstBuy: Date;
  lastActivity: Date;
  totalBought: number;
  totalSold: number;
  averageBuyPrice: number;
  unrealizedPNL: number;
  realizedPNL: number;
  transactionCount: number;
  isWhale: boolean;
}

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

async function calculateRealTimeHolders(tokenId: string, currentPrice: number, totalSupply: number): Promise<HolderData[]> {
  try {
    console.log(`Calculating real-time holders for token ${tokenId}`)
    
    // Get all transactions for this token
    const transactions = await prisma.transaction.findMany({
      where: { tokenId },
      select: {
        userAddress: true,
        type: true,
        amount: true,
        price: true,
        solAmount: true,
        createdAt: true
      },
      orderBy: { createdAt: 'asc' }
    })

    if (transactions.length === 0) {
      console.log(`No transactions found for token ${tokenId}`)
      return []
    }

    console.log(`Processing ${transactions.length} transactions`)

    // Group transactions by user address
    const userMap = new Map<string, {
      totalBought: number;
      totalSold: number;
      totalSolSpent: number;
      totalSolReceived: number;
      transactions: Array<{
        type: string;
        amount: number;
        price: number;
        createdAt: Date;
      }>;
      firstBuy?: Date;
      lastActivity: Date;
    }>()

    // Process each transaction
    transactions.forEach(tx => {
      const address = tx.userAddress
      const amount = parseFloat(tx.amount.toString())
      const price = tx.price ? 
        parseFloat(tx.price.toString()) : 
        parseFloat(tx.solAmount?.toString() || '0') / amount
      const solAmount = parseFloat(tx.solAmount?.toString() || '0')

      if (!userMap.has(address)) {
        userMap.set(address, {
          totalBought: 0,
          totalSold: 0,
          totalSolSpent: 0,
          totalSolReceived: 0,
          transactions: [],
          lastActivity: tx.createdAt
        })
      }

      const user = userMap.get(address)!
      
      if (tx.type.toLowerCase() === 'buy') {
        user.totalBought += amount
        user.totalSolSpent += solAmount
        if (!user.firstBuy) {
          user.firstBuy = tx.createdAt
        }
      } else {
        user.totalSold += amount
        user.totalSolReceived += solAmount
      }

      user.transactions.push({
        type: tx.type.toLowerCase(),
        amount,
        price,
        createdAt: tx.createdAt
      })

      if (tx.createdAt > user.lastActivity) {
        user.lastActivity = tx.createdAt
      }
    })

    // Convert to holder data and filter positive balances
    const holders: HolderData[] = []
    
    userMap.forEach((userData, address) => {
      const balance = userData.totalBought - userData.totalSold
      
      // Only include addresses with positive balances
      if (balance > 0) {
        const percentage = totalSupply > 0 ? (balance / totalSupply) * 100 : 0
        const value = balance * currentPrice
        
        // Calculate average buy price
        const averageBuyPrice = userData.totalSolSpent > 0 ? 
          userData.totalSolSpent / userData.totalBought : 0

        // Calculate P&L
        const unrealizedPNL = (currentPrice - averageBuyPrice) * balance
        const averageSellPrice = userData.totalSold > 0 ? 
          userData.totalSolReceived / userData.totalSold : 0
        const realizedPNL = userData.totalSold > 0 ? 
          (averageSellPrice - averageBuyPrice) * userData.totalSold : 0

        // Determine if whale (>1% of supply or >$10k value)
        const isWhale = percentage > 1 || value > 10000

        holders.push({
          address,
          balance,
          percentage,
          value,
          firstBuy: userData.firstBuy || userData.lastActivity,
          lastActivity: userData.lastActivity,
          totalBought: userData.totalBought,
          totalSold: userData.totalSold,
          averageBuyPrice,
          unrealizedPNL,
          realizedPNL,
          transactionCount: userData.transactions.length,
          isWhale
        })
      }
    })

    // Sort by balance (descending)
    holders.sort((a, b) => b.balance - a.balance)
    
    console.log(`Found ${holders.length} holders with positive balances`)
    return holders.slice(0, 100) // Return top 100 holders

  } catch (error) {
    console.error('Error calculating real-time holders:', error)
    return []
  }
}

// Get holder statistics
function calculateHolderStats(holders: HolderData[], totalSupply: number) {
  const totalHolders = holders.length
  const whaleCount = holders.filter(h => h.isWhale).length
  const activeHolders = holders.filter(h => {
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    return h.lastActivity >= dayAgo
  }).length

  // Calculate distribution
  const top1Percent = holders.slice(0, Math.ceil(totalHolders * 0.01))
  const top5Percent = holders.slice(0, Math.ceil(totalHolders * 0.05))
  const top10Percent = holders.slice(0, Math.ceil(totalHolders * 0.10))

  const top1Supply = top1Percent.reduce((sum, h) => sum + h.balance, 0)
  const top5Supply = top5Percent.reduce((sum, h) => sum + h.balance, 0)
  const top10Supply = top10Percent.reduce((sum, h) => sum + h.balance, 0)

  const totalHeldTokens = holders.reduce((sum, h) => sum + h.balance, 0)
  const averageHolding = totalHeldTokens / totalHolders
  
  return {
    totalHolders,
    whaleCount,
    activeHolders24h: activeHolders,
    totalHeldTokens,
    averageHolding,
    medianHolding: holders.length > 0 ? holders[Math.floor(holders.length / 2)].balance : 0,
    distribution: {
      top1PercentHolds: totalSupply > 0 ? (top1Supply / totalSupply) * 100 : 0,
      top5PercentHolds: totalSupply > 0 ? (top5Supply / totalSupply) * 100 : 0,
      top10PercentHolds: totalSupply > 0 ? (top10Supply / totalSupply) * 100 : 0,
    },
    concentrationRisk: whaleCount > 0 ? 
      holders.filter(h => h.isWhale).reduce((sum, h) => sum + h.percentage, 0) : 0
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
    
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)
    const includeStats = searchParams.get('stats') === 'true'
    const includeWhalesOnly = searchParams.get('whales') === 'true'
    const minBalance = parseFloat(searchParams.get('minBalance') || '0')
    const realtime = searchParams.get('realtime') === 'true'
    
    // Get token info for calculations
    const token = await prisma.token.findUnique({
      where: { id },
      select: { 
        id: true,
        totalSupply: true,
        currentSupply: true,
        symbol: true,
        name: true,
        price: true
      }
    })

    if (!token) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 })
    }

    const totalSupply = parseFloat(token.totalSupply?.toString() || token.currentSupply?.toString() || '1000000')
    const currentPrice = parseFloat(token.price.toString())

    console.log(`Fetching holders for ${token.symbol} (${token.name})`)
    console.log(`Total supply: ${totalSupply}, Current price: ${currentPrice}`)

    // Try to use existing holders table first (if it exists and is recent)
    let holders: HolderData[] = []
    let dataSource = 'calculated'

    try {
      // Check if we have recent holder data (less than 5 minutes old)
      const recentHolders = await prisma.holder.findMany({
        where: { 
          tokenId: id,
          updatedAt: {
            gte: new Date(Date.now() - 5 * 60 * 1000) // 5 minutes
          }
        },
        select: {
          address: true,
          balance: true,
          percentage: true,
          lastActivity: true,
          updatedAt: true
        },
        orderBy: { balance: 'desc' },
        take: limit
      })

      if (recentHolders.length > 0 && !realtime) {
        console.log(`Using ${recentHolders.length} cached holders`)
        holders = recentHolders.map(holder => ({
          address: holder.address,
          balance: parseFloat(holder.balance.toString()),
          percentage: parseFloat(holder.percentage?.toString() || '0'),
          value: parseFloat(holder.balance.toString()) * currentPrice,
          firstBuy: new Date(),
          lastActivity: holder.lastActivity || holder.updatedAt,
          totalBought: 0,
          totalSold: 0,
          averageBuyPrice: 0,
          unrealizedPNL: 0,
          realizedPNL: 0,
          transactionCount: 0,
          isWhale: parseFloat(holder.percentage?.toString() || '0') > 1
        }))
        dataSource = 'cached'
      }
    } catch (holderTableError) {
      console.warn('Holder table not accessible or empty:', holderTableError)
    }

    // Calculate real-time holders if no recent cache
    if (holders.length === 0) {
      console.log('Calculating holders from transactions...')
      holders = await calculateRealTimeHolders(id, currentPrice, totalSupply)
      
      // Store calculated holders for future use (if holder table exists)
      try {
        // Clear old data and insert new
        await prisma.holder.deleteMany({ where: { tokenId: id } })
        
        const holderInserts = holders.slice(0, 50).map(holder => ({
          tokenId: id,
          address: holder.address,
          balance: holder.balance.toString(),
          percentage: holder.percentage.toString(),
          lastActivity: holder.lastActivity,
          createdAt: new Date(),
          updatedAt: new Date()
        }))

        if (holderInserts.length > 0) {
          await prisma.holder.createMany({
            data: holderInserts,
            skipDuplicates: true
          })
          console.log(`Stored ${holderInserts.length} holders in cache`)
        }
      } catch (storeError) {
        console.warn('Could not cache holders:', storeError)
      }
    }

    // Apply filters
    let filteredHolders = holders

    if (includeWhalesOnly) {
      filteredHolders = filteredHolders.filter(h => h.isWhale)
    }

    if (minBalance > 0) {
      filteredHolders = filteredHolders.filter(h => h.balance >= minBalance)
    }

    // Limit results
    const limitedHolders = filteredHolders.slice(0, limit)

    // Calculate statistics if requested
    let stats = null
    if (includeStats) {
      stats = calculateHolderStats(holders, totalSupply)
    }

    // Format response
    const formattedHolders = limitedHolders.map(holder => ({
      address: holder.address,
      balance: holder.balance.toFixed(6),
      percentage: holder.percentage,
      value: holder.value,
      firstBuy: serializeBigInt(holder.firstBuy),
      lastActivity: serializeBigInt(holder.lastActivity),
      totalBought: holder.totalBought,
      totalSold: holder.totalSold,
      averageBuyPrice: holder.averageBuyPrice,
      unrealizedPNL: holder.unrealizedPNL,
      realizedPNL: holder.realizedPNL,
      transactionCount: holder.transactionCount,
      isWhale: holder.isWhale,
      rank: limitedHolders.indexOf(holder) + 1
    }))

    const response = {
      success: true,
      data: formattedHolders,
      meta: {
        tokenSymbol: token.symbol,
        tokenName: token.name,
        totalSupply,
        currentPrice,
        dataSource,
        totalHolders: holders.length,
        filteredCount: filteredHolders.length,
        returnedCount: limitedHolders.length,
        filters: {
          whalesOnly: includeWhalesOnly,
          minBalance: minBalance > 0 ? minBalance : null,
          limit
        },
        isRealtime: realtime,
        timestamp: new Date().toISOString(),
        ...(stats && { stats })
      }
    }

    // Set cache headers
    const res = NextResponse.json(response)
    
    if (realtime || dataSource === 'calculated') {
      res.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    } else {
      res.headers.set('Cache-Control', 'public, max-age=120') // 2 minutes cache
    }
    
    return res
    
  } catch (error) {
    console.error('Error fetching holders:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

// Update holder data (for real-time updates)
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
    
    const { force = false } = body
    
    // Get token info
    const token = await prisma.token.findUnique({
      where: { id },
      select: { 
        totalSupply: true,
        currentSupply: true,
        price: true,
        symbol: true
      }
    })

    if (!token) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 })
    }

    const totalSupply = parseFloat(token.totalSupply?.toString() || token.currentSupply?.toString() || '1000000')
    const currentPrice = parseFloat(token.price.toString())

    // Force recalculation of holders
    console.log(`Force updating holders for ${token.symbol}`)
    const holders = await calculateRealTimeHolders(id, currentPrice, totalSupply)

    // Update holder cache
    try {
      await prisma.holder.deleteMany({ where: { tokenId: id } })
      
      const holderInserts = holders.slice(0, 100).map(holder => ({
        tokenId: id,
        address: holder.address,
        balance: holder.balance.toString(),
        percentage: holder.percentage.toString(),
        lastActivity: holder.lastActivity,
        createdAt: new Date(),
        updatedAt: new Date()
      }))

      if (holderInserts.length > 0) {
        await prisma.holder.createMany({
          data: holderInserts,
          skipDuplicates: true
        })
      }

      console.log(`Updated ${holderInserts.length} holders in database`)
    } catch (updateError) {
      console.warn('Could not update holder cache:', updateError)
    }

    return NextResponse.json({
      success: true,
      message: 'Holders updated successfully',
      data: {
        tokenId: id,
        holdersCount: holders.length,
        timestamp: new Date().toISOString()
      }
    })
    
  } catch (error) {
    console.error('Error updating holders:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to update holders',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}