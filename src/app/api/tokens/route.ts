import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/database'
import { BondingCurve, RugDetector, connection } from '@/lib/solana'
import { 
  PublicKey, 
  Keypair, 
  SystemProgram, 
  Transaction, 
  sendAndConfirmTransaction, 
  LAMPORTS_PER_SOL 
} from '@solana/web3.js'
import { 
  createMint, 
  getMinimumBalanceForRentExemptMint, 
  MINT_SIZE, 
  TOKEN_PROGRAM_ID,
  createInitializeMintInstruction,
  createMintToInstruction,
  getOrCreateAssociatedTokenAccount,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress
} from '@solana/spl-token'
import path from 'path'
import { existsSync } from 'fs'

// Enhanced image validation and processing
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10MB

// Validate image URL - Fixed to handle both local and external URLs
function validateImageUrl(url: string): boolean {
  if (!url) return false
  
  try {
    // Handle local URLs
    if (url.startsWith('/uploads/') || url.startsWith('./') || url.startsWith('../')) {
      return true
    }
    
    // Handle external URLs
    const urlObj = new URL(url)
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:'
  } catch {
    return false
  }
}

// Check if uploaded image exists locally - Fixed path checking
function checkLocalImageExists(url: string): boolean {
  if (!url) return false
  
  // External URLs are assumed valid
  if (url.startsWith('http://') || url.startsWith('https://')) return true
  
  if (!url.startsWith('/uploads/')) return false
  
  try {
    const localPath = path.join(process.cwd(), 'public', url)
    return existsSync(localPath)
  } catch (error) {
    console.warn('Error checking local image:', error)
    return false
  }
}

// Fixed fallback image generation
function generateFallbackImage(symbol: string, type: 'logo' | 'banner' = 'logo'): string {
  if (!symbol || symbol.trim() === '') {
    symbol = 'TOKEN'
  }
  
  const size = type === 'logo' ? '200x200' : '800x400'
  const colors = [
    'FF6B6B', 'FF8E53', 'FF8A80', 'FF7043', 'F06292', 'BA68C8', 
    '9575CD', '7986CB', '64B5F6', '4FC3F7', '4DD0E1', '4DB6AC', 
    '81C784', 'AED581', 'FFAB40', 'FF7043'
  ]
  
  // Use symbol to determine color consistently
  const colorIndex = symbol.charCodeAt(0) % colors.length
  const background = colors[colorIndex]
  
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(symbol.substring(0, 2))}&size=${size}&background=${background}&color=ffffff&bold=true&format=png`
}

// Enhanced metadata upload with better error handling
async function uploadMetadataWithFallbacks(metadata: any): Promise<string> {
  const providers = [
    // Option 1: Arweave via Bundlr/Irys
    async () => {
      if (!process.env.ARWEAVE_PRIVATE_KEY) return null
      
      try {
        const response = await fetch('https://node1.irys.xyz/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.ARWEAVE_PRIVATE_KEY}`,
          },
          body: JSON.stringify(metadata)
        })

        if (response.ok) {
          const result = await response.json()
          return result.id ? `https://arweave.net/${result.id}` : null
        }
      } catch (error) {
        console.warn('Arweave upload failed:', error)
      }
      return null
    },

    // Option 2: IPFS via Pinata
    async () => {
      if (!process.env.PINATA_JWT) return null
      
      try {
        const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.PINATA_JWT}`,
          },
          body: JSON.stringify({
            pinataContent: metadata,
            pinataMetadata: {
              name: `${metadata.name} Metadata`,
              keyvalues: {
                symbol: metadata.symbol,
                type: 'token-metadata'
              }
            }
          })
        })

        if (response.ok) {
          const result = await response.json()
          return `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`
        }
      } catch (error) {
        console.warn('IPFS upload failed:', error)
      }
      return null
    },

    // Option 3: Base64 fallback (works but not ideal for large metadata)
    async () => {
      try {
        const encodedMetadata = Buffer.from(JSON.stringify(metadata)).toString('base64')
        return `data:application/json;base64,${encodedMetadata}`
      } catch (error) {
        console.error('Base64 encoding failed:', error)
        return null
      }
    }
  ]

  // Try each provider in order
  for (const provider of providers) {
    try {
      const result = await provider()
      if (result) {
        console.log('Metadata uploaded successfully to:', result.split('://')[0])
        return result
      }
    } catch (error) {
      console.warn('Provider failed:', error)
      continue
    }
  }

  throw new Error('All metadata upload providers failed')
}

// Fixed pricing calculation using proper bonding curve
function calculateInitialPrice(marketCap: number = 0): number {
  // Simple linear bonding curve: price increases with market cap
  const BASE_PRICE = 0.000001 // Starting price in SOL
  const PRICE_MULTIPLIER = 0.000001 // Price increases by this amount per SOL market cap
  
  return BASE_PRICE + (marketCap * PRICE_MULTIPLIER)
}

// Calculate tokens for SOL amount using bonding curve
function calculateTokensForSol(solAmount: number, currentMarketCap: number): number {
  const currentPrice = calculateInitialPrice(currentMarketCap)
  
  // Simple calculation - in production you'd use integral of bonding curve
  const averagePrice = (currentPrice + calculateInitialPrice(currentMarketCap + solAmount)) / 2
  return solAmount / averagePrice
}

// Enhanced validation with better error messages and Solana address validation
function validateTokenData(data: any) {
  const errors: string[] = []
  
  if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
    errors.push('Name is required and must be a non-empty string')
  }
  
  if (data.name && data.name.length > 32) {
    errors.push('Name must be 32 characters or less')
  }
  
  if (!data.symbol || typeof data.symbol !== 'string' || data.symbol.trim().length === 0) {
    errors.push('Symbol is required and must be a non-empty string')
  }
  
  if (data.symbol && (data.symbol.length > 10 || data.symbol.length < 1)) {
    errors.push('Symbol must be between 1 and 10 characters')
  }
  
  if (!data.creatorAddress || typeof data.creatorAddress !== 'string') {
    errors.push('Creator address is required')
  }
  
  // Enhanced Solana address validation
  if (data.creatorAddress) {
    try {
      const publicKey = new PublicKey(data.creatorAddress)
      // Additional validation to ensure the key is on curve
      if (!PublicKey.isOnCurve(publicKey.toBytes())) {
        errors.push('Invalid Solana address: not on Ed25519 curve')
      }
    } catch (error) {
      errors.push(`Invalid Solana address format: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
  
  // Enhanced image URL validation
  if (data.imageUrl && typeof data.imageUrl === 'string' && data.imageUrl.trim().length > 0) {
    if (!validateImageUrl(data.imageUrl)) {
      errors.push('Invalid image URL format')
    }
  }
  
  if (data.bannerUrl && typeof data.bannerUrl === 'string' && data.bannerUrl.trim().length > 0) {
    if (!validateImageUrl(data.bannerUrl)) {
      errors.push('Invalid banner URL format')
    }
  }
  
  if (data.description && data.description.length > 1000) {
    errors.push('Description must be 1000 characters or less')
  }
  
  if (data.website && !validateImageUrl(data.website)) {
    errors.push('Invalid website URL format')
  }
  
  return errors
}

// Enhanced token creation with better error handling
async function createSPLTokenWithEnhancedMetadata(
  payer: Keypair,
  creatorAddress: PublicKey,
  decimals: number,
  name: string,
  symbol: string,
  description: string,
  imageUrl: string,
  bannerUrl?: string,
  totalSupply: number = 1_000_000_000,
  initialBuyAmount?: number
) {
  // Validate creator address is on curve before proceeding
  if (!PublicKey.isOnCurve(creatorAddress.toBytes())) {
    throw new Error('Creator address is not a valid Ed25519 curve point')
  }

  const mintKeypair = Keypair.generate()
  const mintRent = await getMinimumBalanceForRentExemptMint(connection)
  
  // Validate and process images with better fallback handling
  let processedImageUrl = imageUrl
  let processedBannerUrl = bannerUrl

  if (!imageUrl || !validateImageUrl(imageUrl) || !checkLocalImageExists(imageUrl)) {
    console.warn('Invalid or missing image URL, generating fallback')
    processedImageUrl = generateFallbackImage(symbol, 'logo')
  }

  if (bannerUrl && (!validateImageUrl(bannerUrl) || !checkLocalImageExists(bannerUrl))) {
    console.warn('Invalid banner URL, removing banner')
    processedBannerUrl = undefined
  }

  // Calculate initial pricing properly
  let currentMarketCap = 0
  let currentPrice = calculateInitialPrice(0)
  
  if (initialBuyAmount && initialBuyAmount > 0) {
    currentMarketCap = initialBuyAmount
    currentPrice = calculateInitialPrice(currentMarketCap)
  }

  // Create comprehensive metadata with correct pricing
  const metadata = {
    name,
    symbol,
    description,
    image: processedImageUrl,
    external_url: null,
    attributes: [
      {
        trait_type: "Token Type",
        value: "Meme Coin"
      },
      {
        trait_type: "Network",
        value: "Solana"
      },
      {
        trait_type: "Total Supply",
        value: totalSupply.toLocaleString()
      },
      {
        trait_type: "Decimals",
        value: decimals
      },
      {
        trait_type: "Initial Price",
        value: `${currentPrice.toFixed(8)} SOL`
      }
    ],
    properties: {
      files: [
        {
          uri: processedImageUrl,
          type: processedImageUrl.includes('.png') ? "image/png" : "image/jpeg"
        }
      ],
      category: "image",
      creators: [
        {
          address: creatorAddress.toString(),
          share: 100,
          verified: false
        }
      ]
    },
    collection: null,
    mint: mintKeypair.publicKey.toString(),
    banner: processedBannerUrl,
    compiler: "Solana Token Creator v1.0",
    date: new Date().toISOString(),
  }

  // Upload metadata
  const metadataUri = await uploadMetadataWithFallbacks(metadata)
  console.log('Metadata uploaded to:', metadataUri)

  // Create token transaction
  const transaction = new Transaction()
  
  // 1. Create mint account
  transaction.add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      lamports: mintRent,
      space: MINT_SIZE,
      programId: TOKEN_PROGRAM_ID,
    })
  )
  
  // 2. Initialize mint
  transaction.add(
    createInitializeMintInstruction(
      mintKeypair.publicKey,
      decimals,
      payer.publicKey,
      payer.publicKey
    )
  )
  
  // 3. Create associated token account for creator with better error handling
  let associatedTokenAddress: PublicKey
  try {
    associatedTokenAddress = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      creatorAddress,
      false, // allowOwnerOffCurve = false (default)
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  } catch (error) {
    console.error('Failed to get associated token address:', error)
    throw new Error(`Invalid creator address: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
  
  transaction.add(
    createAssociatedTokenAccountInstruction(
      payer.publicKey,
      associatedTokenAddress,
      creatorAddress,
      mintKeypair.publicKey,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  )
  
  // 4. Mint initial supply to creator
  if (totalSupply > 0) {
    transaction.add(
      createMintToInstruction(
        mintKeypair.publicKey,
        associatedTokenAddress,
        payer.publicKey,
        totalSupply * Math.pow(10, decimals),
        [],
        TOKEN_PROGRAM_ID
      )
    )
  }
  
  // Send transaction with enhanced retry logic
  let signature: string | undefined
  let retries = 5
  
  while (retries > 0) {
    try {
      signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [payer, mintKeypair],
        { 
          commitment: 'confirmed',
          maxRetries: 5,
          skipPreflight: false,
          preflightCommitment: 'confirmed'
        }
      )
      break
    } catch (error) {
      retries--
      if (retries === 0) {
        console.error('Final transaction attempt failed:', error)
        throw error
      }
      console.warn(`Transaction failed, retrying... (${retries} attempts left)`)
      await new Promise(resolve => setTimeout(resolve, 3000))
    }
  }

  if (!signature) {
    throw new Error('Failed to confirm transaction after all retries')
  }
  
  return {
    mintAddress: mintKeypair.publicKey.toString(),
    signature,
    associatedTokenAddress: associatedTokenAddress.toString(),
    metadataUri,
    processedImageUrl,
    processedBannerUrl,
    initialPrice: currentPrice,
    initialMarketCap: currentMarketCap
  }
}

// Helper function to serialize BigInt values - Fixed type safety
function serializeToken(token: any) {
  const serialized: any = {}
  
  for (const [key, value] of Object.entries(token)) {
    if (typeof value === 'bigint') {
      serialized[key] = Number(value)
    } else if (value instanceof Date) {
      serialized[key] = value.toISOString()
    } else {
      serialized[key] = value
    }
  }
  
  return serialized
}

// Get payer keypair from environment
function getPayerKeypair(): Keypair {
  const privateKeyString = process.env.SOLANA_PRIVATE_KEY
  if (!privateKeyString) {
    throw new Error('SOLANA_PRIVATE_KEY environment variable is required')
  }
  
  try {
    const privateKey = new Uint8Array(JSON.parse(privateKeyString))
    return Keypair.fromSecretKey(privateKey)
  } catch (error) {
    throw new Error('Invalid SOLANA_PRIVATE_KEY format. Must be a JSON array of numbers.')
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const sortBy = searchParams.get('sortBy') || 'newest'
    const search = searchParams.get('search')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)

    let where: any = {}

    // Enhanced filtering
    if (category === 'new') {
      where.createdAt = {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
      }
    } else if (category === 'graduating') {
      where.marketCap = {
        gte: 25,
        lt: 30
      }
      where.isGraduated = false
    } else if (category === 'graduated') {
      where.isGraduated = true
    } else if (category === 'low-risk') {
      where.rugScore = {
        lt: 30
      }
    } else if (category === 'trending') {
      where.createdAt = {
        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      }
    }

    // Enhanced search functionality
    if (search && search.trim().length > 0) {
      const searchTerm = search.trim()
      where.OR = [
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { symbol: { contains: searchTerm, mode: 'insensitive' } },
        { description: { contains: searchTerm, mode: 'insensitive' } }
      ]
    }

    // Enhanced sorting options
    let orderBy: any = { createdAt: 'desc' }
    switch (sortBy) {
      case 'newest':
        orderBy = { createdAt: 'desc' }
        break
      case 'oldest':
        orderBy = { createdAt: 'asc' }
        break
      case 'marketCap':
        orderBy = { marketCap: 'desc' }
        break
      case 'price':
        orderBy = { price: 'desc' }
        break
      case 'name':
        orderBy = { name: 'asc' }
        break
      case 'symbol':
        orderBy = { symbol: 'asc' }
        break
      case 'safest':
        orderBy = { rugScore: 'asc' }
        break
      case 'riskiest':
        orderBy = { rugScore: 'desc' }
        break
    }

    const tokens = await prisma.token.findMany({
      where,
      orderBy,
      take: limit,
      select: {
        id: true,
        name: true,
        symbol: true,
        description: true,
        imageUrl: true,
        bannerUrl: true,
        creatorAddress: true,
        tokenAddress: true,
        bondingCurveAddress: true,
        totalSupply: true,
        currentSupply: true,
        marketCap: true,
        price: true,
        website: true,
        twitter: true,
        telegram: true,
        isGraduated: true,
        graduatedAt: true,
        rugScore: true,
        createdAt: true,
        updatedAt: true
      }
    })

    // Process tokens with enhanced data and proper image handling
    const tokensWithEnhancedData = tokens.map(token => {
      const serializedToken = serializeToken(token)
      const riskLevel = RugDetector.getRiskLevel(serializedToken.rugScore) || 'MEDIUM'
      
      // Ensure image URLs are valid and accessible
      let processedImageUrl = serializedToken.imageUrl
      if (!processedImageUrl || !validateImageUrl(processedImageUrl) || !checkLocalImageExists(processedImageUrl)) {
        processedImageUrl = generateFallbackImage(serializedToken.symbol, 'logo')
      }
      
      let processedBannerUrl = serializedToken.bannerUrl
      if (processedBannerUrl && (!validateImageUrl(processedBannerUrl) || !checkLocalImageExists(processedBannerUrl))) {
        processedBannerUrl = null
      }

      // Recalculate price based on current market cap for real-time accuracy
      const currentPrice = calculateInitialPrice(serializedToken.marketCap)

      return {
        ...serializedToken,
        riskLevel,
        imageUrl: processedImageUrl,
        bannerUrl: processedBannerUrl,
        price: currentPrice, // Use calculated price instead of stored price
        // Add computed fields
        formattedMarketCap: serializedToken.marketCap >= 1000000 
          ? `${(serializedToken.marketCap / 1000000).toFixed(2)}M`
          : serializedToken.marketCap >= 1000 
          ? `${(serializedToken.marketCap / 1000).toFixed(1)}K`
          : `${serializedToken.marketCap.toFixed(2)}`,
        formattedPrice: currentPrice < 0.000001 
          ? currentPrice.toExponential(2)
          : currentPrice < 0.001 
          ? currentPrice.toFixed(8)
          : currentPrice < 1 
          ? currentPrice.toFixed(6)
          : currentPrice.toFixed(4),
        timeAgo: formatTimeAgo(serializedToken.createdAt)
      }
    })

    return NextResponse.json({
      success: true,
      data: tokensWithEnhancedData,
      count: tokensWithEnhancedData.length,
      filters: {
        category,
        sortBy,
        search,
        limit
      }
    })

  } catch (error) {
    console.error('Error fetching tokens:', error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to fetch tokens',
        message: 'Internal server error'
      }, 
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    let data
    try {
      data = await request.json()
    } catch (parseError) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Invalid JSON format in request body' 
        }, 
        { status: 400 }
      )
    }

    // Enhanced validation
    const validationErrors = validateTokenData(data)
    if (validationErrors.length > 0) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Validation failed',
          details: validationErrors 
        }, 
        { status: 400 }
      )
    }

    // Normalize and clean data
    const normalizedSymbol = data.symbol.trim().toUpperCase()
    const normalizedName = data.name.trim()

    // Check for existing tokens
    const existingToken = await prisma.token.findFirst({
      where: {
        OR: [
          { symbol: normalizedSymbol },
          { name: normalizedName }
        ]
      }
    })

    if (existingToken) {
      return NextResponse.json(
        { 
          success: false,
          error: `Token with ${existingToken.symbol === normalizedSymbol ? 'symbol' : 'name'} "${existingToken.symbol === normalizedSymbol ? normalizedSymbol : normalizedName}" already exists`,
          existingToken: {
            id: existingToken.id,
            name: existingToken.name,
            symbol: existingToken.symbol
          }
        }, 
        { status: 409 }
      )
    }

    const creatorPublicKey = new PublicKey(data.creatorAddress)
    const payer = getPayerKeypair()
    
    // Set enhanced defaults
    const totalSupply = data.totalSupply || 1_000_000_000
    const decimals = 9
    const initialBuyAmount = data.initialBuyAmount || 0
    
    // Handle image URLs properly
    let imageUrl = data.imageUrl?.trim()
    if (!imageUrl || !validateImageUrl(imageUrl)) {
      imageUrl = generateFallbackImage(normalizedSymbol, 'logo')
    }
    
    const bannerUrl = data.bannerUrl?.trim() || undefined
    const description = data.description?.trim() || `${normalizedName} - A community-driven token on Solana`

    try {
      console.log('Creating enhanced SPL token on Solana...')
      
      const tokenResult = await createSPLTokenWithEnhancedMetadata(
        payer,
        creatorPublicKey,
        decimals,
        normalizedName,
        normalizedSymbol,
        description,
        imageUrl,
        bannerUrl,
        totalSupply,
        initialBuyAmount
      )

      console.log('SPL Token created successfully:', tokenResult)

      const tokenAddress = tokenResult.mintAddress
      const bondingCurveAddress = tokenAddress

      // Use calculated pricing from token creation
      const currentSupply = totalSupply
      const currentMarketCap = tokenResult.initialMarketCap || 0
      const currentPrice = tokenResult.initialPrice

      // Enhanced rug score calculation
      const rugScore = RugDetector.analyzeToken({
        ...data,
        hasImage: !!tokenResult.processedImageUrl && !tokenResult.processedImageUrl.includes('ui-avatars.com'),
        hasBanner: !!tokenResult.processedBannerUrl,
        hasDescription: !!description && description.length > 50,
        hasSocialLinks: !!(data.website || data.twitter || data.telegram),
        creatorAddress: data.creatorAddress
      })
      
      const riskLevel = RugDetector.getRiskLevel(rugScore) || 'MEDIUM'

      // Create token in database with enhanced data and correct pricing
      const token = await prisma.token.create({
        data: {
          name: normalizedName,
          symbol: normalizedSymbol,
          description,
          imageUrl: tokenResult.processedImageUrl,
          bannerUrl: tokenResult.processedBannerUrl || null,
          creatorAddress: data.creatorAddress.trim(),
          tokenAddress,
          bondingCurveAddress,
          totalSupply,
          currentSupply,
          website: data.website?.trim() || null,
          twitter: data.twitter?.trim() || null,
          telegram: data.telegram?.trim() || null,
          rugScore,
          price: currentPrice, // Use calculated price
          marketCap: currentMarketCap,
          isGraduated: false,
          graduatedAt: null
        }
      })

      console.log(`Enhanced token created: ${token.name} (${token.symbol})`)
      console.log(`Token Address: ${tokenAddress}`)
      console.log(`Current Price: ${currentPrice}`)
      console.log(`Market Cap: ${currentMarketCap}`)
      console.log(`Transaction: ${tokenResult.signature}`)
      console.log(`Metadata: ${tokenResult.metadataUri}`)

      const serializedToken = serializeToken(token)

      return NextResponse.json({
        success: true,
        message: 'Token created successfully with proper pricing and image handling',
        data: {
          ...serializedToken,
          riskLevel,
          transactionSignature: tokenResult.signature,
          associatedTokenAddress: tokenResult.associatedTokenAddress,
          metadataUri: tokenResult.metadataUri,
          explorerUrl: `https://explorer.solana.com/address/${tokenAddress}?cluster=${process.env.SOLANA_NETWORK === 'mainnet-beta' ? 'mainnet-beta' : 'devnet'}`,
          transactionUrl: `https://explorer.solana.com/tx/${tokenResult.signature}?cluster=${process.env.SOLANA_NETWORK === 'mainnet-beta' ? 'mainnet-beta' : 'devnet'}`,
          // Enhanced response data
          imageProcessed: tokenResult.processedImageUrl !== data.imageUrl,
          bannerProcessed: tokenResult.processedBannerUrl !== data.bannerUrl,
          formattedMarketCap: currentMarketCap >= 1000000 
            ? `${(currentMarketCap / 1000000).toFixed(2)}M`
            : currentMarketCap >= 1000 
            ? `${(currentMarketCap / 1000).toFixed(1)}K`
            : `${currentMarketCap.toFixed(2)}`,
          formattedPrice: currentPrice < 0.000001 
            ? currentPrice.toExponential(2)
            : currentPrice < 0.001 
            ? currentPrice.toFixed(8)
            : currentPrice < 1 
            ? currentPrice.toFixed(6)
            : currentPrice.toFixed(4),
          estimatedCreationCost: '0.02 SOL',
          estimatedGas: '~0.001 SOL'
        }
      }, { status: 201 })

    } catch (solanaError) {
      console.error('Solana operation failed:', solanaError)
      
      const error = solanaError as Error
      
      // Enhanced error handling
      let errorCode = 'BLOCKCHAIN_ERROR'
      let statusCode = 500
      
      if (error.message?.includes('insufficient funds')) {
        errorCode = 'INSUFFICIENT_FUNDS'
        statusCode = 400
      } else if (error.message?.includes('blockhash not found')) {
        errorCode = 'NETWORK_CONGESTION'
        statusCode = 503
      } else if (error.message?.includes('Transaction was not confirmed')) {
        errorCode = 'TRANSACTION_TIMEOUT'
        statusCode = 408
      }
      
      return NextResponse.json(
        { 
          success: false,
          error: getErrorMessage(errorCode),
          code: errorCode,
          details: error.message
        },
        { status: statusCode }
      )
    }

  } catch (error) {
    console.error('Error creating token:', error)
    
    const err = error as any
    
    if (err.code === 'P2002') {
      const field = err.meta?.target?.[0] || 'field'
      return NextResponse.json(
        { 
          success: false,
          error: `Token with this ${field} already exists`,
          code: 'DUPLICATE_ENTRY'
        },
        { status: 409 }
      )
    }
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to create token',
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      }, 
      { status: 500 }
    )

  } finally {
    await prisma.$disconnect()
  }
}

// Helper functions
function formatTimeAgo(dateString: string | Date) {
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  
  const minutes = Math.floor(diff / (1000 * 60))
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  
  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  return `${minutes}m ago`
}

// Fixed error message function with proper typing
function getErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    'INSUFFICIENT_FUNDS': 'Insufficient funds for token creation. Need at least 0.02 SOL.',
    'NETWORK_CONGESTION': 'Network congestion detected. Please try again.',
    'TRANSACTION_TIMEOUT': 'Transaction timeout. Please check if the token was created.',
    'BLOCKCHAIN_ERROR': 'Failed to create token on Solana blockchain',
    'DUPLICATE_ENTRY': 'Token already exists',
    'INTERNAL_ERROR': 'Internal server error'
  }
  return messages[code] || 'Unknown error occurred'
}