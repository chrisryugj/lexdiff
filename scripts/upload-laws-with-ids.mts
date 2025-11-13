#!/usr/bin/env node
/**
 * Upload 30 Priority Laws to File Search Store
 * Uses exact law IDs from mapping file
 */

import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const STORE_ID = process.env.GEMINI_FILE_SEARCH_STORE_ID
const API_KEY = process.env.GEMINI_API_KEY
const LAW_OC = process.env.LAW_OC

// Load law IDs mapping
const lawIdsMapping: Record<string, string> = JSON.parse(
  readFileSync(path.resolve(__dirname, 'law-ids-mapping.json'), 'utf-8')
)

const stats = {
  total: 0,
  success: 0,
  errors: 0,
  skipped: 0,
  startTime: Date.now(),
}

async function fetchLawDataById(lawId: string, lawName: string) {
  // Fetch law content directly by ID
  const contentUrl = `https://www.law.go.kr/DRF/lawService.do?${new URLSearchParams({
    target: 'eflaw',
    OC: LAW_OC || '',
    type: 'JSON',
    ID: lawId
  })}`

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
  const actualArticles = articles.filter(a => a.조문여부 === '조문')

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

function getLawCategory(lawName: string): string {
  if (/세법|관세|소득세|법인세|부가가치|종합부동산|상속세|증여세|국세/.test(lawName)) return '세법'
  if (/상법|공정거래|약관|할부/.test(lawName)) return '상법'
  if (/민법|민사/.test(lawName)) return '민법'
  if (/형법|형사/.test(lawName)) return '형법'
  if (/근로|산업안전|고용/.test(lawName)) return '노동법'
  if (/국민연금|국민건강/.test(lawName)) return '사회복지'
  if (/행정/.test(lawName)) return '행정법'
  if (/주택|공인중개/.test(lawName)) return '부동산'
  if (/은행|자본시장/.test(lawName)) return '금융'
  return '기타'
}

async function uploadToFileSearch(content: string, metadata: { law_id: string; law_name: string; category: string }) {
  if (!STORE_ID || !API_KEY) {
    throw new Error('GEMINI_FILE_SEARCH_STORE_ID and GEMINI_API_KEY required')
  }

  // 1. Upload file
  const blob = new Blob([content], { type: 'text/plain; charset=utf-8' })
  const file = new File([blob], `${metadata.law_id}.txt`, { type: 'text/plain' })

  const formData = new FormData()
  formData.append('file', file)

  const uploadResponse = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files`, {
    method: 'POST',
    headers: { 'x-goog-api-key': API_KEY },
    body: formData
  })

  if (!uploadResponse.ok) {
    const error = await uploadResponse.text()
    throw new Error(`Upload failed (${uploadResponse.status}): ${error}`)
  }

  const uploadedFile = await uploadResponse.json()
  const fileName = uploadedFile.file?.name || uploadedFile.name

  if (!fileName) {
    throw new Error('File upload did not return a file name')
  }

  // 2. Import to File Search Store
  const importUrl = `https://generativelanguage.googleapis.com/v1beta/${STORE_ID}:importFile`

  const importResponse = await fetch(importUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': API_KEY
    },
    body: JSON.stringify({
      fileName: fileName,
      customMetadata: [
        { key: 'law_id', stringValue: metadata.law_id },
        { key: 'law_name', stringValue: metadata.law_name },
        { key: 'law_type', stringValue: '법률' },
        { key: 'category', stringValue: metadata.category }
      ]
    })
  })

  if (!importResponse.ok) {
    const error = await importResponse.text()
    throw new Error(`Import failed (${importResponse.status}): ${error}`)
  }

  return await importResponse.json()
}

async function uploadLaw(lawName: string, lawId: string, index: number, total: number) {
  try {
    stats.total++
    console.log(`\n[${index + 1}/${total}] 🔍 ${lawName} (ID: ${lawId})`)

    const { lawName: fetchedName, data } = await fetchLawDataById(lawId, lawName)
    const actualLawName = data.법령?.법령명_한글 || fetchedName
    console.log(`  ✓ Found: ${actualLawName}`)

    // Verify this is the correct law
    if (!actualLawName.includes(lawName.substring(0, 3))) {
      console.log(`  ⚠️  Warning: Law name mismatch (expected: ${lawName}, got: ${actualLawName})`)
      console.log(`  ⏭️  Skipping...`)
      stats.skipped++
      return
    }

    const markdown = formatLawAsMarkdown({ ...data, lawId, lawName: actualLawName })
    const articleCount = data.법령?.조문?.조문단위
      ? (Array.isArray(data.법령.조문.조문단위) ? data.법령.조문.조문단위.length : 1)
      : 0

    console.log(`  ✓ Formatted: ${markdown.length} chars, ${articleCount} articles`)

    const category = getLawCategory(actualLawName)
    await uploadToFileSearch(markdown, {
      law_id: lawId,
      law_name: actualLawName,
      category
    })

    stats.success++
    console.log(`  ✅ Uploaded successfully (${category})`)

  } catch (error) {
    console.error(`  ❌ Failed:`, error instanceof Error ? error.message : error)
    stats.errors++
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗')
  console.log('║       Upload 30 Priority Laws to File Search Store            ║')
  console.log('║              (Using exact law IDs)                             ║')
  console.log('╚════════════════════════════════════════════════════════════════╝\n')

  if (!STORE_ID || !API_KEY || !LAW_OC) {
    console.error('❌ Missing environment variables:')
    if (!STORE_ID) console.error('  - GEMINI_FILE_SEARCH_STORE_ID')
    if (!API_KEY) console.error('  - GEMINI_API_KEY')
    if (!LAW_OC) console.error('  - LAW_OC')
    process.exit(1)
  }

  console.log(`📋 Store ID: ${STORE_ID}`)
  console.log(`📊 Uploading ${Object.keys(lawIdsMapping).length} laws\n`)

  const lawEntries = Object.entries(lawIdsMapping)

  for (let i = 0; i < lawEntries.length; i++) {
    const [lawName, lawId] = lawEntries[i]
    await uploadLaw(lawName, lawId, i, lawEntries.length)

    // Rate limiting (2초 대기)
    if (i < lawEntries.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }

  const elapsed = (Date.now() - stats.startTime) / 1000

  console.log('\n' + '═'.repeat(64))
  console.log('📊 STATISTICS')
  console.log('═'.repeat(64))
  console.log(`Total:         ${stats.total}`)
  console.log(`Success:       ${stats.success}`)
  console.log(`Skipped:       ${stats.skipped}`)
  console.log(`Errors:        ${stats.errors}`)
  console.log(`Time:          ${elapsed.toFixed(1)}s`)
  console.log('═'.repeat(64) + '\n')

  if (stats.errors > 0) {
    console.log('⚠️  Some uploads failed. Check the logs above.')
  } else if (stats.skipped > 0) {
    console.log(`⚠️  ${stats.skipped} laws skipped due to name mismatch.`)
  } else {
    console.log('✅ All uploads completed successfully!')
  }
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error)
  process.exit(1)
})
