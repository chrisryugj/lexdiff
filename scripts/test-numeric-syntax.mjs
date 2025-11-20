/**
 * Test different numeric filter syntaxes
 */

const STORE_ID = 'fileSearchStores/251120-jnt8dqxpea44'
const API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyDuBFaX2x3kYkGmWpnXobZqHmhKBCCQNvI'

console.log('🧪 Testing Numeric Filter Syntax Variations\n')
console.log('Store ID:', STORE_ID)
console.log('Document has: effective_date: 20251000 (number)')
console.log('─'.repeat(80))

const tests = [
  { name: 'Quoted number', filter: 'effective_date>="20240101"' },
  { name: 'Unquoted number', filter: 'effective_date>=20240101' },
  { name: 'Less than (quoted)', filter: 'effective_date<="20260101"' },
  { name: 'Less than (unquoted)', filter: 'effective_date<=20260101' },
  { name: 'Equals (quoted)', filter: 'effective_date="20251000"' },
  { name: 'Equals (unquoted)', filter: 'effective_date=20251000' },
]

for (const test of tests) {
  console.log(`\n📋 Test: ${test.name}`)
  console.log(`   Filter: ${test.filter}`)

  try {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': API_KEY
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: '도로법 제1조' }] }],
          tools: [{
            fileSearch: {
              fileSearchStoreNames: [STORE_ID],
              metadataFilter: test.filter
            }
          }],
          generationConfig: { temperature: 0, maxOutputTokens: 200 }
        })
      }
    )

    if (!response.ok) {
      const error = await response.text()
      console.log(`   ❌ API Error: ${response.status}`)
      console.log(`   ${error.substring(0, 200)}`)
      continue
    }

    const result = await response.json()
    const chunks = result.candidates?.[0]?.groundingMetadata?.groundingChunks?.length || 0
    console.log(`   Result: ${chunks} chunks ${chunks > 0 ? '✅' : '❌'}`)

  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`)
  }
}

console.log('\n─'.repeat(80))
console.log('✅ Test complete!')
