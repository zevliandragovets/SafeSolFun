import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/database'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Get token-specific fees or use default platform fees
    const token = await prisma.token.findUnique({
      where: { id },
      select: {
        buyFee: true,
        sellFee: true,
        platformFee: true
      }
    })

    if (!token) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 })
    }

    return NextResponse.json({
      buyFee: parseFloat(token.buyFee?.toString() || '1'),
      sellFee: parseFloat(token.sellFee?.toString() || '1'),
      platformFee: parseFloat(token.platformFee?.toString() || '0.5')
    })
  } catch (error) {
    console.error('Error fetching trading fees:', error)
    return NextResponse.json({ error: 'Failed to fetch fees' }, { status: 500 })
  }
}