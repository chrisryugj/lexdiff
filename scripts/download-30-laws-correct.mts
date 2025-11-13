#!/usr/bin/env node

/**
 * Download 30 Priority Laws (Using Working Admin Dashboard Code)
 *
 * Uses the EXACT same code from lib/law-parser-server.ts that works in Admin Dashboard
 */

import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { parseLawByNameOrId, fetchLawFromAPI, parseLawFromAPI } from '../lib/law-parser-server.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const API_KEY = process.env.LAW_OC
const OUTPUT_DIR = path.join(__dirname, 'downloaded-laws-correct')

if (!API_KEY) {
  console.error('❌ LAW_OC API 키가 설정되지 않았습니다')
  process.exit(1)
}

async function main() {
  console.log('📚 30개 우선 법령 다운로드 (Admin Dashboard 코드 사용)\n')

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }

  // Load law names
  const lawIdsPath = path.join(__dirname, 'law-ids-mapping.json')
  if (!fs.existsSync(lawIdsPath)) {
    console.error('❌ law-ids-mapping.json 파일이 없습니다')
    process.exit(1)
  }

  const lawIdsObject = JSON.parse(fs.readFileSync(lawIdsPath, 'utf-8'))
  const lawNames = Object.keys(lawIdsObject)

  console.log(`법령 개수: ${lawNames.length}개\n`)

  const results: Array<{ lawName: string; success: boolean; fileSize?: number; articleCount?: number; error?: string }> = []

  for (let i = 0; i < lawNames.length; i++) {
    const lawName = lawNames[i]
    console.log(`\n[${i + 1}/${lawNames.length}] ${lawName}`)

    try {
      // Use the SAME function that works in Admin Dashboard
      const result = await parseLawByNameOrId(lawName, API_KEY)

      if (!result.success) {
        console.log(`   ❌ 실패: ${result.error}`)

        if (result.candidates && result.candidates.length > 0) {
          console.log(`   후보: ${result.candidates.length}개`)
          // Use first candidate
          const firstCandidate = result.candidates[0]
          const lawId = firstCandidate.법령ID || firstCandidate.법령키

          console.log(`   재시도: ${firstCandidate.법령명한글} (ID: ${lawId})`)

          const lawData = await fetchLawFromAPI(lawId, API_KEY)
          const parsed = parseLawFromAPI(lawData)

          // Save to file
          const safeFileName = lawName.replace(/[/\\?%*:|"<>]/g, '-')
          const filePath = path.join(OUTPUT_DIR, `${safeFileName}.md`)
          fs.writeFileSync(filePath, parsed.markdown, 'utf-8')

          const fileSize = fs.statSync(filePath).size
          const fileSizeKB = (fileSize / 1024).toFixed(1)

          console.log(`   ✅ 저장 완료: ${fileSizeKB} KB (${parsed.metadata.articleCount}개 조문)`)

          results.push({
            lawName,
            success: true,
            fileSize,
            articleCount: parsed.metadata.articleCount
          })
        } else {
          results.push({ lawName, success: false, error: result.error })
        }
      } else {
        // Success!
        const parsed = result.law

        // Save to file
        const safeFileName = lawName.replace(/[/\\?%*:|"<>]/g, '-')
        const filePath = path.join(OUTPUT_DIR, `${safeFileName}.md`)
        fs.writeFileSync(filePath, parsed.markdown, 'utf-8')

        const fileSize = fs.statSync(filePath).size
        const fileSizeKB = (fileSize / 1024).toFixed(1)

        console.log(`   ✅ 저장 완료: ${fileSizeKB} KB (${parsed.metadata.articleCount}개 조문)`)
        console.log(`   📄 법령명: ${parsed.metadata.lawName}`)

        results.push({
          lawName,
          success: true,
          fileSize,
          articleCount: parsed.metadata.articleCount
        })
      }

      // Rate limiting
      if (i < lawNames.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 300))
      }
    } catch (error: any) {
      console.log(`   ❌ 오류: ${error.message}`)
      results.push({ lawName, success: false, error: error.message })
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

  console.log('\n' + '='.repeat(70))
  console.log('✅ 다운로드 완료!')
  console.log(`\n📂 다운로드한 파일 확인: ${OUTPUT_DIR}`)
  console.log('\n💡 다음 단계:')
  console.log('   1. 다운로드한 파일들을 열어서 내용 확인')
  console.log('   2. 확인 후 업로드 스크립트 실행')
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error)
  process.exit(1)
})
