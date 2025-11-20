/**
 * Check metadata of uploaded files in File Search Store
 *
 * Usage: node scripts/check-uploaded-file-metadata.mjs
 */

import 'dotenv/config'

const STORE_ID = process.env.GEMINI_FILE_SEARCH_STORE_ID
const API_KEY = process.env.GEMINI_API_KEY

if (!STORE_ID || !API_KEY) {
  console.error('❌ Missing GEMINI_FILE_SEARCH_STORE_ID or GEMINI_API_KEY')
  process.exit(1)
}

console.log('📚 Fetching documents from File Search Store...')
console.log('Store ID:', STORE_ID)
console.log('─'.repeat(80))

// List documents
const url = `https://generativelanguage.googleapis.com/v1beta/${STORE_ID}/documents?pageSize=20`

const response = await fetch(url, {
  headers: {
    'x-goog-api-key': API_KEY
  }
})

if (!response.ok) {
  const errorText = await response.text()
  console.error('❌ Request failed:', response.status)
  console.error(errorText)
  process.exit(1)
}

const data = await response.json()
const documents = data.documents || []

console.log(`\n✅ Found ${documents.length} documents\n`)

for (const doc of documents) {
  console.log('─'.repeat(80))
  console.log('📄 Document:', doc.name)
  console.log('   Display Name:', doc.displayName)
  console.log('   State:', doc.state)
  console.log('   Created:', doc.createTime)

  const metadata = doc.customMetadata || []

  if (metadata.length > 0) {
    console.log('\n   📋 Custom Metadata:')
    metadata.forEach(m => {
      const value = m.stringValue || m.numericValue || '(null)'
      console.log(`      ${m.key}: ${value}`)
    })
  } else {
    console.log('\n   ⚠️  No custom metadata')
  }

  console.log('')
}

console.log('─'.repeat(80))
console.log('\n💡 Check if your recently uploaded file has metadata')
