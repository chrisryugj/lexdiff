/**
 * Test metadata filtering using REST API (like file-search-client.ts)
 */

const STORE_ID = 'fileSearchStores/251120-jnt8dqxpea44'
const API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyDuBFaX2x3kYkGmWpnXobZqHmhKBCCQNvI'

console.log('🧪 Testing with REST API\n')
console.log('Store ID:', STORE_ID)
console.log('─'.repeat(80))

/**
 * Test: String metadata filter
 */
console.log('\n📋 Test: law_type="법률" filter')

const requestBody = {
  contents: [{
    role: 'user',
    parts: [{ text: '도로법 제1조는 뭐야?' }]
  }],
  tools: [{
    fileSearch: {
      fileSearchStoreNames: [STORE_ID],
      metadataFilter: 'law_type="법률"'
    }
  }],
  generationConfig: {
    temperature: 0,
    maxOutputTokens: 500
  }
}

console.log('Request body:', JSON.stringify(requestBody, null, 2))

const response = await fetch(
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': API_KEY
    },
    body: JSON.stringify(requestBody)
  }
)

if (!response.ok) {
  const errorText = await response.text()
  console.error('❌ Request failed:', response.status)
  console.error(errorText)
  process.exit(1)
}

const result = await response.json()

console.log('\n✅ Response received!')
console.log('Text:', result.candidates?.[0]?.content?.parts?.[0]?.text?.substring(0, 200) + '...')
console.log('\nGrounding Metadata:')
const gm = result.candidates?.[0]?.groundingMetadata
console.log('  groundingChunks:', gm?.groundingChunks?.length || 0)
console.log('  searchEntryPoint:', gm?.searchEntryPoint || '(none)')

if (gm?.groundingChunks && gm.groundingChunks.length > 0) {
  console.log('\n📄 First chunk sample:')
  console.log(JSON.stringify(gm.groundingChunks[0], null, 2).substring(0, 500))
}

console.log('\n─'.repeat(80))
console.log('✅ Test complete!')
