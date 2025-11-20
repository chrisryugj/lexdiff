/**
 * Final comprehensive metadata filter test
 */

const STORE_ID = 'fileSearchStores/251120-jnt8dqxpea44'
const API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyDuBFaX2x3kYkGmWpnXobZqHmhKBCCQNvI'

console.log('🎉 Final Metadata Filter Test\n')
console.log('Store ID:', STORE_ID)
console.log('─'.repeat(80))

const tests = [
  {
    name: 'String filter (law_type)',
    filter: 'law_type="법률"',
    shouldMatch: true
  },
  {
    name: 'Numeric filter (>=)',
    filter: 'effective_date>=20240101',
    shouldMatch: true
  },
  {
    name: 'Numeric filter (> boundary)',
    filter: 'effective_date>20260101',
    shouldMatch: false
  },
  {
    name: 'Combined AND filter',
    filter: 'law_type="법률" AND effective_date>=20240101',
    shouldMatch: true
  },
  {
    name: 'Combined AND filter (no match)',
    filter: 'law_type="시행령" AND effective_date>=20240101',
    shouldMatch: false
  }
]

let passed = 0
let failed = 0

for (const test of tests) {
  console.log(`\n📋 Test: ${test.name}`)
  console.log(`   Filter: ${test.filter}`)
  console.log(`   Expected: ${test.shouldMatch ? 'MATCH' : 'NO MATCH'}`)

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

    const result = await response.json()
    const chunks = result.candidates?.[0]?.groundingMetadata?.groundingChunks?.length || 0
    const matched = chunks > 0

    if (matched === test.shouldMatch) {
      console.log(`   ✅ PASS (${chunks} chunks)`)
      passed++
    } else {
      console.log(`   ❌ FAIL (got ${chunks} chunks, expected ${test.shouldMatch ? '>0' : '0'})`)
      failed++
    }

  } catch (error) {
    console.log(`   ❌ ERROR: ${error.message}`)
    failed++
  }
}

console.log('\n' + '─'.repeat(80))
console.log('📊 Final Results:')
console.log(`   Passed: ${passed}/${tests.length}`)
console.log(`   Failed: ${failed}/${tests.length}`)
console.log('─'.repeat(80))

if (failed === 0) {
  console.log('\n🎉 ALL TESTS PASSED!')
  console.log('✅ Metadata filtering is FULLY FUNCTIONAL!')
  console.log('\n💡 Key findings:')
  console.log('   - String values: Use quotes (law_type="법률")')
  console.log('   - Numeric values: NO quotes (effective_date>=20240101)')
  console.log('   - Numeric values must be stored as numericValue, not stringValue')
} else {
  console.log('\n⚠️  Some tests failed')
}
