/**
 * Test script to upload a single law to File Search Store
 * Uses REST API directly
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
  if (!lawIdMatch) {
    throw new Error(`Law not found: ${lawName}`)
  }

  const lawId = lawIdMatch[1]
  console.log(`Found law ID: ${lawId}`)

  // 2. Fetch law content
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

async function uploadToFileSearch(content: string, metadata: { law_id: string; law_name: string }) {
  if (!STORE_ID || !API_KEY) {
    throw new Error('GEMINI_FILE_SEARCH_STORE_ID and GEMINI_API_KEY required')
  }

  console.log(`\nUploading ${metadata.law_name} to File Search Store...`)
  console.log(`Content length: ${content.length} characters`)

  // Create a blob/file from the content
  const blob = new Blob([content], { type: 'text/plain; charset=utf-8' })
  const file = new File([blob], `${metadata.law_id}.txt`, { type: 'text/plain' })

  // Upload using Files API first
  const formData = new FormData()
  formData.append('file', file)

  const uploadResponse = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files`, {
    method: 'POST',
    headers: {
      'x-goog-api-key': API_KEY
    },
    body: formData
  })

  if (!uploadResponse.ok) {
    const error = await uploadResponse.text()
    throw new Error(`Upload failed (${uploadResponse.status}): ${error}`)
  }

  const uploadedFile = await uploadResponse.json()
  const fileName = uploadedFile.file?.name || uploadedFile.name
  console.log('✓ File uploaded:', fileName)

  if (!fileName) {
    throw new Error('File upload did not return a file name')
  }

  // Import file into File Search Store
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
        { key: 'law_type', stringValue: '법률' }
      ]
    })
  })

  if (!importResponse.ok) {
    const error = await importResponse.text()
    throw new Error(`Import failed (${importResponse.status}): ${error}`)
  }

  const importResult = await importResponse.json()
  console.log('✓ File imported to store:', importResult)

  return importResult
}

async function main() {
  console.log('🧪 Testing single law upload...\n')

  try {
    // Test with a simple law
    const lawName = '관세법'
    console.log(`Fetching ${lawName}...`)

    const { lawId, lawName: fetchedName, data } = await fetchLawData(lawName)
    console.log(`✓ Fetched ${fetchedName}`)

    const markdown = formatLawAsMarkdown({ ...data, lawId, lawName: fetchedName })
    console.log(`✓ Formatted as markdown (${markdown.length} chars)`)

    const result = await uploadToFileSearch(markdown, { law_id: lawId, law_name: fetchedName })

    console.log('\n✅ Test completed successfully!')
    console.log('You can now test queries against the File Search Store.')

  } catch (error) {
    console.error('\n❌ Test failed:', error)
    process.exit(1)
  }
}

main()
