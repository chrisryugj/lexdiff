#!/usr/bin/env node
/**
 * Real-time File Search Store Monitor
 * Continuously checks and displays upload progress
 */

import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const STORE_ID = process.env.GEMINI_FILE_SEARCH_STORE_ID
const API_KEY = process.env.GEMINI_API_KEY

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
}

async function listFiles() {
  if (!STORE_ID || !API_KEY) {
    console.error('❌ Missing environment variables')
    process.exit(1)
  }

  try {
    let allDocuments = []
    let nextPageToken = undefined

    // Pagination loop
    do {
      const url = new URL(`https://generativelanguage.googleapis.com/v1beta/${STORE_ID}/documents`)
      url.searchParams.set('pageSize', '20') // Max page size (API limit)
      if (nextPageToken) {
        url.searchParams.set('pageToken', nextPageToken)
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'x-goog-api-key': API_KEY }
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`API Error ${response.status}: ${errorText}`)
      }

      const result = await response.json()
      const documents = result.documents || []
      allDocuments = allDocuments.concat(documents)

      nextPageToken = result.nextPageToken
    } while (nextPageToken)

    return allDocuments
  } catch (error) {
    console.error(`${colors.red}Error:${colors.reset}`, error.message)
    return null
  }
}

function categorizeFiles(documents) {
  const stats = {
    laws: 0,
    ordinances: 0,
    byDistrict: {},
    total: 0,
    processing: 0,
    active: 0
  }

  for (const doc of documents) {
    stats.total++

    // Count by state
    if (doc.state === 'PROCESSING') stats.processing++
    else if (doc.state === 'ACTIVE') stats.active++

    // Extract metadata
    const metadata = {}
    if (doc.customMetadata) {
      for (const item of doc.customMetadata) {
        metadata[item.key] = item.stringValue || item.numericValue
      }
    }

    const lawType = metadata.law_type || metadata.type || 'unknown'
    const district = metadata.district_name || metadata.district

    if (lawType === '법률') {
      stats.laws++
    } else if (lawType === '조례' || lawType === '자치법규') {
      stats.ordinances++

      // Count by district
      if (district) {
        stats.byDistrict[district] = (stats.byDistrict[district] || 0) + 1
      }
    }
  }

  return stats
}

function formatNumber(num) {
  return num.toLocaleString('ko-KR')
}

function drawProgressBar(current, total, width = 40) {
  const percentage = (current / total) * 100
  const filled = Math.round((width * current) / total)
  const empty = width - filled

  const bar = '█'.repeat(filled) + '░'.repeat(empty)
  return `${colors.cyan}${bar}${colors.reset} ${percentage.toFixed(1)}%`
}

function clearScreen() {
  console.clear()
}

function displayStats(stats, startTime) {
  const elapsed = (Date.now() - startTime) / 1000
  const timestamp = new Date().toLocaleTimeString('ko-KR')

  clearScreen()

  console.log(`${colors.bright}${colors.blue}╔════════════════════════════════════════════════════════════════╗${colors.reset}`)
  console.log(`${colors.bright}${colors.blue}║${colors.reset}     📊 File Search Store 실시간 모니터링                    ${colors.bright}${colors.blue}║${colors.reset}`)
  console.log(`${colors.bright}${colors.blue}╚════════════════════════════════════════════════════════════════╝${colors.reset}`)
  console.log()

  console.log(`${colors.dim}마지막 업데이트: ${timestamp} (실행 시간: ${elapsed.toFixed(0)}초)${colors.reset}`)
  console.log()

  // Total files
  console.log(`${colors.bright}전체 파일:${colors.reset} ${colors.green}${formatNumber(stats.total)}개${colors.reset}`)

  // State
  if (stats.processing > 0 || stats.active > 0) {
    console.log(`${colors.dim}  ✅ ACTIVE: ${stats.active}개 · ⏳ PROCESSING: ${stats.processing}개${colors.reset}`)
  }
  console.log()

  // Laws
  console.log(`${colors.yellow}📖 법률:${colors.reset} ${formatNumber(stats.laws)}개`)
  console.log()

  // Ordinances
  console.log(`${colors.yellow}📜 조례:${colors.reset} ${formatNumber(stats.ordinances)}개`)

  if (stats.ordinances > 0) {
    const targetOrdinances = 15094
    console.log()
    console.log(`${colors.dim}업로드 진행률:${colors.reset}`)
    console.log(`  ${drawProgressBar(stats.ordinances, targetOrdinances, 50)}`)
    console.log(`  ${colors.dim}현재: ${formatNumber(stats.ordinances)}개 / 목표: ${formatNumber(targetOrdinances)}개${colors.reset}`)
    console.log(`  ${colors.dim}남은 파일: ${formatNumber(targetOrdinances - stats.ordinances)}개${colors.reset}`)

    // Show upload speed and ETA if available
    if (stats.uploadSpeed && stats.estimatedSeconds) {
      console.log(`  ${colors.dim}업로드 속도: ${stats.uploadSpeed.toFixed(1)}개/분${colors.reset}`)

      if (stats.estimatedSeconds < 3600) {
        const minutes = Math.round(stats.estimatedSeconds / 60)
        console.log(`  ${colors.green}예상 남은 시간: ${minutes}분${colors.reset}`)
      } else {
        const hours = Math.floor(stats.estimatedSeconds / 3600)
        const minutes = Math.round((stats.estimatedSeconds % 3600) / 60)
        console.log(`  ${colors.green}예상 남은 시간: ${hours}시간 ${minutes}분${colors.reset}`)
      }
    }
  }

  // Districts breakdown
  if (Object.keys(stats.byDistrict).length > 0) {
    console.log()
    console.log(`${colors.bright}자치구별 현황:${colors.reset}`)

    const sortedDistricts = Object.entries(stats.byDistrict)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)

    for (const [district, count] of sortedDistricts) {
      const bar = drawProgressBar(count, Math.max(...Object.values(stats.byDistrict)), 20)
      console.log(`  ${district.padEnd(20)} ${bar} (${formatNumber(count)}개)`)
    }

    if (Object.keys(stats.byDistrict).length > 10) {
      console.log(`  ${colors.dim}... 외 ${Object.keys(stats.byDistrict).length - 10}개 자치구${colors.reset}`)
    }
  }

  console.log()
  console.log(`${colors.dim}${'─'.repeat(64)}${colors.reset}`)
  console.log(`${colors.dim}Press Ctrl+C to stop${colors.reset}`)
}

async function monitor(interval = 3000) {
  const startTime = Date.now()
  let lastOrdinanceCount = 0
  let lastCheckTime = Date.now()

  console.log(`${colors.bright}${colors.green}✓${colors.reset} 모니터링 시작...`)
  console.log()

  async function update() {
    const documents = await listFiles()

    if (documents) {
      const stats = categorizeFiles(documents)

      // Calculate upload speed
      const now = Date.now()
      const timeDiff = (now - lastCheckTime) / 1000 // seconds
      const countDiff = stats.ordinances - lastOrdinanceCount

      if (stats.ordinances > 0 && countDiff > 0 && timeDiff > 0) {
        const uploadSpeed = countDiff / timeDiff // files per second
        const remainingFiles = 15094 - stats.ordinances
        const estimatedSeconds = remainingFiles / uploadSpeed

        // Add speed info to stats
        stats.uploadSpeed = uploadSpeed * 60 // files per minute
        stats.estimatedSeconds = estimatedSeconds
      }

      lastOrdinanceCount = stats.ordinances
      lastCheckTime = now

      displayStats(stats, startTime)
    }
  }

  // Initial update
  await update()

  // Set interval
  const intervalId = setInterval(update, interval)

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    clearInterval(intervalId)
    console.log()
    console.log(`${colors.green}✓${colors.reset} 모니터링 종료`)
    process.exit(0)
  })
}

// Parse command line arguments
const args = process.argv.slice(2)
const intervalArg = args.find(arg => arg.startsWith('--interval='))
const interval = intervalArg ? parseInt(intervalArg.split('=')[1]) * 1000 : 3000

console.log(`${colors.bright}${colors.blue}═══════════════════════════════════════════════════════════════════${colors.reset}`)
console.log(`${colors.bright}File Search Store Monitor${colors.reset}`)
console.log(`${colors.dim}업데이트 주기: ${interval / 1000}초${colors.reset}`)
console.log(`${colors.bright}${colors.blue}═══════════════════════════════════════════════════════════════════${colors.reset}`)
console.log()

monitor(interval).catch((error) => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error)
  process.exit(1)
})
