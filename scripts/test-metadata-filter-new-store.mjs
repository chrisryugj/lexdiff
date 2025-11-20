/**
 * Test Metadata Filter Syntax (NEW STORE)
 */

const STORE_ID = 'fileSearchStores/251120-jnt8dqxpea44'
const API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyDuBFaX2x3kYkGmWpnXobZqHmhKBCCQNvI'
const MODEL = 'gemini-2.0-flash-exp'

console.log('🧪 Testing Metadata Filter Syntax (NEW STORE)\n')
console.log('Store ID:', STORE_ID)
console.log('─'.repeat(80))

/**
 * Test 1: Query WITHOUT metadata filter (baseline)
 */
async function testNoFilter() {
  console.log('\n📋 Test 1: Query without metadata filter')

  const requestBody = {
    contents: [{
      role: 'user',
      parts: [{ text: '도로 점용료' }]
    }],
    tools: [{
      googleSearch: {}
    }],
    cachedContent: {
      toolConfig: {
        fileSearch: {
          fileSearchStoreNames: [STORE_ID]
        }
      }
    },
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 100
    }
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
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
      return false
    }

    const result = await response.json()
    const groundingMetadata = result.candidates?.[0]?.groundingMetadata
    const chunks = groundingMetadata?.groundingChunks || []

    console.log(`✅ Success! Found ${chunks.length} grounding chunks\n`)

    return true
  } catch (error) {
    console.error('❌ Error:', error.message)
    return false
  }
}

/**
 * Test 2: Query WITH string metadata filter (법률)
 */
async function testStringFilter() {
  console.log('📋 Test 2: Query with string metadata filter')
  console.log('   Filter: law_type="법률"')

  const requestBody = {
    contents: [{
      role: 'user',
      parts: [{ text: '도로 점용료' }]
    }],
    tools: [{
      fileSearch: {
        fileSearchStoreNames: [STORE_ID],
        metadataFilter: 'law_type="법률"'  // ← String filter test (Korean)
      }
    }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 100
    }
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
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
      return false
    }

    const result = await response.json()
    const groundingMetadata = result.candidates?.[0]?.groundingMetadata
    const chunks = groundingMetadata?.groundingChunks || []

    console.log(`✅ Success! Found ${chunks.length} grounding chunks\n`)

    return true
  } catch (error) {
    console.error('❌ Error:', error.message)
    return false
  }
}

/**
 * Test 3: Query WITH numeric metadata filter
 */
async function testNumericFilter() {
  console.log('📋 Test 3: Query with numeric metadata filter')
  console.log('   Filter: effective_date>="20240101"')

  const requestBody = {
    contents: [{
      role: 'user',
      parts: [{ text: '도로 점용료' }]
    }],
    tools: [{
      fileSearch: {
        fileSearchStoreNames: [STORE_ID],
        metadataFilter: 'effective_date>="20240101"'  // ← Numeric filter test
      }
    }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 100
    }
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
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
      return false
    }

    const result = await response.json()
    const groundingMetadata = result.candidates?.[0]?.groundingMetadata
    const chunks = groundingMetadata?.groundingChunks || []

    console.log(`✅ Success! Found ${chunks.length} grounding chunks\n`)

    if (chunks.length === 0) {
      console.log('⚠️  WARNING: Numeric filter returned 0 chunks')
      console.log('   Expected: 1 chunk (도로법, effective_date: 20251001)')
      console.log('   This means numeric filtering may NOT work!\n')
      return false
    }

    return true
  } catch (error) {
    console.error('❌ Error:', error.message)
    return false
  }
}

/**
 * Test 4: Query WITH AND operator
 */
async function testAndOperator() {
  console.log('📋 Test 4: Query with AND operator')
  console.log('   Filter: law_type="법률" AND effective_date>="20240101"')

  const requestBody = {
    contents: [{
      role: 'user',
      parts: [{ text: '도로 점용료' }]
    }],
    tools: [{
      fileSearch: {
        fileSearchStoreNames: [STORE_ID],
        metadataFilter: 'law_type="법률" AND effective_date>="20240101"'
      }
    }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 100
    }
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
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
      return false
    }

    const result = await response.json()
    const groundingMetadata = result.candidates?.[0]?.groundingMetadata
    const chunks = groundingMetadata?.groundingChunks || []

    console.log(`✅ Success! Found ${chunks.length} grounding chunks\n`)

    return true
  } catch (error) {
    console.error('❌ Error:', error.message)
    return false
  }
}

// Run all tests
const test1 = await testNoFilter()
const test2 = await testStringFilter()
const test3 = await testNumericFilter()
const test4 = await testAndOperator()

console.log('─'.repeat(80))
console.log('📊 Test Results:')
console.log(`   Test 1 (No filter):        ${test1 ? '✅ PASS' : '❌ FAIL'}`)
console.log(`   Test 2 (String filter):    ${test2 ? '✅ PASS' : '❌ FAIL'}`)
console.log(`   Test 3 (Numeric filter):   ${test3 ? '✅ PASS' : '❌ FAIL'}`)
console.log(`   Test 4 (AND operator):     ${test4 ? '✅ PASS' : '❌ FAIL'}`)
console.log('─'.repeat(80))

if (test1 && test2 && test3 && test4) {
  console.log('\n✅ ALL TESTS PASSED!')
  console.log('   → Metadata filtering is fully functional')
} else {
  console.log('\n⚠️  SOME TESTS FAILED')
  console.log('   → Review failed tests above')
}
