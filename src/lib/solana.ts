import { Connection, PublicKey } from '@solana/web3.js'

export const connection = new Connection(
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  'confirmed'
)

export class BondingCurve {
  // Constants for the bonding curve
  static readonly TARGET_SUPPLY = 800_000_000 // 800M tokens before graduation
  static readonly INITIAL_VIRTUAL_SOL_RESERVES = 30 // Virtual SOL reserves
  static readonly INITIAL_VIRTUAL_TOKEN_RESERVES = 1_073_000_000 // Virtual token reserves
  static readonly GRADUATION_MARKET_CAP = 30 // SOL needed to graduate

  /**
   * Calculate current price based on supply using constant product formula
   * Price = (virtual_sol_reserves) / (virtual_token_reserves - current_supply)
   */
  static calculatePrice(currentSupply: number): number {
    if (currentSupply >= this.TARGET_SUPPLY) {
      return this.GRADUATION_MARKET_CAP / this.TARGET_SUPPLY
    }

    const virtualTokenReserves = this.INITIAL_VIRTUAL_TOKEN_RESERVES - currentSupply
    if (virtualTokenReserves <= 0) return 0
    
    return this.INITIAL_VIRTUAL_SOL_RESERVES / virtualTokenReserves
  }

  /**
   * Calculate tokens received for a given SOL amount
   * Uses the constant product formula: (sol_reserves + sol_in) * (token_reserves - token_out) = k
   */
  static calculateTokensForSol(solAmount: number, currentSupply: number): number {
    if (currentSupply >= this.TARGET_SUPPLY) {
      throw new Error('Token has graduated to DEX')
    }

    const virtualSolReserves = this.INITIAL_VIRTUAL_SOL_RESERVES
    const virtualTokenReserves = this.INITIAL_VIRTUAL_TOKEN_RESERVES - currentSupply
    
    // Constant product: k = virtualSolReserves * virtualTokenReserves
    const k = virtualSolReserves * virtualTokenReserves
    
    // After adding SOL: newTokenReserves = k / (virtualSolReserves + solAmount)
    const newTokenReserves = k / (virtualSolReserves + solAmount)
    
    // Tokens out = current token reserves - new token reserves
    const tokensOut = virtualTokenReserves - newTokenReserves
    
    return Math.floor(tokensOut)
  }

  /**
   * Calculate SOL received for a given token amount
   */
  static calculateSolForTokens(tokenAmount: number, currentSupply: number): number {
    if (currentSupply >= this.TARGET_SUPPLY) {
      throw new Error('Token has graduated to DEX')
    }

    const virtualSolReserves = this.INITIAL_VIRTUAL_SOL_RESERVES
    const virtualTokenReserves = this.INITIAL_VIRTUAL_TOKEN_RESERVES - currentSupply
    
    // Constant product: k = virtualSolReserves * virtualTokenReserves
    const k = virtualSolReserves * virtualTokenReserves
    
    // After removing tokens: newSolReserves = k / (virtualTokenReserves + tokenAmount)
    const newSolReserves = k / (virtualTokenReserves + tokenAmount)
    
    // SOL out = current SOL reserves - new SOL reserves
    const solOut = virtualSolReserves - newSolReserves
    
    return Math.max(0, solOut)
  }

  /**
   * Calculate market cap at current supply
   */
  static calculateMarketCap(currentSupply: number): number {
    if (currentSupply >= this.TARGET_SUPPLY) {
      return this.GRADUATION_MARKET_CAP
    }

    return currentSupply * this.calculatePrice(currentSupply)
  }

  /**
   * Get bonding curve progress (0-100%)
   */
  static getProgress(currentSupply: number): number {
    return Math.min(100, (currentSupply / this.TARGET_SUPPLY) * 100)
  }

  /**
   * Check if token is ready to graduate
   */
  static shouldGraduate(currentSupply: number, marketCap: number): boolean {
    return currentSupply >= this.TARGET_SUPPLY || marketCap >= this.GRADUATION_MARKET_CAP
  }

  /**
   * Calculate buy/sell fees
   */
  static calculateFees(solAmount: number, isBuy: boolean = true) {
    const buyFeeRate = 0.01 // 1%
    const sellFeeRate = 0.05 // 5%
    
    const feeRate = isBuy ? buyFeeRate : sellFeeRate
    const feeAmount = solAmount * feeRate
    const netAmount = isBuy ? solAmount : solAmount - feeAmount
    
    return {
      feeAmount,
      netAmount,
      feeRate: feeRate * 100 // Return as percentage
    }
  }
}

export class RugDetector {
  /**
   * Analyze token for rug pull indicators
   */
  static analyzeToken(token: any): number {
    let rugScore = 0
    
    // Creator address validation (20 points)
    if (!token.creatorAddress) rugScore += 20
    else {
      // Check if creator address looks suspicious (starts with 1111, etc.)
      if (token.creatorAddress.startsWith('1111')) rugScore += 10
    }
    
    // Social presence validation (15 points)
    const socialLinks = [token.website, token.twitter, token.telegram].filter(Boolean)
    if (socialLinks.length === 0) rugScore += 15
    else if (socialLinks.length === 1) rugScore += 10
    else if (socialLinks.length === 2) rugScore += 5
    
    // Description quality (15 points)
    if (!token.description) rugScore += 15
    else if (token.description.length < 20) rugScore += 10
    else if (token.description.length < 50) rugScore += 5
    
    // Image presence (10 points)
    if (!token.imageUrl) rugScore += 10
    
    // Banner presence (5 points)
    if (!token.bannerUrl) rugScore += 5
    
    // Name/Symbol quality (10 points)
    if (!token.name || token.name.length < 3) rugScore += 5
    if (!token.symbol || token.symbol.length < 2) rugScore += 5
    
    // Check for generic/suspicious names (10 points)
    const suspiciousPatterns = ['test', '123', 'temp', 'sample', 'xxx']
    const nameToCheck = (token.name + ' ' + token.symbol).toLowerCase()
    if (suspiciousPatterns.some(pattern => nameToCheck.includes(pattern))) {
      rugScore += 10
    }
    
    // Token economics validation (15 points)
    if (token.totalSupply && token.totalSupply > 1_000_000_000_000) rugScore += 10 // Too many tokens
    if (!token.initialBuy || token.initialBuy === 0) rugScore += 5 // No initial buy
    
    return Math.min(rugScore, 100)
  }
  
  /**
   * Get risk level based on rug score
   */
  static getRiskLevel(score: number): string {
    if (score < 15) return 'VERY_LOW'
    if (score < 30) return 'LOW'
    if (score < 50) return 'MEDIUM'
    if (score < 70) return 'HIGH'
    if (score < 85) return 'VERY_HIGH'
    return 'EXTREME'
  }

  /**
   * Get risk level color for UI
   */
  static getRiskColor(riskLevel: string): string {
    switch (riskLevel) {
      case 'VERY_LOW': return '#22c55e' // Green
      case 'LOW': return '#84cc16' // Light green
      case 'MEDIUM': return '#eab308' // Yellow
      case 'HIGH': return '#f97316' // Orange
      case 'VERY_HIGH': return '#ef4444' // Red
      case 'EXTREME': return '#dc2626' // Dark red
      default: return '#6b7280' // Gray
    }
  }

  /**
   * Get detailed risk analysis
   */
  static getDetailedAnalysis(token: any) {
    const score = this.analyzeToken(token)
    const riskLevel = this.getRiskLevel(score)
    
    const issues = []
    const positives = []
    
    // Check each factor
    if (!token.creatorAddress) issues.push('No creator address provided')
    if (!token.website && !token.twitter && !token.telegram) issues.push('No social media presence')
    if (!token.description || token.description.length < 50) issues.push('Poor or missing description')
    if (!token.imageUrl) issues.push('No token image')
    if (!token.bannerUrl) issues.push('No banner image')
    
    // Positives
    if (token.website) positives.push('Has website')
    if (token.twitter) positives.push('Has Twitter/X')
    if (token.telegram) positives.push('Has Telegram')
    if (token.description && token.description.length >= 100) positives.push('Detailed description')
    if (token.imageUrl) positives.push('Has token image')
    if (token.bannerUrl) positives.push('Has banner image')
    
    return {
      score,
      riskLevel,
      color: this.getRiskColor(riskLevel),
      issues,
      positives,
      recommendation: this.getRecommendation(riskLevel)
    }
  }

  /**
   * Get trading recommendation based on risk level
   */
  static getRecommendation(riskLevel: string): string {
    switch (riskLevel) {
      case 'VERY_LOW':
        return 'Low risk - Generally safe to trade'
      case 'LOW':
        return 'Moderate risk - Exercise normal caution'
      case 'MEDIUM':
        return 'Medium risk - Do your own research'
      case 'HIGH':
        return 'High risk - Trade with extreme caution'
      case 'VERY_HIGH':
        return 'Very high risk - Avoid unless you understand the risks'
      case 'EXTREME':
        return 'Extreme risk - Likely a scam or rug pull'
      default:
        return 'Unknown risk level'
    }
  }
}

/**
 * Utility functions for token operations
 */
export class TokenUtils {
  /**
   * Format large numbers for display
   */
  static formatNumber(num: number, decimals: number = 2): string {
    if (num >= 1_000_000_000) {
      return (num / 1_000_000_000).toFixed(decimals) + 'B'
    } else if (num >= 1_000_000) {
      return (num / 1_000_000).toFixed(decimals) + 'M'
    } else if (num >= 1_000) {
      return (num / 1_000).toFixed(decimals) + 'K'
    }
    return num.toFixed(decimals)
  }

  /**
   * Format SOL amounts
   */
  static formatSol(amount: number): string {
    if (amount < 0.001) return '< 0.001 SOL'
    if (amount < 1) return amount.toFixed(4) + ' SOL'
    return amount.toFixed(2) + ' SOL'
  }

  /**
   * Calculate price change percentage
   */
  static calculatePriceChange(oldPrice: number, newPrice: number): number {
    if (oldPrice === 0) return 0
    return ((newPrice - oldPrice) / oldPrice) * 100
  }

  /**
   * Validate Solana address
   */
  static isValidSolanaAddress(address: string): boolean {
    try {
      new PublicKey(address)
      return true
    } catch {
      return false
    }
  }

  /**
   * Generate a random token symbol
   */
  static generateTokenSymbol(name: string): string {
    const cleaned = name.replace(/[^A-Za-z]/g, '').toUpperCase()
    if (cleaned.length >= 3) return cleaned.substring(0, 6)
    return cleaned + Math.random().toString(36).substring(2, 5).toUpperCase()
  }
}