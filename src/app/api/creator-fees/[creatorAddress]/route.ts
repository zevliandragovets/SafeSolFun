import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/database'
import { TokenUtils } from '@/lib/solana'

export async function GET(
  request: NextRequest,
  { params }: { params: { creatorAddress: string } }
) {
  try {
    const { creatorAddress } = params

    if (!TokenUtils.isValidSolanaAddress(creatorAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid Solana address' },
        { status: 400 }
      )
    }

    // Get all creator fees for this address
    const creatorFees = await prisma.creatorFee.findMany({
      where: { creatorAddress },
      orderBy: { createdAt: 'desc' }
    })

    // Calculate totals
    const totalEarned = creatorFees.reduce((sum, fee) => sum + fee.totalFees, 0)
    const totalClaimed = creatorFees.reduce((sum, fee) => sum + fee.claimedFees, 0)
    const availableToClaim = totalEarned - totalClaimed

    // Get token information for each fee record
    const feeDetails = await Promise.all(
      creatorFees.map(async (fee) => {
        // Try to get token info if it exists
        let tokenInfo = null
        try {
          const token = await prisma.token.findUnique({
            where: { tokenAddress: fee.tokenAddress },
            select: { name: true, symbol: true, id: true }
          })
          tokenInfo = token
        } catch (error) {
          console.warn(`Could not find token info for ${fee.tokenAddress}`)
        }

        return {
          id: fee.id,
          tokenAddress: fee.tokenAddress,
          tokenName: tokenInfo?.name || 'Unknown',
          tokenSymbol: tokenInfo?.symbol || 'UNK',
          totalFees: fee.totalFees,
          claimedFees: fee.claimedFees,
          availableFees: fee.totalFees - fee.claimedFees,
          lastClaimedAt: fee.lastClaimedAt,
          createdAt: fee.createdAt,
          updatedAt: fee.updatedAt
        }
      })
    )

    // Get additional statistics
    const activeTokens = creatorFees.length
    const tokensWithClaimableFees = creatorFees.filter(fee => fee.totalFees > fee.claimedFees).length
    const fullyClaimedTokens = creatorFees.filter(fee => fee.totalFees <= fee.claimedFees).length

    return NextResponse.json({
      success: true,
      data: {
        creatorAddress,
        summary: {
          totalEarned,
          totalClaimed,
          availableToClaim,
          activeTokens,
          tokensWithClaimableFees,
          fullyClaimedTokens
        },
        fees: feeDetails
      }
    })

  } catch (error) {
    console.error('Get creator fees error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch creator fees' },
      { status: 500 }
    )
  }
}

// Optional: Add PUT endpoint to manually update fees (for admin purposes)
export async function PUT(
  request: NextRequest,
  { params }: { params: { creatorAddress: string } }
) {
  try {
    const { creatorAddress } = params
    const body = await request.json()
    
    const { tokenAddress, additionalFees } = body

    if (!TokenUtils.isValidSolanaAddress(creatorAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid creator address' },
        { status: 400 }
      )
    }

    if (!TokenUtils.isValidSolanaAddress(tokenAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid token address' },
        { status: 400 }
      )
    }

    if (!additionalFees || additionalFees <= 0) {
      return NextResponse.json(
        { success: false, error: 'Additional fees must be positive' },
        { status: 400 }
      )
    }

    // Update or create creator fee record
    const updatedFee = await prisma.creatorFee.upsert({
      where: {
        creatorAddress_tokenAddress: {
          creatorAddress,
          tokenAddress
        }
      },
      update: {
        totalFees: {
          increment: additionalFees
        },
        updatedAt: new Date()
      },
      create: {
        creatorAddress,
        tokenAddress,
        totalFees: additionalFees,
        claimedFees: 0
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        creatorAddress,
        tokenAddress,
        previousTotal: updatedFee.totalFees - additionalFees,
        additionalFees,
        newTotal: updatedFee.totalFees,
        availableToClaim: updatedFee.totalFees - updatedFee.claimedFees
      }
    })

  } catch (error) {
    console.error('Update creator fees error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update creator fees' },
      { status: 500 }
    )
  }
}