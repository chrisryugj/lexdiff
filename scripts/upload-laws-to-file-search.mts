#!/usr/bin/env node
/**
 * Upload 30 Priority Laws to File Search Store
 * Uses REST API directly (no Next.js dependency)
 */

import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const STORE_ID = process.env.GEMINI_FILE_SEARCH_STORE_ID
const API_KEY = process.env.GEMINI_API_KEY
const LAW_OC = process.env.LAW_OC

// Priority laws (30개)
const PRIORITY_LAWS = [
  '관세법', '소득세법', '법인세법', '부가가치세법',
  '종합부동산세법', '상속세 및 증여세법', '국세기본법', '국세징수법',
  '조세특례제한법', '상법', '독점규제 및 공정거래에 관한 법률',
  '약관의 규제에 관한 법률', '할부거래에 관한 법률',
  '민법', '민사소송법', '민사집행법', '형법', '형사소송법',
  '근로기준법', '산업안전보건법', '고용보험법',
  '국민연금법', '국민건강보험법', '행정기본법', '행정절차법',
  '행정소송법', '주택법', '공인중개사법', '은행법',
  '자본시장과 금융투자업에 관한 법률',
]

const stats = {
  total: 0,
  success: 0,
  errors: 0,
  startTime: Date.now(),
}

async function fetchLawData(lawName: string) {
  // 1. Search for law
  const searchUrl = `https://www.law.go.kr/DRF/lawSearch.do?${new URLSearchParams({
    OC: LAW_OC || '',
    type: 'XML',
    target: 'law',
    query: lawName
  })}`

  const searchRes = await fetch(searchUrl)
  const searchXml = await searchRes.text()

  const lawIdMatch = searchXml.match(/<법령ID>(\d+)<\/법령ID>/)
  const lawTitleMatch = searchXml.match(/<법령명한글[^>]*>(?:<!\[CDATA\[)?([^\]<]+)(?:\]\]>)?<\/법령명한글>/)

  if (!lawIdMatch) {
    throw new Error(`Law not found: ${lawName}`)
  }

  const lawId = lawIdMatch[1]
  const lawTitle = lawTitleMatch?.[1] || lawName

  // 2. Fetch law content
  const contentUrl = `https://www.law.go.kr/DRF/lawService.do?${new URLSearchParams({
    target: 'eflaw',
    OC: LAW_OC || '',
    type: 'JSON',
    ID: lawId
  })}`

  const contentRes = await fetch(contentUrl)
  const data = await contentRes.json()

  return { lawId, lawName: lawTitle, data }
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
  markdown += `총 조문수: ${articles.length}\n\n---\n\n`

  for (const article of articles) {
    const jo = article.조문번호 || 'Unknown'
    const title = article.조문제목 || ''
    const content = typeof article.조문내용 === 'string'
      ? article.조문내용
      : Array.isArray(article.조문내용)
      ? article.조문내용.join('\n')
      : JSON.stringify(article.조문내용)

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

async function uploadLaw(lawName: string, index: number, total: number) {
  try {
    stats.total++
    console.log(`\n[${index + 1}/${total}] 🔍 ${lawName}`)

    const { lawId, lawName: fetchedName, data } = await fetchLawData(lawName)
    console.log(`  ✓ Found: ${fetchedName} (${lawId})`)

    const markdown = formatLawAsMarkdown({ ...data, lawId, lawName: fetchedName })
    const articleCount = data.법령?.조문?.조문단위
      ? (Array.isArray(data.법령.조문.조문단위) ? data.법령.조문.조문단위.length : 1)
      : 0

    console.log(`  ✓ Formatted: ${markdown.length} chars, ${articleCount} articles`)

    const category = getLawCategory(fetchedName)
    const result = await uploadToFileSearch(markdown, {
      law_id: lawId,
      law_name: fetchedName,
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
  console.log('╚════════════════════════════════════════════════════════════════╝\n')

  if (!STORE_ID || !API_KEY || !LAW_OC) {
    console.error('❌ Missing environment variables:')
    if (!STORE_ID) console.error('  - GEMINI_FILE_SEARCH_STORE_ID')
    if (!API_KEY) console.error('  - GEMINI_API_KEY')
    if (!LAW_OC) console.error('  - LAW_OC')
    process.exit(1)
  }

  console.log(`📋 Store ID: ${STORE_ID}`)
  console.log(`📊 Uploading ${PRIORITY_LAWS.length} laws\n`)

  for (let i = 0; i < PRIORITY_LAWS.length; i++) {
    await uploadLaw(PRIORITY_LAWS[i], i, PRIORITY_LAWS.length)

    // Rate limiting (2초 대기)
    if (i < PRIORITY_LAWS.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }

  const elapsed = (Date.now() - stats.startTime) / 1000

  console.log('\n' + '═'.repeat(64))
  console.log('📊 STATISTICS')
  console.log('═'.repeat(64))
  console.log(`Total:         ${stats.total}`)
  console.log(`Success:       ${stats.success}`)
  console.log(`Errors:        ${stats.errors}`)
  console.log(`Time:          ${elapsed.toFixed(1)}s`)
  console.log('═'.repeat(64) + '\n')

  if (stats.errors > 0) {
    console.log('⚠️  Some uploads failed. Check the logs above.')
  } else {
    console.log('✅ All uploads completed successfully!')
  }
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error)
  process.exit(1)
})
