import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'

// Configuration
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

// Enhanced file validation
function validateFile(file: File) {
  const errors: string[] = []
  
  // Check file type
  if (!ALLOWED_TYPES.includes(file.type)) {
    errors.push('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.')
  }
  
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    errors.push(`File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB.`)
  }
  
  // Check if file is actually provided
  if (!file.name || file.size === 0) {
    errors.push('Empty file or no filename provided.')
  }
  
  return errors
}

// Generate safe filename
function generateFilename(originalName: string) {
  const ext = originalName.split('.').pop()?.toLowerCase() || 'jpg'
  const baseName = originalName.split('.')[0].replace(/[^a-zA-Z0-9]/g, '_')
  const uuid = uuidv4().split('-')[0]
  const timestamp = Date.now()
  return `${timestamp}_${baseName}_${uuid}.${ext}`
}

// Create optimized data URL
function createOptimizedDataUrl(buffer: Buffer, mimeType: string): string {
  // For very large images, we might want to compress them
  // But for now, just create the data URL
  const base64 = buffer.toString('base64')
  return `data:${mimeType};base64,${base64}`
}

// POST handler for file uploads
export async function POST(request: NextRequest) {
  try {
    console.log('Upload API called')
    
    // Check content length to avoid memory issues
    const contentLength = request.headers.get('content-length')
    if (contentLength && parseInt(contentLength) > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large' },
        { status: 413 }
      )
    }
    
    // Parse form data with error handling
    let formData: FormData
    try {
      formData = await request.formData()
    } catch (parseError) {
      console.error('Failed to parse form data:', parseError)
      return NextResponse.json(
        { error: 'Invalid form data' },
        { status: 400 }
      )
    }
    
    const file = formData.get('image') as File
    
    if (!file) {
      console.error('No file provided in request')
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }
    
    console.log('File received:', {
      name: file.name,
      size: file.size,
      type: file.type
    })
    
    // Validate file
    const validationErrors = validateFile(file)
    if (validationErrors.length > 0) {
      console.error('File validation failed:', validationErrors)
      return NextResponse.json(
        { error: validationErrors[0] },
        { status: 400 }
      )
    }
    
    // Generate safe filename
    const filename = generateFilename(file.name)
    
    // Convert file to buffer with memory management
    let buffer: Buffer
    try {
      const bytes = await file.arrayBuffer()
      buffer = Buffer.from(bytes)
      
      // Double-check size after reading
      if (buffer.length > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: 'File too large after reading' },
          { status: 413 }
        )
      }
    } catch (bufferError) {
      console.error('Failed to read file buffer:', bufferError)
      return NextResponse.json(
        { error: 'Failed to process file' },
        { status: 500 }
      )
    }
    
    // Create data URL (this is the only option for Vercel serverless)
    let publicUrl: string
    try {
      publicUrl = createOptimizedDataUrl(buffer, file.type)
      console.log('Data URL created, length:', publicUrl.length)
    } catch (dataUrlError) {
      console.error('Failed to create data URL:', dataUrlError)
      return NextResponse.json(
        { error: 'Failed to process image' },
        { status: 500 }
      )
    }
    
    console.log('File processed successfully:', {
      filename,
      originalSize: file.size,
      processedSize: buffer.length,
      dataUrlLength: publicUrl.length
    })
    
    return NextResponse.json({
      success: true,
      filename,
      url: publicUrl,
      size: buffer.length,
      type: file.type,
      originalSize: file.size
    })
    
  } catch (error: any) {
    console.error('Upload error:', error)
    
    // Handle specific error types
    if (error.name === 'PayloadTooLargeError') {
      return NextResponse.json(
        { error: 'File too large' },
        { status: 413 }
      )
    }
    
    if (error.code === 'LIMIT_FILE_SIZE') {
      return NextResponse.json(
        { error: 'File size limit exceeded' },
        { status: 413 }
      )
    }
    
    return NextResponse.json(
      { 
        error: 'Upload failed',
        details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      },
      { status: 500 }
    )
  }
}

// GET handler for health check
export async function GET() {
  return NextResponse.json({
    message: 'Upload API is working',
    maxFileSize: `${MAX_FILE_SIZE / (1024 * 1024)}MB`,
    allowedTypes: ALLOWED_TYPES,
    storage: 'data-url (serverless compatible)',
    environment: process.env.NODE_ENV || 'development'
  })
}

// Add OPTIONS handler for CORS if needed
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
