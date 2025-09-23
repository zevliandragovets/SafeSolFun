import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/database'
import { RugDetector } from '@/lib/solana'

export async function GET(
  request: NextRequest,
  { params }: { params: { userAddress: string } }
) {
  try {
    const { userAddress } = params
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)

    const watchlist = await prisma.watchlist.findMany({
      where: { userAddress },
      include: {
        token: {
          select: {
            id: true,
            name: true,
            symbol: true,
            description: true,
            imageUrl: true,
            price: true,
            marketCap: true,
            currentSupply: true,
            totalSupply: true,
            isGraduated: true,
            rugScore: true,
            createdAt: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    })

    const tokensWithRisk = watchlist.map((entry: any) => ({
      ...entry,
      token: {
        ...entry.token,
        riskLevel: entry.token.rugScore ? 
          RugDetector.getRiskLevel(entry.token.rugScore) : 
          'UNKNOWN'
      }
    }))

    return NextResponse.json({
      success: true,
      data: tokensWithRisk,
      count: tokensWithRisk.length
    })

  } catch (error) {
    console.error('Get watchlist error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch watchlist' },
      { status: 500 }
    )
  }
}