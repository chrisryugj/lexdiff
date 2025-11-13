#!/usr/bin/env node
/**
 * Download uploaded law document from File Search Store
 */

import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { writeFileSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const STORE_ID = process.env.GEMINI_FILE_SEARCH_STORE_ID
const API_KEY = process.env.GEMINI_API_KEY

console.log('\n📥 Downloading uploaded law documents from File Search Store\n')
console.log('Store ID:', STORE_ID)
console.log()

// List documents in store
const listUrl = `https://generativelanguage.googleapis.com/v1beta/${STORE_ID}/documents?pageSize=20`

const listRes = await fetch(listUrl, {
  headers: { 'x-goog-api-key': API_KEY }
})

if (!listRes.ok) {
  console.error('❌ Failed to list documents:', await listRes.text())
  process.exit(1)
}

const listData = await listRes.json()
const documents = listData.documents || []

console.log(`Found ${documents.length} documents\n`)
console.log('='.repeat(100))

// Find 관세법 document
const gwanseLaw = documents.find(doc => {
  const metadata = doc.customMetadata || []
  const lawName = metadata.find((m) => m.key === 'law_name')?.stringValue || ''
  return lawName.includes('관세법')
})

if (!gwanseLaw) {
  console.log('❌ 관세법 document not found')
  console.log('\nAvailable documents:')
  documents.forEach((doc, idx) => {
    const metadata = doc.customMetadata || []
    const lawName = metadata.find((m) => m.key === 'law_name')?.stringValue || 'Unknown'
    console.log(`  ${idx + 1}. ${lawName} (${doc.name})`)
  })
  process.exit(1)
}

console.log('\n✅ Found 관세법 document:')
console.log('  Name:', gwanseLaw.name)
console.log('  Display Name:', gwanseLaw.displayName)
console.log('  State:', gwanseLaw.state)
console.log('  Created:', gwanseLaw.createTime)
console.log()

// Get file URI
const fileUri = gwanseLaw.fileUri

if (!fileUri) {
  console.log('❌ No fileUri in document')
  console.log('Document data:', JSON.stringify(gwanseLaw, null, 2))
  process.exit(1)
}

console.log('File URI:', fileUri)
console.log()

// Try to fetch file content
// Note: File API might require different authentication
const fileId = fileUri.split('/').pop()
const fileUrl = `https://generativelanguage.googleapis.com/v1beta/files/${fileId}`

console.log('Attempting to fetch file content...')
console.log('File URL:', fileUrl)
console.log()

const fileRes = await fetch(fileUrl, {
  headers: { 'x-goog-api-key': API_KEY }
})

if (!fileRes.ok) {
  console.log('❌ Failed to fetch file:', await fileRes.text())
  process.exit(1)
}

const fileData = await fileRes.json()

console.log('File metadata:')
console.log(JSON.stringify(fileData, null, 2))
console.log()

// Check if we can download content
if (fileData.uri) {
  console.log('\n📄 Attempting to download content from:', fileData.uri)

  // Note: This might not work directly - File Search files might not be directly downloadable
  const contentRes = await fetch(fileData.uri)

  if (contentRes.ok) {
    const content = await contentRes.text()

    console.log(`\n✅ Downloaded ${content.length} chars`)
    console.log('\nFirst 1000 chars:')
    console.log('='.repeat(100))
    console.log(content.substring(0, 1000))
    console.log('='.repeat(100))

    // Save to file
    const outputPath = path.resolve(__dirname, '../downloaded-gwanse-law.txt')
    writeFileSync(outputPath, content, 'utf-8')
    console.log(`\n✅ Saved to: ${outputPath}`)
  } else {
    console.log('❌ Failed to download content:', contentRes.status, contentRes.statusText)
  }
}
