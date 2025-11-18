/**
 * List Parsed Ordinances API
 * GET /api/admin/list-parsed-ordinances
 *
 * Lists all .md files in data/parsed-ordinances directory (with folder structure)
 * Returns files grouped by district
 */

import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface ParsedOrdinanceFile {
  fileName: string
  filePath: string
  ordinanceName: string
  districtName: string
  fileSize: number
  lastModified: string
}

export async function GET(request: NextRequest) {
  try {
    const parsedOrdinancesDir = path.join(process.cwd(), 'data', 'parsed-ordinances')

    // Create directory if it doesn't exist
    if (!fs.existsSync(parsedOrdinancesDir)) {
      fs.mkdirSync(parsedOrdinancesDir, { recursive: true })
      return NextResponse.json({
        success: true,
        ordinances: [],
        count: 0,
        districts: []
      })
    }

    // Read all items in parsed-ordinances directory
    const items = fs.readdirSync(parsedOrdinancesDir, { withFileTypes: true })

    const districtFolders = items
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name)

    const ordinances: ParsedOrdinanceFile[] = []

    // 1. Read root-level .md files (no district)
    const rootFiles = items
      .filter((dirent) => dirent.isFile() && dirent.name.endsWith('.md'))
      .map((dirent) => dirent.name)

    for (const fileName of rootFiles) {
      const filePath = path.join(parsedOrdinancesDir, fileName)
      const stats = fs.statSync(filePath)

      // Extract ordinance name from filename (remove .md extension)
      const ordinanceName = fileName.replace(/\.md$/, '')

      // Extract district name from filename pattern: 서울특별시_{구이름}_{조례명}
      let districtName = '(루트)'
      const match = ordinanceName.match(/^서울특별시_?([^_]+구|교육청)/)
      if (match) {
        const extracted = match[1]
        // Normalize district name
        if (extracted.includes('교육청')) {
          districtName = '서울특별시' // 교육청은 서울시 조례
        } else if (extracted.endsWith('구')) {
          districtName = extracted // e.g., "관악구"
        } else {
          districtName = '서울특별시'
        }
      }

      ordinances.push({
        fileName,
        filePath: path.relative(process.cwd(), filePath),
        ordinanceName,
        districtName, // Extracted from filename or '(루트)'
        fileSize: stats.size,
        lastModified: stats.mtime.toISOString()
      })
    }

    // 2. Read files from each district folder
    for (const districtName of districtFolders) {
      const districtDir = path.join(parsedOrdinancesDir, districtName)
      const files = fs.readdirSync(districtDir).filter((f) => f.endsWith('.md'))

      for (const fileName of files) {
        const filePath = path.join(districtDir, fileName)
        const stats = fs.statSync(filePath)

        // Extract ordinance name from filename (remove .md extension)
        const ordinanceName = fileName.replace(/\.md$/, '')

        ordinances.push({
          fileName,
          filePath: path.relative(process.cwd(), filePath),
          ordinanceName,
          districtName,
          fileSize: stats.size,
          lastModified: stats.mtime.toISOString()
        })
      }
    }

    // Sort by last modified (newest first)
    ordinances.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())

    return NextResponse.json({
      success: true,
      ordinances,
      count: ordinances.length,
      districts: districtFolders
    })
  } catch (error: any) {
    console.error('[List Parsed Ordinances API] ❌ Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || '조례 목록 조회 중 오류가 발생했습니다'
      },
      { status: 500 }
    )
  }
}
