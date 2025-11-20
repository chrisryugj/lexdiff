/**
 * Final metadata test with full response
 */

import { GoogleGenAI } from '@google/genai'

const STORE_ID = 'fileSearchStores/251120-jnt8dqxpea44'
const API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyDuBFaX2x3kYkGmWpnXobZqHmhKBCCQNvI'

console.log('🧪 Final Metadata Test\n')
console.log('Store ID:', STORE_ID)
console.log('Model: gemini-2.5-flash')
console.log('─'.repeat(80))

const genAI = new GoogleGenAI({ apiKey: API_KEY })

console.log('\n📋 Testing: No filter')
const result = await genAI.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: '도로법 제1조는 뭐야?',
  tools: [{
    fileSearch: {
      fileSearchStoreNames: [STORE_ID]
    }
  }]
})

console.log('\n✅ Response received!')
console.log('Text:', result.text?.substring(0, 200) + '...')
console.log('\nGrounding Metadata:')
console.log('  groundingChunks:', result.groundingMetadata?.groundingChunks?.length || 0)
console.log('  searchEntryPoint:', result.groundingMetadata?.searchEntryPoint)
console.log('  groundingSupports:', result.groundingMetadata?.groundingSupports?.length || 0)

if (result.groundingMetadata?.groundingChunks && result.groundingMetadata.groundingChunks.length > 0) {
  console.log('\n📄 First chunk:')
  const chunk = result.groundingMetadata.groundingChunks[0]
  console.log(JSON.stringify(chunk, null, 2).substring(0, 500))
}

console.log('\n─'.repeat(80))
console.log('\n📋 Testing: String filter (law_type="법률")')
const result2 = await genAI.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: '도로법 제1조는 뭐야?',
  tools: [{
    fileSearch: {
      fileSearchStoreNames: [STORE_ID],
      metadataFilter: 'law_type="법률"'
    }
  }]
})

console.log('✅ Response received!')
console.log('Chunks:', result2.groundingMetadata?.groundingChunks?.length || 0)

console.log('\n─'.repeat(80))
console.log('✅ Test complete!')
