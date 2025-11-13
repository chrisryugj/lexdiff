#!/usr/bin/env node

/**
 * Download 30 Priority Laws Script (Download Only)
 *
 * Downloads 30 priority laws and saves to files for verification
 * Does NOT upload to File Search Store
 */

import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const API_KEY = process.env.LAW_OC

if (!API_KEY) {
  console.error('❌ LAW_OC API 키가 설정되지 않았습니다')
  process.exit(1)
}

// Output directory
const OUTPUT_DIR = path.join(__dirname, 'downloaded-laws')

interface LawIdMapping {
  lawName: string
  lawId: string
}

/**
 * Fetch law content from law.go.kr API
 */
async function fetchLawContent(lawId: string, lawName: string): Promise<{ lawId: string; lawName: string; data: any }> {
  const contentUrl = `https://www.law.go.kr/DRF/lawService.do?OC=${API_KEY}&target=law&type=JSON&MST=${lawId}`

  console.log(`   API 호출: ${contentUrl.substring(0, 80)}...`)

  const contentRes = await fetch(contentUrl)
  const data = await contentRes.json()

  return { lawId, lawName, data }
}

/**
 * Extract content from 항 array (CORRECT parsing logic)
 * CRITICAL: This extracts actual content from 항/호/목 hierarchy
 */
function extractContentFromHangArray(hangArray: any[]): string {
  let content = ""

  if (!Array.isArray(hangArray)) {
    return content
  }

  for (const hang of hangArray) {
    // Extract 항내용 (paragraph content)
    if (hang.항내용) {
      let hangContent = hang.항내용

      // Handle array format
      if (Array.isArray(hangContent)) {
        hangContent = hangContent.join("\n")
      }

      content += "\n" + hangContent
    }

    // Extract 호 (items) if present
    if (hang.호 && Array.isArray(hang.호)) {
      for (const ho of hang.호) {
        if (ho.호내용) {
          let hoContent = ho.호내용

          // Handle array format
          if (Array.isArray(hoContent)) {
            hoContent = hoContent.join("\n")
          }

          content += "\n" + hoContent
        }

        // Extract 목 (sub-items) if present
        if (ho.목 && Array.isArray(ho.목)) {
          for (const mok of ho.목) {
            if (mok.목내용) {
              let mokContent = mok.목내용

              // Handle array format
              if (Array.isArray(mokContent)) {
                mokContent = mokContent.join("\n")
              }

              content += "\n  " + mokContent
            }
          }
        }
      }
    }
  }

  return content.trim()
}

function formatLawAsMarkdown(lawData: any): string {
  const law = lawData.법령
  const lawName = law.법령명_한글 || 'Unknown'

  let markdown = `# ${lawName}\n\n`
  markdown += `법령ID: ${lawData.lawId}\n\n`

  // Extract articles
  const rawArticles = law.조문?.조문단위
  if (!rawArticles) {
    throw new Error('No articles found')
  }

  const articles = Array.isArray(rawArticles) ? rawArticles : [rawArticles]

  // Filter only actual articles (조문여부 === "조문")
  const actualArticles = articles.filter((a: any) => a.조문여부 === '조문')

  markdown += `총 조문수: ${actualArticles.length}\n\n---\n\n`

  for (const article of actualArticles) {
    const jo = article.조문번호 || 'Unknown'
    const title = article.조문제목 || ''

    // CRITICAL FIX: Extract from 항 array, not 조문내용
    let content = ''

    if (article.항 && Array.isArray(article.항)) {
      // CORRECT: Use extractContentFromHangArray
      content = extractContentFromHangArray(article.항)
    } else if (article.조문내용 && typeof article.조문내용 === 'string') {
      // Fallback: use 조문내용 (usually only contains title)
      content = article.조문내용
    }

    markdown += `## 제${jo}조${title ? ` ${title}` : ''}\n\n${content}\n\n`
  }

  return markdown
}

async function main() {
  console.log('📚 30개 우선 법령 다운로드 (다운로드만, 업로드 안함)\n')

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }

  // Load law IDs
  const lawIdsPath = path.join(__dirname, 'law-ids-mapping.json')
  if (!fs.existsSync(lawIdsPath)) {
    console.error('❌ law-ids-mapping.json 파일이 없습니다')
    process.exit(1)
  }

  const lawIdsObject = JSON.parse(fs.readFileSync(lawIdsPath, 'utf-8'))

  // Convert object to array
  const lawIds: LawIdMapping[] = Object.entries(lawIdsObject).map(([lawName, lawId]) => ({
    lawName,
    lawId: lawId as string
  }))

  console.log(`법령 개수: ${lawIds.length}개\n`)

  const results: Array<{ lawName: string; success: boolean; fileSize?: number; error?: string }> = []

  for (let i = 0; i < lawIds.length; i++) {
    const { lawName, lawId } = lawIds[i]
    console.log(`\n[${i + 1}/${lawIds.length}] ${lawName}`)

    try {
      // Fetch law content
      const { data } = await fetchLawContent(lawId, lawName)

      // Format as markdown
      const markdown = formatLawAsMarkdown(data)

      // Save to file
      const safeFileName = lawName.replace(/[/\\?%*:|"<>]/g, '-')
      const filePath = path.join(OUTPUT_DIR, `${safeFileName}.md`)

      fs.writeFileSync(filePath, markdown, 'utf-8')

      const fileSize = fs.statSync(filePath).size
      const fileSizeKB = (fileSize / 1024).toFixed(1)

      console.log(`   ✅ 저장 완료: ${filePath}`)
      console.log(`   📦 파일 크기: ${fileSizeKB} KB`)

      results.push({ lawName, success: true, fileSize })

      // Rate limiting
      if (i < lawIds.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
    } catch (error: any) {
      console.log(`   ❌ 실패: ${error.message}`)
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

    console.log('파일 크기 목록 (제목만 있으면 ~10KB 이하, 전체 내용이면 50KB+):')
    console.log('-'.repeat(70))

    for (const result of successResults) {
      const sizeKB = ((result.fileSize || 0) / 1024).toFixed(1)
      const status = (result.fileSize || 0) > 10000 ? '✅ 전체 내용' : '⚠️  제목만?'
      console.log(`${status} ${sizeKB.padStart(8)} KB | ${result.lawName}`)
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
  console.log('   1. 다운로드한 파일들을 열어서 내용이 제대로 있는지 확인')
  console.log('   2. 확인 후 업로드 스크립트 실행: node scripts/upload-laws-with-ids.mts')
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error)
  process.exit(1)
})
