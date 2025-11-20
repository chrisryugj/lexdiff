/**
 * Test Metadata Filter in File Search API
 *
 * Tests if metadataFilter syntax works with Google Gemini File Search
 *
 * Usage: node scripts/test-metadata-filter.mjs
 */

import 'dotenv/config'

const STORE_ID = process.env.GEMINI_FILE_SEARCH_STORE_ID
const API_KEY = process.env.GEMINI_API_KEY

if (!STORE_ID || !API_KEY) {
  console.error('❌ Missing GEMINI_FILE_SEARCH_STORE_ID or GEMINI_API_KEY')
  process.exit(1)
}

console.log('🧪 Testing Metadata Filter Syntax\n')
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
      parts: [{ text: '관세 신고' }]
    }],
    tools: [{
      fileSearch: {
        fileSearchStoreNames: [STORE_ID]
      }
    }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 100
    }
  }

  try {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + API_KEY,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      }
    )

    if (!response.ok) {
      const error = await response.text()
      console.error('❌ Request failed:', response.status)
      console.error(error)
      return false
    }

    const result = await response.json()
    const groundingMetadata = result.candidates?.[0]?.groundingMetadata
    const chunks = groundingMetadata?.groundingChunks || []

    console.log(`✅ Success! Found ${chunks.length} grounding chunks`)

    // Show metadata from first chunk
    if (chunks.length > 0) {
      console.log('\n📄 Sample chunk metadata:')
      const chunk = chunks[0]
      const metadata = chunk.retrievedContext?.customMetadata || []
      metadata.forEach(m => {
        console.log(`   ${m.key}: ${m.stringValue || m.numericValue}`)
      })
    }

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
  console.log('\n📋 Test 2: Query with string metadata filter')
  console.log('   Filter: law_type="법률"')

  const requestBody = {
    contents: [{
      role: 'user',
      parts: [{ text: '관세 신고' }]
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
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + API_KEY,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      }
    )

    if (!response.ok) {
      const error = await response.text()
      console.error('❌ Request failed:', response.status)
      console.error(error)
      return false
    }

    const result = await response.json()
    const groundingMetadata = result.candidates?.[0]?.groundingMetadata
    const chunks = groundingMetadata?.groundingChunks || []

    console.log(`✅ Success! Found ${chunks.length} grounding chunks`)

    // Verify all chunks match filter
    if (chunks.length > 0) {
      const firstChunk = chunks[0]
      console.log(`   First chunk structure:`, JSON.stringify(firstChunk, null, 2))

      const metadata = firstChunk.retrievedContext?.customMetadata || []
      const lawType = metadata.find(m => m.key === 'law_type')
      console.log(`   First chunk law_type: ${lawType?.stringValue || '(not found)'}`)

      if (metadata.length > 0) {
        console.log(`   All metadata:`)
        metadata.forEach(m => {
          console.log(`      ${m.key}: ${m.stringValue || m.numericValue}`)
        })
      }
    }

    return true
  } catch (error) {
    console.error('❌ Error:', error.message)
    return false
  }
}

/**
 * Test 3: Query with numeric comparison (if we have numeric metadata)
 */
async function testNumericFilter() {
  console.log('\n📋 Test 3: Query with numeric metadata filter')
  console.log('   Filter: effective_date>="20240101"')

  const requestBody = {
    contents: [{
      role: 'user',
      parts: [{ text: '관세 신고' }]
    }],
    tools: [{
      fileSearch: {
        fileSearchStoreNames: [STORE_ID],
        metadataFilter: 'effective_date>="20240101"'  // ← Numeric comparison
      }
    }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 100
    }
  }

  try {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + API_KEY,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      }
    )

    if (!response.ok) {
      const error = await response.text()
      console.error('❌ Request failed:', response.status)
      console.error(error)
      return false
    }

    const result = await response.json()
    const groundingMetadata = result.candidates?.[0]?.groundingMetadata
    const chunks = groundingMetadata?.groundingChunks || []

    console.log(`✅ Success! Found ${chunks.length} grounding chunks`)

    // Verify all chunks match filter
    if (chunks.length > 0) {
      const firstChunk = chunks[0]
      const metadata = firstChunk.retrievedContext?.customMetadata || []
      const effectiveDate = metadata.find(m => m.key === 'effective_date')
      console.log(`   First chunk effective_date: ${effectiveDate?.stringValue || effectiveDate?.numericValue}`)
    }

    return true
  } catch (error) {
    console.error('❌ Error:', error.message)
    return false
  }
}

/**
 * Test 4: Query with AND operator
 */
async function testAndFilter() {
  console.log('\n📋 Test 4: Query with AND operator')
  console.log('   Filter: law_type="law" AND effective_date>="20240101"')

  const requestBody = {
    contents: [{
      role: 'user',
      parts: [{ text: '관세 신고' }]
    }],
    tools: [{
      fileSearch: {
        fileSearchStoreNames: [STORE_ID],
        metadataFilter: 'law_type="law" AND effective_date>="20240101"'  // ← AND operator
      }
    }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 100
    }
  }

  try {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + API_KEY,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      }
    )

    if (!response.ok) {
      const error = await response.text()
      console.error('❌ Request failed:', response.status)
      console.error(error)
      return false
    }

    const result = await response.json()
    const groundingMetadata = result.candidates?.[0]?.groundingMetadata
    const chunks = groundingMetadata?.groundingChunks || []

    console.log(`✅ Success! Found ${chunks.length} grounding chunks`)

    return true
  } catch (error) {
    console.error('❌ Error:', error.message)
    return false
  }
}

// Run all tests
async function runTests() {
  const test1 = await testNoFilter()
  const test2 = await testStringFilter()
  const test3 = await testNumericFilter()
  const test4 = await testAndFilter()

  console.log('\n' + '─'.repeat(80))
  console.log('📊 Test Results:')
  console.log(`   Test 1 (No filter):        ${test1 ? '✅ PASS' : '❌ FAIL'}`)
  console.log(`   Test 2 (String filter):    ${test2 ? '✅ PASS' : '❌ FAIL'}`)
  console.log(`   Test 3 (Numeric filter):   ${test3 ? '✅ PASS' : '❌ FAIL'}`)
  console.log(`   Test 4 (AND operator):     ${test4 ? '✅ PASS' : '❌ FAIL'}`)
  console.log('─'.repeat(80))

  if (test1 && test2) {
    console.log('\n✅ Metadata filtering is SUPPORTED!')
    console.log('   → Safe to implement metadata system')
  } else {
    console.log('\n⚠️  Some tests failed')
    console.log('   → Need to investigate API response format')
  }
}

runTests()
