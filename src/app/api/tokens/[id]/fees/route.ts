import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/database'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Check if token exists
    const token = await prisma.token.findUnique({
      where: { id },
      select: {
        id: true
      }
    })

    if (!token) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 })
    }

    // Return default platform fees since buyFee, sellFee, platformFee don't exist in Token model
    return NextResponse.json({
      buyFee: 1,
      sellFee: 1,
      platformFee: 0.5
    })

  } catch (error) {
    console.error('Error fetching trading fees:', error)
    return NextResponse.json({ error: 'Failed to fetch fees' }, { status: 500 })
  }
}
