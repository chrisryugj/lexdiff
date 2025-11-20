/**
 * Test metadata filtering using Google Gen AI SDK
 */

import { GoogleGenAI } from '@google/genai'

const STORE_ID = 'fileSearchStores/251120-jnt8dqxpea44'
const API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyDuBFaX2x3kYkGmWpnXobZqHmhKBCCQNvI'

console.log('🧪 Testing Metadata Filters with SDK\n')
console.log('Store ID:', STORE_ID)
console.log('─'.repeat(80))

const genAI = new GoogleGenAI({ apiKey: API_KEY })

/**
 * Test 1: No filter
 */
console.log('\n📋 Test 1: No metadata filter')
try {
  const result1 = await genAI.models.generateContent({
    model: 'gemini-2.0-flash-exp',
    contents: '도로법에 대해 알려줘',
    tools: [{
      fileSearch: {
        fileSearchStoreNames: [STORE_ID]
      }
    }]
  })

  const chunks1 = result1.groundingMetadata?.groundingChunks || []
  console.log(`✅ Success! Found ${chunks1.length} chunks\n`)
} catch (error) {
  console.error('❌ Error:', error.message)
}

/**
 * Test 2: String filter
 */
console.log('📋 Test 2: String metadata filter (law_type="법률")')
try {
  const result2 = await genAI.models.generateContent({
    model: 'gemini-2.0-flash-exp',
    contents: '도로법에 대해 알려줘',
    tools: [{
      fileSearch: {
        fileSearchStoreNames: [STORE_ID],
        metadataFilter: 'law_type="법률"'
      }
    }]
  })

  const chunks2 = result2.groundingMetadata?.groundingChunks || []
  console.log(`✅ Success! Found ${chunks2.length} chunks\n`)
} catch (error) {
  console.error('❌ Error:', error.message)
}

/**
 * Test 3: Numeric filter
 */
console.log('📋 Test 3: Numeric metadata filter (effective_date>="20240101")')
try {
  const result3 = await genAI.models.generateContent({
    model: 'gemini-2.0-flash-exp',
    contents: '도로법에 대해 알려줘',
    tools: [{
      fileSearch: {
        fileSearchStoreNames: [STORE_ID],
        metadataFilter: 'effective_date>="20240101"'
      }
    }]
  })

  const chunks3 = result3.groundingMetadata?.groundingChunks || []
  console.log(`✅ Success! Found ${chunks3.length} chunks`)

  if (chunks3.length === 0) {
    console.log('⚠️  WARNING: Numeric filter returned 0 chunks!')
    console.log('   Expected: 1 chunk (도로법, effective_date: 20251001)')
  }
  console.log('')
} catch (error) {
  console.error('❌ Error:', error.message)
}

console.log('─'.repeat(80))
console.log('✅ Test complete!')
