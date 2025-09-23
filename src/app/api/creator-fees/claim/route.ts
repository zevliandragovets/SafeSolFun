import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/database'

// Simple Solana address validation (you can create a more robust one)
function isValidSolanaAddress(address: string): boolean {
  // Basic validation - Solana addresses are base58 encoded and typically 32-44 characters
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)
}

// Define the CreatorFee type based on your Prisma schema
type CreatorFee = {
  id: string
  creatorAddress: string
  tokenAddress: string
  totalFees: number
  claimedFees: number
  lastClaimedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export async function POST(request: NextRequest) {
  try {
    const { creatorAddress, tokenAddress } = await request.json()

    if (!isValidSolanaAddress(creatorAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid creator address' },
        { status: 400 }
      )
    }

    if (tokenAddress && !isValidSolanaAddress(tokenAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid token address' },
        { status: 400 }
      )
    }

    let whereClause: any = { 
      creatorAddress,
      totalFees: { gt: 0 }
    }
    
    if (tokenAddress) {
      whereClause.tokenAddress = tokenAddress
    }

    // Get fees to claim - find records where totalFees > claimedFees
    const feesToClaim: CreatorFee[] = await prisma.creatorFee.findMany({
      where: whereClause
    })

    if (feesToClaim.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No fee records found for this creator' },
        { status: 400 }
      )
    }

    // Filter fees that have claimable amounts
    const claimableFees = feesToClaim.filter((fee: CreatorFee) => fee.totalFees > fee.claimedFees)

    if (claimableFees.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No fees available to claim' },
        { status: 400 }
      )
    }

    let totalClaimAmount = 0
    const claimResults = []

    // Process each fee claim
    for (const fee of claimableFees) {
      const availableAmount = fee.totalFees - fee.claimedFees
      if (availableAmount > 0) {
        totalClaimAmount += availableAmount

        // Update the fee record to mark as claimed
        const updatedFee = await prisma.creatorFee.update({
          where: { id: fee.id },
          data: {
            claimedFees: fee.totalFees, // Set claimed to total (fully claimed)
            lastClaimedAt: new Date()
          }
        })

        claimResults.push({
          tokenAddress: fee.tokenAddress,
          claimedAmount: availableAmount,
          totalFees: fee.totalFees,
          previouslyClaimed: fee.claimedFees
        })
      }
    }

    // In a real implementation, you would:
    // 1. Create and send a Solana transaction to transfer SOL to creator
    // 2. Wait for confirmation
    // 3. Return the transaction signature

    const mockSignature = `claim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    return NextResponse.json({
      success: true,
      data: {
        creatorAddress,
        totalClaimed: totalClaimAmount,
        claimedFees: claimResults,
        transactionSignature: mockSignature,
        claimedAt: new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('Claim creator fees error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to claim creator fees' },
      { status: 500 }
    )
  }
}

// GET endpoint to check claimable fees before claiming
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const creatorAddress = searchParams.get('creatorAddress')
    const tokenAddress = searchParams.get('tokenAddress')

    if (!creatorAddress || !isValidSolanaAddress(creatorAddress)) {
      return NextResponse.json(
        { success: false, error: 'Valid creator address is required' },
        { status: 400 }
      )
    }

    let whereClause: any = { creatorAddress }
    if (tokenAddress) {
      if (!isValidSolanaAddress(tokenAddress)) {
        return NextResponse.json(
          { success: false, error: 'Invalid token address' },
          { status: 400 }
        )
      }
      whereClause.tokenAddress = tokenAddress
    }

    // Get all fee records for this creator
    const creatorFees = await prisma.creatorFee.findMany({
      where: whereClause,
      select: {
        id: true,
        tokenAddress: true,
        totalFees: true,
        claimedFees: true,
        lastClaimedAt: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    })

    let totalClaimable = 0
    const feeBreakdown = creatorFees.map(fee => {
      const claimableAmount = Math.max(0, fee.totalFees - fee.claimedFees)
      totalClaimable += claimableAmount
      
      return {
        tokenAddress: fee.tokenAddress,
        totalFees: fee.totalFees,
        claimedFees: fee.claimedFees,
        claimableAmount,
        lastClaimedAt: fee.lastClaimedAt,
        isFullyClaimed: fee.totalFees <= fee.claimedFees
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        creatorAddress,
        totalClaimable,
        totalRecords: creatorFees.length,
        claimableRecords: feeBreakdown.filter(f => f.claimableAmount > 0).length,
        fees: feeBreakdown
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
