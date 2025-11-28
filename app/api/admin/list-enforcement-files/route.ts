/**
 * List Enforcement Files API
 * GET /api/admin/list-enforcement-files
 *
 * Lists all 시행령/시행규칙 .md files in data/parsed-laws directory
 * Returns files with download date (from file modification time)
 */

import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface EnforcementFile {
  fileName: string
  lawName: string
  type: '시행령' | '시행규칙'
  fileSize: number
  downloadedAt: string
}

export async function GET(request: NextRequest) {
  try {
    const parsedLawsDir = path.join(process.cwd(), 'data', 'parsed-laws')

    // Create directory if it doesn't exist
    if (!fs.existsSync(parsedLawsDir)) {
      fs.mkdirSync(parsedLawsDir, { recursive: true })
      return NextResponse.json({
        success: true,
        files: [],
        count: 0
      })
    }

    const files = fs.readdirSync(parsedLawsDir)
    const enforcementFiles: EnforcementFile[] = []

    for (const fileName of files) {
      if (!fileName.endsWith('.md')) continue

      // Check if it's 시행령 or 시행규칙
      const isDecree = fileName.includes('시행령')
      const isRule = fileName.includes('시행규칙')

      if (!isDecree && !isRule) continue

      const filePath = path.join(parsedLawsDir, fileName)
      const stats = fs.statSync(filePath)

      // Convert underscores back to spaces for lawName matching
      const lawName = fileName.replace('.md', '').replace(/_/g, ' ')

      enforcementFiles.push({
        fileName,
        lawName,
        type: isDecree ? '시행령' : '시행규칙',
        fileSize: stats.size,
        downloadedAt: stats.mtime.toISOString()
      })
    }

    // Sort by download date (newest first)
    enforcementFiles.sort((a, b) =>
      new Date(b.downloadedAt).getTime() - new Date(a.downloadedAt).getTime()
    )

    return NextResponse.json({
      success: true,
      files: enforcementFiles,
      count: enforcementFiles.length
    })
  } catch (error: any) {
    console.error('[List Enforcement Files API] ❌ Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || '시행령/시행규칙 목록 조회 중 오류가 발생했습니다'
      },
      { status: 500 }
    )
  }
}
