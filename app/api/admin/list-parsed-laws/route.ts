/**
 * List Parsed Laws API
 * GET /api/admin/list-parsed-laws
 *
 * Lists all .md files in data/parsed-laws directory
 */

import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface ParsedLawFile {
  fileName: string
  filePath: string
  lawName: string
  fileSize: number
  lastModified: string
}

export async function GET(request: NextRequest) {
  try {
    const parsedLawsDir = path.join(process.cwd(), 'data', 'parsed-laws')

    // Create directory if it doesn't exist
    if (!fs.existsSync(parsedLawsDir)) {
      fs.mkdirSync(parsedLawsDir, { recursive: true })
      return NextResponse.json({
        success: true,
        laws: [],
        count: 0
      })
    }

    // Read all .md files
    const files = fs.readdirSync(parsedLawsDir).filter((f) => f.endsWith('.md'))

    const laws: ParsedLawFile[] = []

    for (const fileName of files) {
      const filePath = path.join(parsedLawsDir, fileName)
      const stats = fs.statSync(filePath)

      // Extract law name from filename (remove .md extension)
      const lawName = fileName.replace(/\.md$/, '')

      laws.push({
        fileName,
        filePath: path.relative(process.cwd(), filePath),
        lawName,
        fileSize: stats.size,
        lastModified: stats.mtime.toISOString()
      })
    }

    // Sort by last modified (newest first)
    laws.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())

    return NextResponse.json({
      success: true,
      laws,
      count: laws.length
    })
  } catch (error: any) {
    console.error('[List Parsed Laws API] ❌ Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || '법령 목록 조회 중 오류가 발생했습니다'
      },
      { status: 500 }
    )
  }
}
