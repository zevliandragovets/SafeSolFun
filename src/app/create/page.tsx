
'use client'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, Upload, Globe, Sparkles, Rocket, Shield, TrendingUp, ChevronRight, Check, AlertCircle, Image, Zap } from 'lucide-react'

interface ImageUploadState {
  file: File | null
  preview: string | null
  uploading: boolean
  uploaded: boolean
}

interface CreateTokenResponse {
  success: boolean
  data?: {
    id: string
    name: string
    symbol: string
    tokenAddress: string
    transactionSignature: string
    explorerUrl: string
    transactionUrl: string
    metadataUri: string
    price: number
    marketCap: number
    formattedPrice: string
    formattedMarketCap: string
  }
  error?: string
  details?: string[]
  code?: string
}

const useWallet = () => {
  const [connected, setConnected] = useState(false)
  const [publicKey, setPublicKey] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  const connect = async () => {
    setConnecting(true)
    
    // Check if Phantom wallet is available
    if (typeof window !== 'undefined' && window.solana && window.solana.isPhantom) {
      try {
        const response = await window.solana.connect()
        setConnected(true)
        setPublicKey(response.publicKey.toString())
        setConnecting(false)
      } catch (error) {
        console.error('Wallet connection failed:', error)
        setConnecting(false)
      }
    } else {
      // Fallback for development/testing
      setTimeout(() => {
        setConnected(true)
        setPublicKey('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM')
        setConnecting(false)
      }, 1000)
    }
  }

  const disconnect = () => {
    if (typeof window !== 'undefined' && window.solana) {
      window.solana.disconnect()
    }
    setConnected(false)
    setPublicKey(null)
  }

  return { connected, publicKey, connecting, connect, disconnect }
}

export default function CreatePage() {
  const { connected, publicKey, connecting, connect } = useWallet()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<CreateTokenResponse['data'] | null>(null)
  
  const [formData, setFormData] = useState({
    name: '',
    symbol: '',
    description: '',
    imageUrl: '',
    bannerUrl: '',
    website: '',
    twitter: '',
    telegram: '',
    initialBuyAmount: '',
    slippage: 1
  })
  
  const [logoUpload, setLogoUpload] = useState<ImageUploadState>({
    file: null,
    preview: null,
    uploading: false,
    uploaded: false
  })
  
  const [bannerUpload, setBannerUpload] = useState<ImageUploadState>({
    file: null,
    preview: null,
    uploading: false,
    uploaded: false
  })

  const handleImageUpload = async (file: File, type: 'logo' | 'banner') => {
    if (!file) return

    const preview = URL.createObjectURL(file)
    const uploadState = type === 'logo' ? logoUpload : bannerUpload
    const setUploadState = type === 'logo' ? setLogoUpload : setBannerUpload

    setUploadState({
      file,
      preview,
      uploading: true,
      uploaded: false
    })

    try {
      const formData = new FormData()
      formData.append('image', file)
      
      console.log(`Uploading ${type}:`, file.name, file.size, file.type)
      
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })
      
      console.log('Upload response status:', response.status)
      
      if (!response.ok) {
        let errorMessage = `Upload failed: ${response.status} ${response.statusText}`
        try {
          const errorData = await response.json()
          errorMessage = errorData.error || errorMessage
        } catch (parseError) {
          // If we can't parse the error response, use the default message
        }
        throw new Error(errorMessage)
      }
      
      const data = await response.json()
      console.log('Upload successful:', data)
      
      if (!data.success || !data.url) {
        throw new Error('Invalid response from upload service')
      }
      
      setUploadState({
        file,
        preview,
        uploading: false,
        uploaded: true
      })

      // Update form data with uploaded image URL
      setFormData(prev => ({
        ...prev,
        [type === 'logo' ? 'imageUrl' : 'bannerUrl']: data.url
      }))
      
      console.log(`${type} upload completed successfully`)
      
    } catch (error) {
      console.error(`${type} upload failed:`, error)
      
      // Clear the upload state
      setUploadState({
        file: null,
        preview: null,
        uploading: false,
        uploaded: false
      })
      
      // Clean up the preview URL
      if (preview) {
        URL.revokeObjectURL(preview)
      }
      
      // Show error to user
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setError(`${type === 'logo' ? 'Logo' : 'Banner'} upload failed: ${errorMessage}`)
      
      // Auto-clear error after 8 seconds
      setTimeout(() => {
        setError(null)
      }, 8000)
    }
  }

  const removeImage = (type: 'logo' | 'banner') => {
    const uploadState = type === 'logo' ? logoUpload : bannerUpload
    const setUploadState = type === 'logo' ? setLogoUpload : setBannerUpload
    
    if (uploadState.preview) {
      URL.revokeObjectURL(uploadState.preview)
    }
    
    setUploadState({
      file: null,
      preview: null,
      uploading: false,
      uploaded: false
    })

    // Clear form data
    setFormData(prev => ({
      ...prev,
      [type === 'logo' ? 'imageUrl' : 'bannerUrl']: ''
    }))
  }

  const handleInputChange = (field: string, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const validateStep1 = () => {
    return formData.name.trim() !== '' && formData.symbol.trim() !== ''
  }

  const validateFormData = () => {
    const errors: string[] = []
    
    // Name validation
    if (!formData.name.trim()) {
      errors.push('Token name is required')
    } else if (formData.name.trim().length > 32) {
      errors.push('Token name must be 32 characters or less')
    }
    
    // Symbol validation
    if (!formData.symbol.trim()) {
      errors.push('Token symbol is required')
    } else if (formData.symbol.trim().length > 10 || formData.symbol.trim().length < 1) {
      errors.push('Token symbol must be between 1 and 10 characters')
    }
    
    // Description validation
    if (formData.description && formData.description.trim().length > 1000) {
      errors.push('Description must be 1000 characters or less')
    }
    
    // Website validation
    if (formData.website.trim() && formData.website.trim() !== '') {
      try {
        const url = formData.website.trim()
        new URL(url.startsWith('http') ? url : `https://${url}`)
      } catch {
        errors.push('Please enter a valid website URL')
      }
    }
    
    // Initial buy amount validation
    if (formData.initialBuyAmount && formData.initialBuyAmount !== '') {
      const amount = parseFloat(formData.initialBuyAmount)
      if (isNaN(amount) || amount < 0) {
        errors.push('Initial buy amount must be a valid positive number')
      }
    }
    
    return errors
  }

  const handleNext = () => {
    if (step === 1 && !validateStep1()) {
      setError('Please fill in required fields (Name and Symbol)')
      return
    }
    
    const validationErrors = validateFormData()
    if (validationErrors.length > 0) {
      setError(validationErrors[0])
      return
    }
    
    setError(null)
    setStep(2)
  }

  const handleCreateToken = async () => {
    if (!connected || !publicKey) {
      setError('Please connect your wallet first')
      return
    }

    // Validate all form data before submission
    const validationErrors = validateFormData()
    if (validationErrors.length > 0) {
      setError(validationErrors[0])
      return
    }

    // Additional validation for required fields
    if (!formData.name.trim() || !formData.symbol.trim()) {
      setError('Please fill in required fields (Name and Symbol)')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Prepare request data with proper validation and type handling
      const requestData = {
        name: formData.name.trim(),
        symbol: formData.symbol.trim().toUpperCase(),
        description: formData.description.trim() || '',
        imageUrl: formData.imageUrl.trim() || '',
        bannerUrl: formData.bannerUrl.trim() || '',
        website: formData.website.trim() || '',
        twitter: formData.twitter.trim() || '',
        telegram: formData.telegram.trim() || '',
        creatorAddress: publicKey.trim(),
        initialBuyAmount: formData.initialBuyAmount && formData.initialBuyAmount.trim() !== '' 
          ? parseFloat(formData.initialBuyAmount) 
          : 0,
        totalSupply: 1000000000, // 1 billion tokens
      }

      console.log('Creating token with data:', requestData)

      const response = await fetch('/api/tokens', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      })

      const result: CreateTokenResponse = await response.json()

      if (!response.ok) {
        console.error('API Error:', result)
        
        // Handle specific error codes
        if (result.code === 'INVALID_ADDRESS' || result.code === 'INVALID_ADDRESS_FORMAT') {
          throw new Error('Invalid wallet address. Please reconnect your wallet.')
        }
        
        // Handle validation errors
        if (result.details && result.details.length > 0) {
          throw new Error(result.details[0])
        }
        
        throw new Error(result.error || 'Failed to create token')
      }

      if (result.success && result.data) {
        setSuccess(result.data)
        console.log('Token created successfully:', result.data)
      } else {
        throw new Error(result.error || 'Unknown error occurred')
      }

    } catch (error) {
      console.error('Token creation failed:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to create token'
      setError(errorMessage)
      
      // If it's an address error, suggest wallet reconnection
      if (errorMessage.includes('Invalid wallet address') || errorMessage.includes('address format')) {
        setTimeout(() => {
          setError('Please reconnect your wallet with a valid address')
        }, 100)
      }
    } finally {
      setLoading(false)
    }
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen bg-black">
        {/* Background Effects */}
        <div className="fixed inset-0 bg-gradient-to-br from-[#C0283D]/5 via-black to-black pointer-events-none" />
        <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[#C0283D]/10 via-transparent to-transparent pointer-events-none" />
        
        <div className="relative max-w-4xl mx-auto px-4 py-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center space-y-8"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-full mb-6">
              <Check size={16} className="text-green-500" />
              <span className="text-sm text-green-500">Token Created Successfully</span>
            </div>
            
            <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
              {success.name} is Live!
            </h1>
            
            <p className="text-white/40 text-lg max-w-2xl mx-auto">
              Your token has been successfully deployed on Solana and is ready for trading
            </p>

            <div className="bg-gradient-to-r from-white/[0.02] to-white/[0.01] backdrop-blur-sm rounded-2xl p-8 border border-white/10">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-white/40 mb-2">Token Address</p>
                  <p className="text-white font-mono text-sm bg-black/50 px-3 py-2 rounded-lg">
                    {success.tokenAddress}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-white/40 mb-2">Current Price</p>
                  <p className="text-2xl font-bold text-[#C0283D]">{success.formattedPrice} SOL</p>
                </div>
                <div>
                  <p className="text-sm text-white/40 mb-2">Market Cap</p>
                  <p className="text-lg font-semibold text-white">{success.formattedMarketCap}</p>
                </div>
                <div>
                  <p className="text-sm text-white/40 mb-2">Symbol</p>
                  <p className="text-lg font-semibold text-white">${success.symbol}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href={success.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-medium text-white transition-all text-center"
              >
                View on Solana Explorer
              </a>
              <a
                href={success.transactionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 bg-gradient-to-r from-[#C0283D] to-[#C0283D]/80 text-white rounded-xl font-semibold transition-all hover:shadow-lg hover:shadow-[#C0283D]/30 text-center"
              >
                View Transaction
              </a>
            </div>

            <button
              onClick={() => {
                setSuccess(null)
                setStep(1)
                setFormData({
                  name: '',
                  symbol: '',
                  description: '',
                  imageUrl: '',
                  bannerUrl: '',
                  website: '',
                  twitter: '',
                  telegram: '',
                  initialBuyAmount: '',
                  slippage: 1
                })
                setLogoUpload({
                  file: null,
                  preview: null,
                  uploading: false,
                  uploaded: false
                })
                setBannerUpload({
                  file: null,
                  preview: null,
                  uploading: false,
                  uploaded: false
                })
              }}
              className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-medium text-white transition-all"
            >
              Create Another Token
            </button>
          </motion.div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Background Effects */}
      <div className="fixed inset-0 bg-gradient-to-br from-[#C0283D]/5 via-black to-black pointer-events-none" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[#C0283D]/10 via-transparent to-transparent pointer-events-none" />
      
      <div className="relative max-w-4xl mx-auto px-4 py-12">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12 text-center"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#C0283D]/10 border border-[#C0283D]/20 rounded-full mb-6">
            <Sparkles size={16} className="text-[#C0283D]" />
            <span className="text-sm text-[#C0283D]">Token Creator</span>
          </div>
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
            Launch Your Token
          </h1>
          <p className="text-white/40 text-lg max-w-2xl mx-auto">
            Create and deploy your token on Solana with automated liquidity pools and instant trading
          </p>
        </motion.div>

        {/* Error Display */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3"
          >
            <AlertCircle size={20} className="text-red-500 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-500">Error</p>
              <p className="text-xs text-red-500/80 mt-1">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-500/60 hover:text-red-500"
            >
              <X size={16} />
            </button>
          </motion.div>
        )}

        {step === 1 && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-8"
          >
            {/* Upload Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Logo Upload */}
              <div className="group">
                <label className="block text-sm font-medium text-white/80 mb-3">
                  Token Logo
                </label>
                <div className={`relative border-2 border-dashed rounded-2xl p-8 transition-all ${
                  logoUpload.preview 
                    ? 'border-[#C0283D]/30 bg-[#C0283D]/5' 
                    : 'border-white/10 hover:border-[#C0283D]/30 bg-white/[0.02] hover:bg-[#C0283D]/5'
                }`}>
                  {logoUpload.uploading ? (
                    <div className="text-center">
                      <div className="w-16 h-16 mx-auto mb-4 bg-[#C0283D]/10 rounded-2xl flex items-center justify-center">
                        <div className="w-6 h-6 border-2 border-[#C0283D]/30 border-t-[#C0283D] rounded-full animate-spin" />
                      </div>
                      <p className="text-sm text-[#C0283D]">Uploading...</p>
                    </div>
                  ) : logoUpload.preview ? (
                    <div className="flex flex-col items-center">
                      <div className="relative">
                        <img 
                          src={logoUpload.preview} 
                          alt="Logo" 
                          className="w-24 h-24 rounded-2xl object-cover ring-4 ring-[#C0283D]/20"
                        />
                        <button
                          onClick={() => removeImage('logo')}
                          className="absolute -top-2 -right-2 p-1.5 bg-black border border-white/10 rounded-full hover:bg-[#C0283D]/20 transition-colors"
                        >
                          <X size={14} className="text-white/60" />
                        </button>
                      </div>
                      <p className="text-sm text-[#C0283D] mt-3">Logo uploaded</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) handleImageUpload(file, 'logo')
                        }}
                        className="hidden"
                        id="logo-upload"
                      />
                      <label
                        htmlFor="logo-upload"
                        className="cursor-pointer group"
                      >
                        <div className="w-16 h-16 mx-auto mb-4 bg-[#C0283D]/10 rounded-2xl flex items-center justify-center group-hover:bg-[#C0283D]/20 transition-colors">
                          <Image size={24} className="text-[#C0283D]" />
                        </div>
                        <p className="text-sm text-white/60 mb-2">Click to upload</p>
                        <p className="text-xs text-white/40">PNG, JPG, GIF (Max 5MB)</p>
                      </label>
                    </div>
                  )}
                </div>
              </div>

              {/* Banner Upload */}
              <div className="group">
                <label className="block text-sm font-medium text-white/80 mb-3">
                  Banner Image
                </label>
                <div className={`relative border-2 border-dashed rounded-2xl p-8 transition-all ${
                  bannerUpload.preview 
                    ? 'border-[#C0283D]/30 bg-[#C0283D]/5' 
                    : 'border-white/10 hover:border-[#C0283D]/30 bg-white/[0.02] hover:bg-[#C0283D]/5'
                }`}>
                  {bannerUpload.uploading ? (
                    <div className="text-center">
                      <div className="w-16 h-16 mx-auto mb-4 bg-white/5 rounded-2xl flex items-center justify-center">
                        <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      </div>
                      <p className="text-sm text-white/60">Uploading...</p>
                    </div>
                  ) : bannerUpload.preview ? (
                    <div className="space-y-3">
                      <div className="relative">
                        <img 
                          src={bannerUpload.preview} 
                          alt="Banner" 
                          className="w-full h-24 object-cover rounded-xl ring-4 ring-[#C0283D]/20"
                        />
                        <button
                          onClick={() => removeImage('banner')}
                          className="absolute -top-2 -right-2 p-1.5 bg-black border border-white/10 rounded-full hover:bg-[#C0283D]/20 transition-colors"
                        >
                          <X size={14} className="text-white/60" />
                        </button>
                      </div>
                      <p className="text-sm text-[#C0283D] text-center">Banner uploaded</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) handleImageUpload(file, 'banner')
                        }}
                        className="hidden"
                        id="banner-upload"
                      />
                      <label
                        htmlFor="banner-upload"
                        className="cursor-pointer group"
                      >
                        <div className="w-16 h-16 mx-auto mb-4 bg-white/5 rounded-2xl flex items-center justify-center group-hover:bg-[#C0283D]/10 transition-colors">
                          <Upload size={24} className="text-white/40 group-hover:text-[#C0283D]/60" />
                        </div>
                        <p className="text-sm text-white/60 mb-2">Click to upload</p>
                        <p className="text-xs text-white/40">800x400px recommended</p>
                      </label>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Token Info */}
            <div className="bg-gradient-to-r from-white/[0.02] to-white/[0.01] backdrop-blur-sm rounded-2xl p-8 border border-white/10">              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-3">
                    Token Name <span className="text-[#C0283D]">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    placeholder="e.g. Solana Token"
                    maxLength={32}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder-white/30 focus:border-[#C0283D]/50 focus:outline-none focus:ring-2 focus:ring-[#C0283D]/20 transition-all"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-3">Telegram</label>
                  <input
                    type="text"
                    value={formData.telegram}
                    onChange={(e) => handleInputChange('telegram', e.target.value)}
                    placeholder="@username"
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder-white/30 focus:border-[#C0283D]/50 focus:outline-none focus:ring-2 focus:ring-[#C0283D]/20 transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Next Button */}
            <div className="flex justify-end">
              <button
                onClick={handleNext}
                disabled={!validateStep1()}
                className="group px-8 py-4 bg-gradient-to-r from-[#C0283D] to-[#C0283D]/80 text-white rounded-xl font-semibold transition-all hover:shadow-lg hover:shadow-[#C0283D]/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                Continue to Launch Settings
                <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-8"
          >
            {/* Token Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gradient-to-br from-[#C0283D]/10 to-transparent border border-[#C0283D]/20 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div>
                    <p className="text-xs text-white/40">Total Supply</p>
                    <p className="text-lg font-bold text-white">1,000,000,000</p>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-white/5 to-transparent border border-white/10 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div>
                    <p className="text-xs text-white/40">Creation Cost</p>
                    <p className="text-lg font-bold text-green-400">FREE</p>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-white/5 to-transparent border border-white/10 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div>
                    <p className="text-xs text-white/40">DEX Migration</p>
                    <p className="text-lg font-bold text-white">~30 SOL</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Launch Configuration */}
            <div className="bg-gradient-to-r from-white/[0.02] to-white/[0.01] backdrop-blur-sm rounded-2xl p-8 border border-white/10">
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-3">
                    Initial Buy Amount (Optional)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={formData.initialBuyAmount}
                      onChange={(e) => handleInputChange('initialBuyAmount', e.target.value)}
                      placeholder="0.0"
                      min="0"
                      step="0.001"
                      className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3.5 pr-16 text-white placeholder-white/30 focus:border-[#C0283D]/50 focus:outline-none focus:ring-2 focus:ring-[#C0283D]/20 transition-all"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40">SOL</span>
                  </div>
                  <p className="text-xs text-white/40 mt-2">Automatically buy tokens at launch to establish initial liquidity</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-3">
                    Slippage Tolerance
                  </label>
                  <div className="flex gap-2">
                    {[0.5, 1, 3, 5].map((value) => (
                      <button
                        key={value}
                        onClick={() => handleInputChange('slippage', value)}
                        className={`px-6 py-3 rounded-xl font-medium transition-all ${
                          formData.slippage === value
                            ? 'bg-[#C0283D] text-white shadow-lg shadow-[#C0283D]/30'
                            : 'bg-white/5 text-white/60 hover:bg-white/10 border border-white/10'
                        }`}
                      >
                        {value}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Preview Card */}
            {(formData.name || formData.symbol) && (
              <div className="bg-gradient-to-r from-[#C0283D]/5 to-transparent border border-[#C0283D]/20 rounded-2xl p-8">
                <div className="flex items-start gap-6">
                  {logoUpload.preview ? (
                    <img 
                      src={logoUpload.preview} 
                      alt="Logo" 
                      className="w-20 h-20 rounded-2xl object-cover ring-4 ring-[#C0283D]/20"
                    />
                  ) : (
                    <div className="w-20 h-20 bg-[#C0283D]/10 rounded-2xl flex items-center justify-center">
                      <span className="text-2xl font-bold text-[#C0283D]">
                        {formData.symbol ? formData.symbol[0] : '?'}
                      </span>
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="text-2xl font-bold text-white">{formData.name || 'Token Name'}</h4>
                      <span className="px-3 py-1 bg-[#C0283D]/20 text-[#C0283D] rounded-full text-sm font-medium">
                        ${formData.symbol || 'SYMBOL'}
                      </span>
                    </div>
                    {formData.description && (
                      <p className="text-white/60 leading-relaxed">{formData.description}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Cost Summary */}
            <div className="bg-gradient-to-r from-white/[0.02] to-white/[0.01] backdrop-blur-sm rounded-2xl p-8 border border-white/10">
              <div className="space-y-4">
                <div className="flex justify-between items-center pb-4 border-b border-white/10">
                  <span className="text-white/60">Creation Cost</span>
                  <span className="text-green-400 font-semibold">FREE</span>
                </div>
                {formData.initialBuyAmount && parseFloat(formData.initialBuyAmount) > 0 && (
                  <div className="flex justify-between items-center pb-4 border-b border-white/10">
                    <span className="text-white/60">Initial Buy</span>
                    <span className="text-white font-semibold">{formData.initialBuyAmount} SOL</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-lg font-semibold text-white">Total Cost</span>
                  <span className="text-2xl font-bold text-[#C0283D]">
                    {formData.initialBuyAmount && parseFloat(formData.initialBuyAmount) > 0 
                      ? `${formData.initialBuyAmount} SOL` 
                      : 'FREE'}
                  </span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-between items-center">
              <button
                onClick={() => setStep(1)}
                className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-medium text-white transition-all"
              >
                Back
              </button>
              
              <button
                onClick={handleCreateToken}
                disabled={loading || !connected}
                className="group px-8 py-4 bg-gradient-to-r from-[#C0283D] to-[#C0283D]/80 text-white rounded-xl font-semibold transition-all hover:shadow-lg hover:shadow-[#C0283D]/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating Token...
                  </>
                ) : (
                  <>
                    <Rocket size={20} />
                    Launch Token
                  </>
                )}
              </button>
            </div>

            {/* Wallet Connection Warning */}
            {!connected && (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle size={20} className="text-yellow-500 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-yellow-500">Wallet not connected</p>
                  <p className="text-xs text-yellow-500/60 mt-1">Connect your wallet to create a token</p>
                </div>
                <button
                  onClick={connect}
                  disabled={connecting}
                  className="px-4 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-500 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                >
                  {connecting ? 'Connecting...' : 'Connect Wallet'}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  )
}
