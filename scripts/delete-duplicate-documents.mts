/**
 * Delete duplicate documents from File Search Store
 * Keeps first occurrence, deletes subsequent duplicates based on law_id
 */

import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const STORE_ID = process.env.GEMINI_FILE_SEARCH_STORE_ID
const API_KEY = process.env.GEMINI_API_KEY

interface Document {
  name: string
  customMetadata?: Array<{ key: string; stringValue?: string }>
}

async function fetchAllDocuments(): Promise<Document[]> {
  let allDocuments: Document[] = []
  let nextPageToken: string | undefined = undefined

  do {
    const url = new URL(`https://generativelanguage.googleapis.com/v1beta/${STORE_ID}/documents`)
    url.searchParams.set('pageSize', '20')
    if (nextPageToken) {
      url.searchParams.set('pageToken', nextPageToken)
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'x-goog-api-key': API_KEY!
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
  } while (nextPageToken)

  return allDocuments
}

async function listFilesInDocument(documentName: string): Promise<string[]> {
  const url = new URL(`https://generativelanguage.googleapis.com/v1beta/${documentName}/files`)

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'x-goog-api-key': API_KEY!
    }
  })

  if (!response.ok) {
    const error = await response.text()
    console.error(`  ❌ List files failed: ${error}`)
    return []
  }

  const result = await response.json()
  const files = result.files || []
  return files.map((f: any) => f.name)
}

async function deleteFile(fileName: string): Promise<boolean> {
  const url = `https://generativelanguage.googleapis.com/v1beta/${fileName}`

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'x-goog-api-key': API_KEY!
    }
  })

  return response.ok
}

async function deleteDocument(documentName: string): Promise<boolean> {
  // Step 1: List all files in document
  const fileNames = await listFilesInDocument(documentName)

  if (fileNames.length === 0) {
    console.error(`  ⚠️  No files found in document`)
  }

  // Step 2: Delete each file
  for (const fileName of fileNames) {
    const success = await deleteFile(fileName)
    if (!success) {
      console.error(`  ❌ Failed to delete file: ${fileName}`)
      return false
    }
  }

  // Step 3: Delete the document itself
  const url = `https://generativelanguage.googleapis.com/v1beta/${documentName}`

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'x-goog-api-key': API_KEY!
    }
  })

  if (!response.ok) {
    const error = await response.text()
    console.error(`  ❌ Delete document failed: ${error}`)
    return false
  }

  return true
}

async function deleteDuplicates() {
  if (!STORE_ID || !API_KEY) {
    throw new Error('GEMINI_FILE_SEARCH_STORE_ID and GEMINI_API_KEY required')
  }

  console.log('📋 Fetching all documents...\n')
  const documents = await fetchAllDocuments()
  console.log(`Found ${documents.length} documents\n`)

  // Track first occurrence of each law_id
  const seenLawIds = new Map<string, { name: string; docName: string }>()
  const duplicatesToDelete: Array<{ lawId: string; lawName: string; docName: string }> = []

  for (const doc of documents) {
    const metadata = doc.customMetadata || []
    const lawId = metadata.find((m) => m.key === 'law_id')?.stringValue
    const lawName = metadata.find((m) => m.key === 'law_name')?.stringValue || 'Unknown'

    if (!lawId) {
      console.log(`⚠️  Skipping document without law_id: ${doc.name}`)
      continue
    }

    if (seenLawIds.has(lawId)) {
      // Duplicate found
      const original = seenLawIds.get(lawId)!
      duplicatesToDelete.push({
        lawId,
        lawName,
        docName: doc.name
      })
    } else {
      // First occurrence
      seenLawIds.set(lawId, {
        name: lawName,
        docName: doc.name
      })
    }
  }

  console.log('═'.repeat(100))
  console.log(`Found ${duplicatesToDelete.length} duplicates to delete:\n`)

  for (let i = 0; i < duplicatesToDelete.length; i++) {
    const dup = duplicatesToDelete[i]
    console.log(`${i + 1}. ${dup.lawName} (ID: ${dup.lawId})`)
    console.log(`   Document: ${dup.docName}`)
  }

  console.log('\n' + '═'.repeat(100))
  console.log(`\n⚠️  About to delete ${duplicatesToDelete.length} duplicate documents.`)
  console.log('Starting deletion in 3 seconds...\n')

  // Wait 3 seconds
  await new Promise(resolve => setTimeout(resolve, 3000))

  let successCount = 0
  let failCount = 0

  for (let i = 0; i < duplicatesToDelete.length; i++) {
    const dup = duplicatesToDelete[i]
    console.log(`[${i + 1}/${duplicatesToDelete.length}] Deleting ${dup.lawName}...`)

    const success = await deleteDocument(dup.docName)
    if (success) {
      console.log(`  ✅ Deleted successfully`)
      successCount++
    } else {
      failCount++
    }

    // Small delay between deletes to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200))
  }

  console.log('\n' + '═'.repeat(100))
  console.log('📊 Summary:')
  console.log(`  Total duplicates: ${duplicatesToDelete.length}`)
  console.log(`  Successfully deleted: ${successCount}`)
  console.log(`  Failed: ${failCount}`)
  console.log(`  Remaining documents: ${documents.length - successCount}`)
}

deleteDuplicates().catch((error) => {
  console.error('\n❌ Error:', error)
  process.exit(1)
})
