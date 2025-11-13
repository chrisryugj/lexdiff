/**
 * List all files in File Search Store
 */

import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const STORE_ID = process.env.GEMINI_FILE_SEARCH_STORE_ID
const API_KEY = process.env.GEMINI_API_KEY

async function listFiles() {
  if (!STORE_ID || !API_KEY) {
    throw new Error('GEMINI_FILE_SEARCH_STORE_ID and GEMINI_API_KEY required')
  }

  console.log('📋 Listing files in File Search Store...\n')
  console.log(`Store ID: ${STORE_ID}\n`)

  let allDocuments: any[] = []
  let nextPageToken: string | undefined = undefined

  // Pagination loop
  do {
    const url = new URL(`https://generativelanguage.googleapis.com/v1beta/${STORE_ID}/documents`)
    url.searchParams.set('pageSize', '20') // Max page size (API limit)
    if (nextPageToken) {
      url.searchParams.set('pageToken', nextPageToken)
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'x-goog-api-key': API_KEY
      }
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`List failed (${response.status}): ${error}`)
    }

    const result = await response.json()
    const documents = result.documents || []
    allDocuments = allDocuments.concat(documents)

    nextPageToken = result.nextPageToken

    if (nextPageToken) {
      console.log(`Fetched ${documents.length} documents, fetching more...`)
    }
  } while (nextPageToken)

  const documents = allDocuments

  console.log(`Found ${documents.length} documents:\n`)
  console.log('═'.repeat(100))

  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i]
    const metadata = doc.customMetadata || []

    const lawId = metadata.find((m: any) => m.key === 'law_id')?.stringValue || 'N/A'
    const lawName = metadata.find((m: any) => m.key === 'law_name')?.stringValue || 'N/A'
    const lawType = metadata.find((m: any) => m.key === 'law_type')?.stringValue || 'N/A'
    const category = metadata.find((m: any) => m.key === 'category')?.stringValue || 'N/A'
    const state = doc.state || 'UNKNOWN'
    const stateIcon = state === 'ACTIVE' ? '✅' : state === 'PROCESSING' ? '⏳' : '❌'

    console.log(`${i + 1}. ${lawName}`)
    console.log(`   법령ID: ${lawId}`)
    console.log(`   카테고리: ${category}`)
    console.log(`   타입: ${lawType}`)
    console.log(`   상태: ${stateIcon} ${state}`)
    console.log(`   Document: ${doc.name}`)
    console.log('─'.repeat(100))
  }

  console.log('\n📊 Summary:')
  console.log(`Total documents: ${documents.length}`)

  // Group by state
  const byState: Record<string, number> = {}
  for (const doc of documents) {
    const state = doc.state || 'UNKNOWN'
    byState[state] = (byState[state] || 0) + 1
  }

  console.log('\nBy state:')
  for (const [state, count] of Object.entries(byState)) {
    const icon = state === 'ACTIVE' ? '✅' : state === 'PROCESSING' ? '⏳' : '❌'
    console.log(`  ${icon} ${state}: ${count}`)
  }

  // Group by category
  const byCategory: Record<string, number> = {}
  for (const doc of documents) {
    const metadata = doc.customMetadata || []
    const category = metadata.find((m: any) => m.key === 'category')?.stringValue || '기타'
    byCategory[category] = (byCategory[category] || 0) + 1
  }

  console.log('\nBy category:')
  for (const [category, count] of Object.entries(byCategory)) {
    console.log(`  ${category}: ${count}`)
  }
}

listFiles().catch((error) => {
  console.error('\n❌ Error:', error)
  process.exit(1)
})
