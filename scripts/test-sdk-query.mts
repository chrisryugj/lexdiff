/**
 * Test SDK query to diagnose File Search issue
 */

import { GoogleGenAI } from '@google/genai'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const STORE_ID = process.env.GEMINI_FILE_SEARCH_STORE_ID
const API_KEY = process.env.GEMINI_API_KEY

if (!STORE_ID || !API_KEY) {
  console.error('Missing required environment variables')
  process.exit(1)
}

console.log('🧪 Testing SDK File Search Query\n')
console.log('Store ID:', STORE_ID)
console.log('Query: "보세구역이 뭐야?"\n')

const genAI = new GoogleGenAI({ apiKey: API_KEY })

// Test 1: Minimal configuration (exactly as guide shows)
console.log('=== Test 1: Minimal Config ===\n')
try {
  const result = await genAI.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: '보세구역이 뭐야?',
    config: {
      tools: [{
        fileSearch: {
          fileSearchStoreNames: [STORE_ID]
        }
      }]
    }
  })

  console.log('✅ Query succeeded')
  console.log('\nAnswer:', result.text?.substring(0, 200) + '...')
  console.log('\nGrounding Metadata:')
  console.log('  Citations:', result.groundingMetadata?.citations?.length || 0)
  console.log('  Chunks:', result.groundingMetadata?.groundingChunks?.length || 0)

  if (result.groundingMetadata?.groundingChunks) {
    console.log('\n📚 Grounding Chunks:')
    result.groundingMetadata.groundingChunks.forEach((chunk: any, idx: number) => {
      console.log(`\n  ${idx + 1}. Score: ${chunk.relevanceScore || 'N/A'}`)
      console.log(`     Content: ${chunk.content?.substring(0, 100) || 'N/A'}...`)
    })
  }
} catch (error: any) {
  console.error('❌ Test 1 failed:', error.message)
}

// Test 2: With temperature and retrieval config
console.log('\n\n=== Test 2: With Temperature + RetrievalConfig ===\n')
try {
  const result = await genAI.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: '보세구역이 뭐야?',
    config: {
      tools: [{
        fileSearch: {
          fileSearchStoreNames: [STORE_ID],
          retrievalConfig: {
            mode: 'MODE_SPECIFIC',
            dynamicThreshold: 0.7
          }
        }
      }],
      temperature: 0.1,
      topP: 0.9,
      topK: 40
    }
  })

  console.log('✅ Query succeeded')
  console.log('\nAnswer:', result.text?.substring(0, 200) + '...')
  console.log('\nGrounding Metadata:')
  console.log('  Citations:', result.groundingMetadata?.citations?.length || 0)
  console.log('  Chunks:', result.groundingMetadata?.groundingChunks?.length || 0)
} catch (error: any) {
  console.error('❌ Test 2 failed:', error.message)
}

// Test 3: Without config wrapper (current implementation)
console.log('\n\n=== Test 3: Without Config Wrapper (Current) ===\n')
try {
  const result = await genAI.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: '보세구역이 뭐야?',
    tools: [{
      fileSearch: {
        fileSearchStoreNames: [STORE_ID],
        retrievalConfig: {
          mode: 'MODE_SPECIFIC',
          dynamicThreshold: 0.7
        }
      }
    }],
    temperature: 0.1,
    topP: 0.9,
    topK: 40
  } as any)

  console.log('✅ Query succeeded')
  console.log('\nAnswer:', result.text?.substring(0, 200) + '...')
  console.log('\nGrounding Metadata:')
  console.log('  Citations:', result.groundingMetadata?.citations?.length || 0)
  console.log('  Chunks:', result.groundingMetadata?.groundingChunks?.length || 0)
} catch (error: any) {
  console.error('❌ Test 3 failed:', error.message)
}

console.log('\n\n✅ All tests completed')
