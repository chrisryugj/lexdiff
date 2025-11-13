/**
 * Recreate File Search Store
 * 1. Delete old store
 * 2. Create new store
 * 3. Update .env.local with new store ID
 */

import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { readFileSync, writeFileSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const OLD_STORE_ID = process.env.GEMINI_FILE_SEARCH_STORE_ID
const API_KEY = process.env.GEMINI_API_KEY

async function deleteStore(storeId: string): Promise<boolean> {
  console.log(`\n🗑️  Deleting old store: ${storeId}`)

  const url = `https://generativelanguage.googleapis.com/v1beta/${storeId}`

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'x-goog-api-key': API_KEY!
    }
  })

  if (!response.ok) {
    const error = await response.text()
    console.error(`❌ Delete failed (${response.status}): ${error}`)
    return false
  }

  console.log('✅ Old store deleted successfully')
  return true
}

async function createStore(): Promise<string | null> {
  console.log('\n📦 Creating new File Search Store...')

  const url = 'https://generativelanguage.googleapis.com/v1beta/fileSearchStores'

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': API_KEY!
    },
    body: JSON.stringify({
      displayName: 'Korean Laws & Ordinances Data'
    })
  })

  if (!response.ok) {
    const error = await response.text()
    console.error(`❌ Create failed (${response.status}): ${error}`)
    return null
  }

  const result = await response.json()
  const newStoreId = result.name

  console.log(`✅ New store created: ${newStoreId}`)
  return newStoreId
}

function updateEnvFile(newStoreId: string): void {
  console.log('\n📝 Updating .env.local...')

  const envPath = path.resolve(__dirname, '../.env.local')
  let envContent = readFileSync(envPath, 'utf-8')

  // Replace GEMINI_FILE_SEARCH_STORE_ID value
  envContent = envContent.replace(
    /^GEMINI_FILE_SEARCH_STORE_ID=.+$/m,
    `GEMINI_FILE_SEARCH_STORE_ID=${newStoreId}`
  )

  writeFileSync(envPath, envContent, 'utf-8')
  console.log('✅ .env.local updated')
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗')
  console.log('║         Recreate File Search Store                             ║')
  console.log('╚════════════════════════════════════════════════════════════════╝')

  if (!OLD_STORE_ID || !API_KEY) {
    console.error('\n❌ Missing environment variables:')
    if (!OLD_STORE_ID) console.error('  - GEMINI_FILE_SEARCH_STORE_ID')
    if (!API_KEY) console.error('  - GEMINI_API_KEY')
    process.exit(1)
  }

  // Step 1: Delete old store
  const deleted = await deleteStore(OLD_STORE_ID)
  if (!deleted) {
    console.log('\n⚠️  Warning: Could not delete old store, but continuing...')
  }

  // Wait 2 seconds
  console.log('\n⏳ Waiting 2 seconds...')
  await new Promise(resolve => setTimeout(resolve, 2000))

  // Step 2: Create new store
  const newStoreId = await createStore()
  if (!newStoreId) {
    console.error('\n❌ Failed to create new store')
    process.exit(1)
  }

  // Step 3: Update .env.local
  updateEnvFile(newStoreId)

  console.log('\n' + '═'.repeat(64))
  console.log('✅ SUCCESS')
  console.log('═'.repeat(64))
  console.log(`Old Store: ${OLD_STORE_ID}`)
  console.log(`New Store: ${newStoreId}`)
  console.log('\n📌 Next steps:')
  console.log('   1. Restart your dev server to pick up new .env.local')
  console.log('   2. Run: npm run file-search:upload-with-ids')
  console.log('═'.repeat(64))
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error)
  process.exit(1)
})
