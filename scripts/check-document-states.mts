/**
 * Check if documents in File Search Store are properly indexed
 */

import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const STORE_ID = process.env.GEMINI_FILE_SEARCH_STORE_ID
const API_KEY = process.env.GEMINI_API_KEY

if (!STORE_ID || !API_KEY) {
  console.error('Missing environment variables')
  process.exit(1)
}

async function checkDocumentStates() {
  console.log('\n📋 Checking File Search Store document states...\n')
  console.log('Store ID:', STORE_ID)
  console.log()

  // Get store info
  const storeUrl = `https://generativelanguage.googleapis.com/v1beta/${STORE_ID}`
  const storeRes = await fetch(storeUrl, {
    headers: { 'x-goog-api-key': API_KEY }
  })

  if (!storeRes.ok) {
    const error = await storeRes.text()
    throw new Error(`Failed to get store: ${error}`)
  }

  const store = await storeRes.json()
  console.log('Store Info:')
  console.log('  Name:', store.displayName)
  console.log('  Created:', store.createTime)
  console.log()

  // List documents in the store
  const docsUrl = `https://generativelanguage.googleapis.com/v1beta/${STORE_ID}/documents`
  let allDocs: any[] = []
  let pageToken = ''

  do {
    const url = pageToken
      ? `${docsUrl}?pageToken=${pageToken}`
      : docsUrl

    const res = await fetch(url, {
      headers: { 'x-goog-api-key': API_KEY }
    })

    if (!res.ok) {
      const error = await res.text()
      throw new Error(`Failed to list documents: ${error}`)
    }

    const data = await res.json()
    allDocs = allDocs.concat(data.documents || [])
    pageToken = data.nextPageToken || ''
  } while (pageToken)

  console.log(`Found ${allDocs.length} documents\n`)
  console.log('='.repeat(100))

  // Group by state
  const byState = allDocs.reduce((acc, doc) => {
    const state = doc.state || 'UNKNOWN'
    if (!acc[state]) acc[state] = []
    acc[state].push(doc)
    return acc
  }, {} as Record<string, any[]>)

  for (const [state, docs] of Object.entries(byState)) {
    console.log(`\n${state}: ${docs.length} documents`)
    console.log('-'.repeat(100))

    docs.slice(0, 5).forEach((doc: any, idx: number) => {
      const metadata = doc.customMetadata || []
      const lawName = metadata.find((m: any) => m.key === 'law_name')?.stringValue || 'Unknown'

      console.log(`\n  ${idx + 1}. ${lawName}`)
      console.log(`     Document ID: ${doc.name}`)
      console.log(`     State: ${doc.state}`)
      console.log(`     Created: ${doc.createTime}`)
      console.log(`     Updated: ${doc.updateTime}`)

      if (doc.state !== 'ACTIVE') {
        console.log(`     ⚠️  NOT READY FOR SEARCH`)
      }
    })

    if (docs.length > 5) {
      console.log(`\n  ... and ${docs.length - 5} more`)
    }
  }

  console.log('\n' + '='.repeat(100))
  console.log('\n📊 Summary:')
  for (const [state, docs] of Object.entries(byState)) {
    const icon = state === 'ACTIVE' ? '✅' : state === 'PROCESSING' ? '⏳' : '❌'
    console.log(`  ${icon} ${state}: ${docs.length}`)
  }

  if (byState.ACTIVE) {
    console.log(`\n✅ ${byState.ACTIVE.length} documents are ACTIVE and ready for File Search`)
  } else {
    console.log('\n❌ NO ACTIVE DOCUMENTS - File Search will not work!')
  }

  if (byState.PROCESSING) {
    console.log(`\n⏳ ${byState.PROCESSING.length} documents still processing - wait for indexing to complete`)
  }

  if (byState.FAILED) {
    console.log(`\n❌ ${byState.FAILED.length} documents FAILED - these need to be re-uploaded`)
  }
}

checkDocumentStates().catch(console.error)
