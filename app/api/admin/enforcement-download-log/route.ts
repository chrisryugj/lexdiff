/**
 * Enforcement Download Log API
 * GET/POST /api/admin/enforcement-download-log
 *
 * Manages download attempt logs for 시행령/시행규칙
 * Logs include: lawName, type, result (success/not_found/error), timestamp
 */

import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface DownloadLogEntry {
  lawName: string
  type: '시행령' | '시행규칙'
  result: 'success' | 'not_found' | 'error'
  timestamp: string
  articleCount?: number
  error?: string
}

interface DownloadLog {
  entries: DownloadLogEntry[]
  lastUpdated: string
}

const LOG_FILE_PATH = path.join(process.cwd(), 'data', 'enforcement-download-log.json')

function ensureLogFileExists(): DownloadLog {
  const dir = path.dirname(LOG_FILE_PATH)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  if (!fs.existsSync(LOG_FILE_PATH)) {
    const emptyLog: DownloadLog = {
      entries: [],
      lastUpdated: new Date().toISOString()
    }
    fs.writeFileSync(LOG_FILE_PATH, JSON.stringify(emptyLog, null, 2), 'utf-8')
    return emptyLog
  }

  try {
    const content = fs.readFileSync(LOG_FILE_PATH, 'utf-8')
    return JSON.parse(content)
  } catch {
    const emptyLog: DownloadLog = {
      entries: [],
      lastUpdated: new Date().toISOString()
    }
    fs.writeFileSync(LOG_FILE_PATH, JSON.stringify(emptyLog, null, 2), 'utf-8')
    return emptyLog
  }
}

/**
 * GET - Retrieve all download logs
 */
export async function GET(request: NextRequest) {
  try {
    const log = ensureLogFileExists()

    // Group by lawName for easier lookup
    const byLaw = new Map<string, { 시행령?: DownloadLogEntry; 시행규칙?: DownloadLogEntry }>()

    for (const entry of log.entries) {
      if (!byLaw.has(entry.lawName)) {
        byLaw.set(entry.lawName, {})
      }
      const lawLog = byLaw.get(entry.lawName)!
      // Keep the latest entry for each type
      if (!lawLog[entry.type] || new Date(entry.timestamp) > new Date(lawLog[entry.type]!.timestamp)) {
        lawLog[entry.type] = entry
      }
    }

    // Convert to object for JSON response
    const grouped: Record<string, { 시행령?: DownloadLogEntry; 시행규칙?: DownloadLogEntry }> = {}
    byLaw.forEach((value, key) => {
      grouped[key] = value
    })

    return NextResponse.json({
      success: true,
      log: grouped,
      totalEntries: log.entries.length,
      lastUpdated: log.lastUpdated
    })
  } catch (error: any) {
    console.error('[Enforcement Download Log API] GET Error:', error)
    return NextResponse.json(
      { success: false, error: error.message || '로그 조회 중 오류가 발생했습니다' },
      { status: 500 }
    )
  }
}

/**
 * POST - Add a new download log entry
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { lawName, type, result, articleCount, error } = body

    if (!lawName || !type || !result) {
      return NextResponse.json(
        { success: false, error: 'lawName, type, result가 필요합니다' },
        { status: 400 }
      )
    }

    const log = ensureLogFileExists()

    const newEntry: DownloadLogEntry = {
      lawName,
      type,
      result,
      timestamp: new Date().toISOString(),
      ...(articleCount && { articleCount }),
      ...(error && { error })
    }

    log.entries.push(newEntry)
    log.lastUpdated = new Date().toISOString()

    fs.writeFileSync(LOG_FILE_PATH, JSON.stringify(log, null, 2), 'utf-8')

    console.log(`[Enforcement Download Log] Added: ${lawName} ${type} -> ${result}`)

    return NextResponse.json({
      success: true,
      entry: newEntry
    })
  } catch (error: any) {
    console.error('[Enforcement Download Log API] POST Error:', error)
    return NextResponse.json(
      { success: false, error: error.message || '로그 저장 중 오류가 발생했습니다' },
      { status: 500 }
    )
  }
}
