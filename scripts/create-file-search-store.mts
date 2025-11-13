/**
 * One-time script to create Google File Search Store
 * Run this once to create the store, then save the store ID to .env.local
 */

import 'dotenv/config'
import { GoogleGenAI } from '@google/genai'

async function main() {
  console.log('🔧 Creating File Search Store...')

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY not found in .env.local')
    process.exit(1)
  }

  try {
    // Use REST API directly since SDK might not have create method yet
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/fileSearchStores', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        displayName: 'Korean Laws & Ordinances Database'
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`API error (${response.status}): ${error}`)
    }

    const store = await response.json()

    console.log('\n✅ File Search Store created successfully!')
    console.log('📋 Store ID:', store.name)
    console.log('\n⚙️  Next steps:')
    console.log('1. Add this to your .env.local file:')
    console.log(`   GEMINI_FILE_SEARCH_STORE_ID=${store.name}`)
    console.log('2. Run upload script to add laws:')
    console.log('   npm run file-search:upload')

  } catch (error) {
    console.error('❌ Error creating store:', error)
    process.exit(1)
  }
}

main()
