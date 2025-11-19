/**
 * Read Parsed Law API
 * GET /api/admin/read-parsed-law?fileName=xxx.md
 *
 * Reads a single parsed law markdown file
 */

import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const fileName = searchParams.get('fileName')

    if (!fileName) {
      return NextResponse.json({ success: false, error: 'fileName is required' }, { status: 400 })
    }

    // Security: Prevent path traversal
    if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      return NextResponse.json({ success: false, error: 'Invalid fileName' }, { status: 400 })
    }

    const filePath = path.join(process.cwd(), 'data', 'parsed-laws', fileName)

    // Check if file exists
    try {
      await fs.access(filePath)
    } catch {
      return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 })
    }

    // Read file
    const markdown = await fs.readFile(filePath, 'utf-8')

    return NextResponse.json({
      success: true,
      fileName,
      markdown,
      size: markdown.length
    })
  } catch (error: any) {
    console.error('[Read Parsed Law API] Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to read file'
      },
      { status: 500 }
    )
  }
}
