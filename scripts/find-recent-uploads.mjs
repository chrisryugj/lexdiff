/**
 * Find recently uploaded files (last 10 minutes)
 */

import 'dotenv/config'

const STORE_ID = process.env.GEMINI_FILE_SEARCH_STORE_ID
const API_KEY = process.env.GEMINI_API_KEY

const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)

console.log('🔍 Searching for files uploaded in the last 10 minutes...')
console.log('Cutoff time:', tenMinutesAgo.toISOString())
console.log('─'.repeat(80))

// Fetch all pages
let allDocuments = []
let pageToken = undefined

do {
  const url = `https://generativelanguage.googleapis.com/v1beta/${STORE_ID}/documents?pageSize=20${pageToken ? `&pageToken=${pageToken}` : ''}`

  const response = await fetch(url, {
    headers: { 'x-goog-api-key': API_KEY }
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('❌ Request failed:', response.status)
    console.error(errorText)
    process.exit(1)
  }

  const data = await response.json()
  const documents = data.documents || []
  allDocuments.push(...documents)

  pageToken = data.nextPageToken
  console.log(`   Fetched ${documents.length} documents (total: ${allDocuments.length})`)
} while (pageToken)

console.log(`\n✅ Total documents: ${allDocuments.length}`)

// Filter recent uploads
const recentDocs = allDocuments.filter(doc => {
  const createTime = new Date(doc.createTime)
  return createTime > tenMinutesAgo
})

console.log(`📋 Recent uploads (last 10 min): ${recentDocs.length}\n`)

if (recentDocs.length === 0) {
  console.log('⚠️  No recent uploads found')
  console.log('\n💡 Check if the upload actually succeeded')
  process.exit(0)
}

// Sort by creation time (newest first)
recentDocs.sort((a, b) => new Date(b.createTime) - new Date(a.createTime))

for (const doc of recentDocs) {
  console.log('─'.repeat(80))
  console.log('📄 Document:', doc.name)
  console.log('   Display Name:', doc.displayName)
  console.log('   Created:', doc.createTime, '(', Math.floor((Date.now() - new Date(doc.createTime)) / 1000), 'seconds ago )')
  console.log('   State:', doc.state)

  const metadata = doc.customMetadata || []
  if (metadata.length > 0) {
    console.log('\n   ✅ Custom Metadata:')
    metadata.forEach(m => {
      const value = m.stringValue || m.numericValue || '(null)'
      console.log(`      ${m.key}: ${value}`)
    })
  } else {
    console.log('\n   ❌ No custom metadata')
  }
  console.log('')
}
