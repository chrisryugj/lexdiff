/**
 * Check metadata of a specific uploaded file
 */

import 'dotenv/config'

const STORE_ID = process.env.GEMINI_FILE_SEARCH_STORE_ID
const API_KEY = process.env.GEMINI_API_KEY
const FILE_NAME = 'files/shgh9e0xlhw2'

if (!STORE_ID || !API_KEY) {
  console.error('❌ Missing GEMINI_FILE_SEARCH_STORE_ID or GEMINI_API_KEY')
  process.exit(1)
}

console.log('🔍 Finding document for file:', FILE_NAME)
console.log('─'.repeat(80))

// Fetch all documents and find the one with this file
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

  // Check if any document references this file
  const targetDoc = documents.find(doc => {
    const metadata = doc.customMetadata || []
    // Check if any metadata value contains the file name
    return doc.name?.includes(FILE_NAME.split('/')[1]) ||
           metadata.some(m => m.stringValue?.includes(FILE_NAME))
  })

  if (targetDoc) {
    console.log('✅ Found document!\n')
    console.log('📄 Document:', targetDoc.name)
    console.log('   Display Name:', targetDoc.displayName)
    console.log('   State:', targetDoc.state)
    console.log('   Created:', targetDoc.createTime)

    const metadata = targetDoc.customMetadata || []

    if (metadata.length > 0) {
      console.log('\n   ✅ Custom Metadata:')
      metadata.forEach(m => {
        const value = m.stringValue || m.numericValue || '(null)'
        console.log(`      ${m.key}: ${value}`)
      })
    } else {
      console.log('\n   ❌ No custom metadata')
    }
    process.exit(0)
  }

  allDocuments.push(...documents)
  pageToken = data.nextPageToken

  console.log(`   Searched ${allDocuments.length} documents...`)
} while (pageToken)

console.log('\n❌ Document not found')
console.log(`   Searched ${allDocuments.length} total documents`)
console.log('\n💡 The file may not have been imported yet')
