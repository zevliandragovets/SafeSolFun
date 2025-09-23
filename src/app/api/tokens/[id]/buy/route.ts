import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/database'
import { BondingCurve, connection } from '@/lib/solana'
import { 
  PublicKey, 
  Transaction, 
  SystemProgram,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL
} from '@solana/web3.js'
import { 
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction
} from '@solana/spl-token'

function getPayerKeypair() {
  const { Keypair } = require('@solana/web3.js')
  const privateKeyString = process.env.SOLANA_PRIVATE_KEY
  if (!privateKeyString) {
    throw new Error('SOLANA_PRIVATE_KEY environment variable is required')
  }
  
  try {
    const privateKey = new Uint8Array(JSON.parse(privateKeyString))
    return Keypair.fromSecretKey(privateKey)
  } catch (error) {
    throw new Error('Invalid SOLANA_PRIVATE_KEY format')
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { solAmount, slippage = 5, buyerAddress } = await request.json()
    
    if (!solAmount || solAmount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid SOL amount' },
        { status: 400 }
      )
    }

    if (!buyerAddress) {
      return NextResponse.json(
        { success: false, error: 'Buyer address is required' },
        { status: 400 }
      )
    }

    // Get token from database
    const token = await prisma.token.findUnique({
      where: { id: params.id }
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

    // Calculate tokens to receive based on bonding curve
    const currentSupply = Number(token.currentSupply)
    const tokensToReceive = BondingCurve.calculateTokensForSol(solAmount, currentSupply)
    const newSupply = currentSupply + tokensToReceive
    const newPrice = BondingCurve.calculatePrice(newSupply)
    const newMarketCap = token.marketCap + solAmount

    // Check slippage
    const expectedPrice = BondingCurve.calculatePrice(currentSupply)
    const actualPrice = solAmount / tokensToReceive
    const priceImpact = Math.abs((actualPrice - expectedPrice) / expectedPrice) * 100

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

    // Perform Solana transaction
    const payer = getPayerKeypair()
    const buyerPublicKey = new PublicKey(buyerAddress)
    const tokenMint = new PublicKey(token.tokenAddress)

    // Get or create buyer's token account
    const buyerTokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      buyerPublicKey
    )

    const transaction = new Transaction()

    // Check if buyer's token account exists, if not create it
    try {
      await connection.getAccountInfo(buyerTokenAccount)
    } catch {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          payer.publicKey,
          buyerTokenAccount,
          buyerPublicKey,
          tokenMint
        )
      )
    }

    // Transfer SOL from buyer to bonding curve (treasury)
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: buyerPublicKey,
        toPubkey: payer.publicKey, // Treasury receives SOL
        lamports: solAmount * LAMPORTS_PER_SOL
      })
    )

    // Note: In a real implementation, you'd need the buyer to sign this transaction
    // For demo purposes, we'll simulate the token transfer
    
    const signature = `simulated_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Update database
    const [updatedToken, transaction_record] = await Promise.all([
      prisma.token.update({
        where: { id: params.id },
        data: {
          currentSupply: newSupply,
          price: newPrice,
          marketCap: newMarketCap
        }
      }),
      prisma.transaction.create({
        data: {
          tokenId: params.id,
          userAddress: buyerAddress,
          type: 'BUY',
          amount: tokensToReceive,
          solAmount: solAmount,
          price: actualPrice,
          signature: signature
        }
      })
    ])

    // Update creator fees (1% fee)
    const creatorFee = solAmount * 0.01
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
        totalFees: creatorFee
      },
      update: {
        totalFees: { increment: creatorFee }
      }
    })

    // Check if token should graduate to DEX
    const GRADUATION_MARKET_CAP = 30 // 30 SOL
    if (newMarketCap >= GRADUATION_MARKET_CAP && !token.isGraduated) {
      await prisma.token.update({
        where: { id: params.id },
        data: {
          isGraduated: true,
          graduatedAt: new Date()
        }
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        tokensReceived: tokensToReceive,
        solSpent: solAmount,
        newPrice: newPrice,
        newMarketCap: newMarketCap,
        priceImpact: priceImpact,
        signature: signature,
        transaction: transaction_record
      }
    })

  } catch (error) {
    console.error('Buy token error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to buy token' },
      { status: 500 }
    )
  }
}