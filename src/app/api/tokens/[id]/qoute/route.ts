import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/database'

function calculatePriceImpact(inputAmount: number, currentSupply: number, isBuying: boolean): number {
  // Simple bonding curve price impact calculation
  // For small trades, impact should be minimal
  const supplyRatio = inputAmount / Math.max(currentSupply, 1000000) // Prevent division by very small numbers
  const baseImpact = supplyRatio * 10 // Reduced multiplier for more reasonable impact
  
  // Apply different multipliers based on trade direction
  const impact = isBuying ? baseImpact * 1.1 : baseImpact * 0.9
  
  // Cap the impact to prevent unrealistic values
  return Math.min(Math.max(impact, 0.01), 15) // Min 0.01%, Max 15%
}

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    let requestBody
    try {
      requestBody = await request.json()
    } catch (error) {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 })
    }

    const { inputAmount, isBuying, slippage } = requestBody

    if (!inputAmount || inputAmount <= 0) {
      return NextResponse.json({ error: 'Invalid input amount' }, { status: 400 })
    }

    if (typeof isBuying !== 'boolean') {
      return NextResponse.json({ error: 'Invalid trading direction' }, { status: 400 })
    }

    const token = await prisma.token.findUnique({
      where: { id },
      select: {
        price: true,
        currentSupply: true,
        totalSupply: true,
        name: true,
        symbol: true
      }
    })

    if (!token) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 })
    }

    const currentPrice = parseFloat(token.price.toString())
    const currentSupply = token.currentSupply ? parseFloat(token.currentSupply.toString()) : 1000000
    
    // Use default fees since they don't exist in the model
    const buyFee = 1  // 1% default buy fee
    const sellFee = 1 // 1% default sell fee
    const fee = isBuying ? buyFee : sellFee

    // Calculate price impact
    const priceImpact = calculatePriceImpact(inputAmount, currentSupply, isBuying)
    
    // Calculate output amount with price impact
    let outputAmount: number
    let effectivePrice: number

    if (isBuying) {
      // Buying: SOL -> Token
      effectivePrice = currentPrice * (1 + priceImpact / 100)
      outputAmount = inputAmount / effectivePrice
    } else {
      // Selling: Token -> SOL  
      effectivePrice = currentPrice * (1 - priceImpact / 100)
      outputAmount = inputAmount * effectivePrice
    }

    // Apply trading fees
    const fees = outputAmount * (fee / 100)
    const netOutput = outputAmount - fees

    // Calculate minimum received with slippage protection
    const slippageDecimal = (slippage || 1) / 100
    const minReceived = netOutput * (1 - slippageDecimal)

    const quote = {
      inputAmount,
      outputAmount: netOutput,
      priceImpact,
      fees,
      minReceived,
      effectivePrice,
      currentPrice
    }

    console.log(`Quote calculated for ${token.symbol}:`, quote)

    return NextResponse.json(serializeBigInt(quote))
    
  } catch (error) {
    console.error('Error calculating quote:', error)
    return NextResponse.json(
      { error: 'Failed to calculate quote', details: error instanceof Error ? error.message : 'Unknown error' }, 
      { status: 500 }
    )
  }
}