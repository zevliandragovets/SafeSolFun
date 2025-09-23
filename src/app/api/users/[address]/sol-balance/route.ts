import { NextRequest, NextResponse } from 'next/server'
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params
    const connection = new Connection(process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com')
    
    const publicKey = new PublicKey(address)
    const balance = await connection.getBalance(publicKey)
    const solBalance = balance / LAMPORTS_PER_SOL

    return NextResponse.json({ balance: solBalance })
  } catch (error) {
    console.error('Error fetching SOL balance:', error)
    return NextResponse.json({ error: 'Failed to fetch balance' }, { status: 500 })
  }
}