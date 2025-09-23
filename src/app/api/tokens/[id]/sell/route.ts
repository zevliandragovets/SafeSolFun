import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/database'
import { BondingCurve } from '@/lib/solana'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { tokenAmount, slippage = 5, sellerAddress } = await request.json()
    
    if (!tokenAmount || tokenAmount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid token amount' },
        { status: 400 }
      )
    }

    if (!sellerAddress) {
      return NextResponse.json(
        { success: false, error: 'Seller address is required' },
        { status: 400 }
      )
    }

    // Get token from database
    const token = await prisma.token.findUnique({
      where: { id }
    })

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Token not found' },
        { status: 404 }
      )
    }

    if (token.isGraduated) {
      return NextResponse.json(
        { success: false, error: 'Token has graduated - use DEX instead' },
        { status: 400 }
      )
    }

    // Calculate SOL to receive based on bonding curve
    const currentSupply = Number(token.currentSupply)
    
    if (tokenAmount > currentSupply) {
      return NextResponse.json(
        { success: false, error: 'Insufficient token supply' },
        { status: 400 }
      )
    }

    const solToReceive = BondingCurve.calculateSolForTokens(tokenAmount, currentSupply)
    const newSupply = Math.max(0, currentSupply - tokenAmount)
    const newPrice = BondingCurve.calculatePrice(newSupply)
    const newMarketCap = Math.max(0, token.marketCap - solToReceive)

    // Check slippage
    const expectedPrice = BondingCurve.calculatePrice(currentSupply)
    const actualPrice = solToReceive / tokenAmount
    const priceImpact = Math.abs((expectedPrice - actualPrice) / expectedPrice) * 100

    if (priceImpact > slippage) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Price impact ${priceImpact.toFixed(2)}% exceeds slippage tolerance ${slippage}%`,
          priceImpact
        },
        { status: 400 }
      )
    }

    // Apply 5% sell fee
    const sellFee = 0.05
    const solAfterFee = solToReceive * (1 - sellFee)
    const feeAmount = solToReceive * sellFee

    // Simulate transaction signature (in production, this would be a real Solana transaction)
    const signature = `sell_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Update database in transaction
    const [updatedToken, transactionRecord] = await Promise.all([
      prisma.token.update({
        where: { id },
        data: {
          currentSupply: newSupply,
          price: newPrice,
          marketCap: newMarketCap
        }
      }),
      prisma.transaction.create({
        data: {
          tokenId: id,
          userAddress: sellerAddress,
          type: 'SELL',
          amount: tokenAmount,
          solAmount: solAfterFee,
          price: actualPrice,
          signature: signature
        }
      })
    ])

    // Update creator fees with sell fee
    await prisma.creatorFee.upsert({
      where: {
        creatorAddress_tokenAddress: {
          creatorAddress: token.creatorAddress,
          tokenAddress: token.tokenAddress
        }
      },
      create: {
        creatorAddress: token.creatorAddress,
        tokenAddress: token.tokenAddress,
        totalFees: feeAmount
      },
      update: {
        totalFees: { increment: feeAmount }
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        tokensSold: tokenAmount,
        solReceived: solAfterFee,
        sellFee: feeAmount,
        feePercentage: sellFee * 100,
        newPrice: newPrice,
        newMarketCap: newMarketCap,
        newSupply: newSupply,
        priceImpact: priceImpact,
        signature: signature,
        transaction: {
          id: transactionRecord.id,
          type: 'SELL',
          timestamp: transactionRecord.createdAt
        }
      }
    })

  } catch (error) {
    console.error('Sell token error:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to sell token',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  } finally {
    await prisma.$disconnect()
  }
}
