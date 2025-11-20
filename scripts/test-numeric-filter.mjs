/**
 * Test NUMERIC metadata filtering
 */

const STORE_ID = 'fileSearchStores/251120-jnt8dqxpea44'
const API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyDuBFaX2x3kYkGmWpnXobZqHmhKBCCQNvI'

console.log('🧪 Testing Numeric Metadata Filter\n')
console.log('Store ID:', STORE_ID)
console.log('Uploaded file: 도로법 (effective_date: 20251001)')
console.log('─'.repeat(80))

/**
 * Test 1: effective_date >= "20240101" (should match)
 */
console.log('\n📋 Test 1: effective_date>="20240101" (SHOULD MATCH)')

const test1 = await fetch(
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
          metadataFilter: 'effective_date>="20240101"'
        }
      }],
      generationConfig: { temperature: 0, maxOutputTokens: 200 }
    })
  }
)

const result1 = await test1.json()
const chunks1 = result1.candidates?.[0]?.groundingMetadata?.groundingChunks?.length || 0
console.log(`Result: ${chunks1} chunks ${chunks1 > 0 ? '✅ PASS' : '❌ FAIL'}`)

/**
 * Test 2: effective_date >= "20260101" (should NOT match)
 */
console.log('\n📋 Test 2: effective_date>="20260101" (SHOULD NOT MATCH)')

const test2 = await fetch(
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
          metadataFilter: 'effective_date>="20260101"'
        }
      }],
      generationConfig: { temperature: 0, maxOutputTokens: 200 }
    })
  }
)

const result2 = await test2.json()
const chunks2 = result2.candidates?.[0]?.groundingMetadata?.groundingChunks?.length || 0
console.log(`Result: ${chunks2} chunks ${chunks2 === 0 ? '✅ PASS' : '❌ FAIL'}`)

/**
 * Test 3: Combined AND filter
 */
console.log('\n📋 Test 3: law_type="법률" AND effective_date>="20240101" (SHOULD MATCH)')

const test3 = await fetch(
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
          metadataFilter: 'law_type="법률" AND effective_date>="20240101"'
        }
      }],
      generationConfig: { temperature: 0, maxOutputTokens: 200 }
    })
  }
)

const result3 = await test3.json()
const chunks3 = result3.candidates?.[0]?.groundingMetadata?.groundingChunks?.length || 0
console.log(`Result: ${chunks3} chunks ${chunks3 > 0 ? '✅ PASS' : '❌ FAIL'}`)

console.log('\n─'.repeat(80))
console.log('📊 Summary:')
console.log(`  Test 1 (should match):     ${chunks1 > 0 ? '✅ PASS' : '❌ FAIL'}`)
console.log(`  Test 2 (should NOT match): ${chunks2 === 0 ? '✅ PASS' : '❌ FAIL'}`)
console.log(`  Test 3 (combined):         ${chunks3 > 0 ? '✅ PASS' : '❌ FAIL'}`)
console.log('─'.repeat(80))

if (chunks1 > 0 && chunks2 === 0 && chunks3 > 0) {
  console.log('\n✅ ALL TESTS PASSED!')
  console.log('   Numeric metadata filtering is FULLY FUNCTIONAL!')
} else {
  console.log('\n⚠️  SOME TESTS FAILED')
}
