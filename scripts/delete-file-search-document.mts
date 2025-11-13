/**
 * Delete a specific document from File Search Store
 */

import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const STORE_ID = process.env.GEMINI_FILE_SEARCH_STORE_ID
const API_KEY = process.env.GEMINI_API_KEY

async function deleteDocument(documentPath: string) {
  if (!STORE_ID || !API_KEY) {
    throw new Error('GEMINI_FILE_SEARCH_STORE_ID and GEMINI_API_KEY required')
  }

  console.log(`🗑️  Deleting document: ${documentPath}\n`)

  const url = `https://generativelanguage.googleapis.com/v1beta/${documentPath}`

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'x-goog-api-key': API_KEY
    }
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Delete failed (${response.status}): ${error}`)
  }

  console.log('✅ Document deleted successfully')
}

const documentPath = process.argv[2]

if (!documentPath) {
  console.error('Usage: tsx delete-file-search-document.mts <document-path>')
  console.error('Example: tsx delete-file-search-document.mts fileSearchStores/.../documents/...')
  process.exit(1)
}

deleteDocument(documentPath).catch((error) => {
  console.error('\n❌ Error:', error)
  process.exit(1)
})
