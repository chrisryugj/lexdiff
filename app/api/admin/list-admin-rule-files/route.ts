/**
 * List Admin Rule Files API
 * GET /api/admin/list-admin-rule-files
 *
 * Lists all행정규칙 .md files in data/parsed-admin-rules directory
 * Returns files with download date (from file modification time)
 */

import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface AdminRuleFile {
  fileName: string
  ruleName: string
  lawName: string
  fileSize: number
  downloadedAt: string
}

export async function GET(request: NextRequest) {
  try {
    const parsedAdminRulesDir = path.join(process.cwd(), 'data', 'parsed-admin-rules')

    // Create directory if it doesn't exist
    if (!fs.existsSync(parsedAdminRulesDir)) {
      fs.mkdirSync(parsedAdminRulesDir, { recursive: true })
      return NextResponse.json({
        success: true,
        files: [],
        count: 0,
        lawFolders: []
      })
    }

    // Read law folders
    const items = fs.readdirSync(parsedAdminRulesDir, { withFileTypes: true })
    const lawFolders = items
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name)

    const adminRuleFiles: AdminRuleFile[] = []

    // Read files from each law folder
    for (const lawName of lawFolders) {
      const lawDir = path.join(parsedAdminRulesDir, lawName)
      const files = fs.readdirSync(lawDir).filter((f) => f.endsWith('.md'))

      for (const fileName of files) {
        const filePath = path.join(lawDir, fileName)
        const stats = fs.statSync(filePath)

        const ruleName = fileName.replace(/\.md$/, '')

        adminRuleFiles.push({
          fileName,
          ruleName,
          lawName,
          fileSize: stats.size,
          downloadedAt: stats.mtime.toISOString()
        })
      }
    }

    // Sort by download date (newest first)
    adminRuleFiles.sort((a, b) =>
      new Date(b.downloadedAt).getTime() - new Date(a.downloadedAt).getTime()
    )

    return NextResponse.json({
      success: true,
      files: adminRuleFiles,
      count: adminRuleFiles.length,
      lawFolders
    })
  } catch (error: any) {
    console.error('[List Admin Rule Files API] ❌ Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || '행정규칙 목록 조회 중 오류가 발생했습니다'
      },
      { status: 500 }
    )
  }
}
