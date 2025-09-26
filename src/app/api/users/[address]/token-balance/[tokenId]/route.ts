import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/database'

function serializeBigInt(obj: any): any {
  if (obj === null || obj === undefined) return obj
  if (typeof obj === 'bigint') return obj.toString()
  if (Array.isArray(obj)) return obj.map(serializeBigInt)
  if (typeof obj === 'object') {
    const serialized: any = {}
    for (const [key, value] of Object.entries(obj)) {
      serialized[key] = serializeBigInt(value)
    }
    return serialized
  }
  return obj
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string; tokenId: string }> }
) {
  try {
    const { address, tokenId } = await params

    if (!address || !tokenId) {
      return NextResponse.json({ error: 'Address and tokenId are required' }, { status: 400 })
    }

    // Calculate user's token balance from transactions
    const transactions = await prisma.transaction.findMany({
      where: {
        tokenId,
        userAddress: address
      },
      select: {
        type: true,
        amount: true,
        createdAt: true
      },
      orderBy: { createdAt: 'asc' }
    })

    if (transactions.length === 0) {
      return NextResponse.json(serializeBigInt({
        success: true,
        data: {
          address,
          tokenId,
          balance: '0',
          usdValue: 0,
          transactionCount: 0
        }
      }))
    }

    // Calculate balance using enum comparison
    const balance = transactions.reduce((acc: number, tx: any) => {
      const amount = parseFloat(tx.amount.toString())
      // Compare with the enum value 'BUY', not the string 'buy'
      return tx.type === 'BUY' ? acc + amount : acc - amount
    }, 0)

    // Get current token price for USD value
    const token = await prisma.token.findUnique({
      where: { id: tokenId },
      select: { 
        price: true,
        symbol: true,
        name: true
      }
    })

    if (!token) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 })
    }

    const tokenPrice = parseFloat(token.price.toString())
    const usdValue = balance * tokenPrice

    // Calculate additional metrics
    const totalBought = transactions
      .filter((tx: any) => tx.type === 'BUY')
      .reduce((sum: number, tx: any) => sum + parseFloat(tx.amount.toString()), 0)
    
    const totalSold = transactions
      .filter((tx: any) => tx.type === 'SELL')
      .reduce((sum: number, tx: any) => sum + parseFloat(tx.amount.toString()), 0)

    const response = {
      success: true,
      data: {
        address,
        tokenId,
        tokenSymbol: token.symbol,
        tokenName: token.name,
        balance: balance.toFixed(6),
        usdValue: usdValue.toFixed(2),
        tokenPrice: tokenPrice.toFixed(8),
        transactionCount: transactions.length,
        totalBought: totalBought.toFixed(6),
        totalSold: totalSold.toFixed(6),
        firstTransactionAt: transactions[0]?.createdAt,
        lastTransactionAt: transactions[transactions.length - 1]?.createdAt
      }
    }

    return NextResponse.json(serializeBigInt(response))

  } catch (error) {
    console.error('Error fetching token balance:', error)
    return NextResponse.json({ 
      success: false,
      error: 'Failed to fetch token balance',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// Optional: Add POST endpoint to refresh/recalculate balance
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ address: string; tokenId: string }> }
) {
  try {
    const { address, tokenId } = await params

    if (!address || !tokenId) {
      return NextResponse.json({ error: 'Address and tokenId are required' }, { status: 400 })
    }

    // Force recalculation by calling GET endpoint logic
    const transactions = await prisma.transaction.findMany({
      where: {
        tokenId,
        userAddress: address
      },
      select: {
        type: true,
        amount: true
      }
    })

    const balance = transactions.reduce((acc: number, tx: any) => {
      const amount = parseFloat(tx.amount.toString())
      return tx.type === 'BUY' ? acc + amount : acc - amount
    }, 0)

    return NextResponse.json({
      success: true,
      message: 'Balance recalculated successfully',
      data: {
        address,
        tokenId,
        balance: balance.toFixed(6),
        recalculatedAt: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('Error recalculating token balance:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to recalculate balance'
    }, { status: 500 })
  }

}
