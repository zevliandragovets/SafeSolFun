import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

// Configuration
const UPLOAD_DIR = path.join(process.cwd(), 'public/uploads')
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

// Ensure upload directory exists
async function ensureUploadDir(dir: string) {
  try {
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true })
      console.log(`Created upload directory: ${dir}`)
    }
  } catch (error) {
    console.error('Error creating upload directory:', error)
    throw new Error('Failed to create upload directory')
  }
}

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

// Generate safe filename with better collision avoidance
function generateFilename(originalName: string, folder?: string) {
  const ext = path.extname(originalName).toLowerCase()
  const baseName = path.basename(originalName, ext).replace(/[^a-zA-Z0-9]/g, '_')
  const uuid = uuidv4().split('-')[0] // Use shorter UUID
  const timestamp = Date.now()
  const safeFilename = `${timestamp}_${baseName}_${uuid}${ext}`
  
  return safeFilename
}

// Basic image processing (placeholder for future optimization)
async function processImage(buffer: Buffer, mimeType: string, maxWidth = 1920, maxHeight = 1080): Promise<Buffer> {
  // Basic implementation - return as-is
  // In production, you could use sharp for:
  // - Resizing images
  // - Converting formats
  // - Optimizing file size
  // - Adding watermarks
  
  console.log(`Processing image: ${mimeType}, size: ${buffer.length} bytes`)
  
  // For now, just return the original buffer
  // TODO: Implement proper image optimization with sharp
  return buffer
}

// POST handler for file uploads
export async function POST(request: NextRequest) {
  try {
    console.log('Upload API called')
    
    // Parse form data
    const formData = await request.formData()
    const file = formData.get('image') as File
    const folder = formData.get('folder') as string || 'general'
    
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
      type: file.type,
      folder
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
    
    // Create folder-specific upload directory
    const folderPath = path.join(UPLOAD_DIR, folder)
    await ensureUploadDir(folderPath)
    
    // Generate safe filename
    const filename = generateFilename(file.name, folder)
    const filepath = path.join(folderPath, filename)
    
    console.log('Saving file to:', filepath)
    
    // Convert file to buffer
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    
    // Process image (currently just returns original)
    const processedBuffer = await processImage(buffer, file.type)
    
    // Save file
    await writeFile(filepath, processedBuffer)
    
    // Generate public URL
    const publicUrl = `/uploads/${folder}/${filename}`
    
    console.log('File uploaded successfully:', {
      filename,
      size: processedBuffer.length,
      url: publicUrl
    })
    
    return NextResponse.json({
      success: true,
      filename,
      url: publicUrl,
      size: processedBuffer.length,
      type: file.type
    })
    
  } catch (error: any) {
    console.error('Upload error:', error)
    
    // Handle specific error types
    if (error.code === 'ENOSPC') {
      return NextResponse.json(
        { error: 'Insufficient storage space' },
        { status: 507 }
      )
    }
    
    if (error.code === 'EACCES') {
      return NextResponse.json(
        { error: 'Permission denied' },
        { status: 500 }
      )
    }
    
    return NextResponse.json(
      { 
        error: 'Upload failed',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    )
  }
}

// GET handler for testing/health check
export async function GET() {
  return NextResponse.json({
    message: 'Upload API is working',
    maxFileSize: `${MAX_FILE_SIZE / (1024 * 1024)}MB`,
    allowedTypes: ALLOWED_TYPES,
    uploadDir: UPLOAD_DIR
  })
}