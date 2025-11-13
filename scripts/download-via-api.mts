#!/usr/bin/env node

/**
 * Download 30 Laws via Admin API Endpoint
 *
 * Uses the WORKING Admin Dashboard API endpoints
 */

import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const OUTPUT_DIR = path.join(__dirname, 'downloaded-laws-via-api')
const API_BASE = 'http://localhost:3000'

async function downloadLaw(lawName: string): Promise<{ success: boolean; markdown?: string; metadata?: any; error?: string }> {
  try {
    // Call Admin Dashboard parse law API
    const response = await fetch(`${API_BASE}/api/admin/parse-law`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: lawName })
    })

    const data = await response.json()

    if (!data.success) {
      return { success: false, error: data.error }
    }

    return {
      success: true,
      markdown: data.law.markdown,
      metadata: {
        lawName: data.law.lawName,
        lawId: data.law.lawId,
        articleCount: data.law.articleCount,
        effectiveDate: data.law.effectiveDate
      }
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

async function main() {
  console.log('📚 30개 우선 법령 다운로드 (Admin API 사용)\n')

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }

  // Load law names
  const lawIdsPath = path.join(__dirname, 'law-ids-mapping.json')
  const lawIdsObject = JSON.parse(fs.readFileSync(lawIdsPath, 'utf-8'))
  const lawNames = Object.keys(lawIdsObject)

  console.log(`법령 개수: ${lawNames.length}개\n`)

  const results: any[] = []

  for (let i = 0; i < lawNames.length; i++) {
    const lawName = lawNames[i]
    console.log(`\n[${i + 1}/${lawNames.length}] ${lawName}`)

    const result = await downloadLaw(lawName)

    if (!result.success) {
      console.log(`   ❌ 실패: ${result.error}`)
      results.push({ lawName, success: false, error: result.error })
      continue
    }

    // Save to file
    const safeFileName = lawName.replace(/[/\?%*:|"<>]/g, '-')
    const filePath = path.join(OUTPUT_DIR, `${safeFileName}.md`)
    fs.writeFileSync(filePath, result.markdown!, 'utf-8')

    const fileSize = fs.statSync(filePath).size
    const fileSizeKB = (fileSize / 1024).toFixed(1)

    console.log(`   ✅ 저장: ${fileSizeKB} KB (${result.metadata!.articleCount}개 조문)`)

    results.push({
      lawName,
      success: true,
      fileSize,
      articleCount: result.metadata!.articleCount
    })

    // Rate limiting
    if (i < lawNames.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
  }

  // Summary
  console.log('\n' + '='.repeat(70))
  console.log('📊 다운로드 완료 요약')
  console.log('='.repeat(70))

  const successResults = results.filter((r) => r.success)
  const failResults = results.filter((r) => !r.success)

  console.log(`\n✅ 성공: ${successResults.length}개`)
  console.log(`❌ 실패: ${failResults.length}개`)

  if (successResults.length > 0) {
    console.log(`\n📂 저장 위치: ${OUTPUT_DIR}\n`)
    console.log('파일 정보:')
    console.log('-'.repeat(70))

    for (const result of successResults) {
      const sizeKB = ((result.fileSize || 0) / 1024).toFixed(1)
      console.log(
        `${sizeKB.padStart(8)} KB | ${String(result.articleCount || 0).padStart(3)} 조문 | ${result.lawName}`
      )
    }
  }

  if (failResults.length > 0) {
    console.log('\n❌ 실패한 법령:')
    for (const result of failResults) {
      console.log(`   - ${result.lawName}: ${result.error}`)
    }
  }

  console.log('\n✅ 완료!')
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error)
  process.exit(1)
})
