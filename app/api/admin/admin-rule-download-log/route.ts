/**
 * Admin Rule Download Log API
 * GET/POST /api/admin/admin-rule-download-log
 *
 * Manages download attempt logs for 행정규칙 (고시, 예규, 훈령 등)
 * Logs include: lawName, ruleName, result (success/not_found/error), timestamp
 */

import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface DownloadLogEntry {
  lawName: string
  ruleName: string
  result: 'success' | 'not_found' | 'error'
  timestamp: string
  articleCount?: number
  error?: string
}

interface DownloadLog {
  entries: DownloadLogEntry[]
  lastUpdated: string
}

const LOG_FILE_PATH = path.join(process.cwd(), 'data', 'admin-rule-download-log.json')

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

    // Group by lawName -> ruleName for easier lookup
    const byLaw = new Map<string, Map<string, DownloadLogEntry>>()

    for (const entry of log.entries) {
      if (!byLaw.has(entry.lawName)) {
        byLaw.set(entry.lawName, new Map())
      }
      const ruleMap = byLaw.get(entry.lawName)!
      // Keep the latest entry for each rule
      const existing = ruleMap.get(entry.ruleName)
      if (!existing || new Date(entry.timestamp) > new Date(existing.timestamp)) {
        ruleMap.set(entry.ruleName, entry)
      }
    }

    // Convert to object for JSON response
    const grouped: Record<string, Record<string, DownloadLogEntry>> = {}
    byLaw.forEach((ruleMap, lawName) => {
      grouped[lawName] = {}
      ruleMap.forEach((entry, ruleName) => {
        grouped[lawName][ruleName] = entry
      })
    })

    // Also collect all rules with not_found status for quick filtering
    const notFoundRules = new Set<string>()
    log.entries.forEach(entry => {
      if (entry.result === 'not_found') {
        notFoundRules.add(entry.ruleName)
      }
    })

    return NextResponse.json({
      success: true,
      log: grouped,
      notFoundRules: Array.from(notFoundRules),
      totalEntries: log.entries.length,
      lastUpdated: log.lastUpdated
    })
  } catch (error: any) {
    console.error('[Admin Rule Download Log API] GET Error:', error)
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
    const { lawName, ruleName, result, articleCount, error } = body

    if (!lawName || !ruleName || !result) {
      return NextResponse.json(
        { success: false, error: 'lawName, ruleName, result가 필요합니다' },
        { status: 400 }
      )
    }

    const log = ensureLogFileExists()

    const newEntry: DownloadLogEntry = {
      lawName,
      ruleName,
      result,
      timestamp: new Date().toISOString(),
      ...(articleCount && { articleCount }),
      ...(error && { error })
    }

    log.entries.push(newEntry)
    log.lastUpdated = new Date().toISOString()

    fs.writeFileSync(LOG_FILE_PATH, JSON.stringify(log, null, 2), 'utf-8')

    console.log(`[Admin Rule Download Log] Added: ${lawName} / ${ruleName} -> ${result}`)

    return NextResponse.json({
      success: true,
      entry: newEntry
    })
  } catch (error: any) {
    console.error('[Admin Rule Download Log API] POST Error:', error)
    return NextResponse.json(
      { success: false, error: error.message || '로그 저장 중 오류가 발생했습니다' },
      { status: 500 }
    )
  }
}
