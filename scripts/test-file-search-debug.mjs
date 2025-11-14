/**
 * File Search 디버깅 스크립트
 *
 * Store 상태, 문서 목록, 검색 기능을 단계별로 테스트합니다.
 */

import 'dotenv/config'

const STORE_ID = process.env.GEMINI_FILE_SEARCH_STORE_ID
const API_KEY = process.env.GEMINI_API_KEY

if (!STORE_ID || !API_KEY) {
  console.error('❌ GEMINI_FILE_SEARCH_STORE_ID 또는 GEMINI_API_KEY가 설정되지 않았습니다')
  process.exit(1)
}

console.log('🔍 File Search 디버깅 시작\n')
console.log(`Store ID: ${STORE_ID}\n`)

// ===== Step 1: Store 정보 확인 =====
console.log('📊 [Step 1] Store 정보 확인...')
const storeUrl = `https://generativelanguage.googleapis.com/v1beta/${STORE_ID}`
const storeResponse = await fetch(storeUrl, {
  headers: { 'x-goog-api-key': API_KEY }
})

if (!storeResponse.ok) {
  console.error('❌ Store 정보 조회 실패:', await storeResponse.text())
  process.exit(1)
}

const storeData = await storeResponse.json()
console.log('✅ Store 정보:')
console.log(`   - Display Name: ${storeData.displayName}`)
console.log(`   - Create Time: ${storeData.createTime}`)
console.log(`   - Chunking Config:`, storeData.chunkingConfig)
console.log('')

// ===== Step 2: 문서 목록 확인 =====
console.log('📄 [Step 2] 문서 목록 확인...')
const docsUrl = `https://generativelanguage.googleapis.com/v1beta/${STORE_ID}/documents?pageSize=10`
const docsResponse = await fetch(docsUrl, {
  headers: { 'x-goog-api-key': API_KEY }
})

if (!docsResponse.ok) {
  console.error('❌ 문서 목록 조회 실패:', await docsResponse.text())
  process.exit(1)
}

const docsData = await docsResponse.json()
const documents = docsData.documents || []

console.log(`✅ 문서 수: ${documents.length}`)
documents.forEach((doc, idx) => {
  const lawName = doc.customMetadata?.find(m => m.key === 'law_name')?.stringValue || 'Unknown'
  console.log(`   ${idx + 1}. ${lawName}`)
  console.log(`      - Display Name: ${doc.displayName}`)
  console.log(`      - ID: ${doc.name}`)
  console.log(`      - State: ${doc.state}`)
  console.log(`      - Metadata:`, doc.customMetadata)
})
console.log('')

// ===== Step 3: 간단한 검색 테스트 =====
console.log('🔍 [Step 3] 검색 테스트...')

const testQueries = [
  '관세법',
  '관세법 38조',
  '수출통관',
  '관세'
]

for (const query of testQueries) {
  console.log(`\n검색어: "${query}"`)

  const searchUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'
  const searchBody = {
    contents: [{
      parts: [{ text: query }],
      role: 'user'
    }],
    tools: [{
      file_search: {  // ✅ 올바른 필드명 (snake_case)
        file_search_store_names: [STORE_ID],  // snake_case
        top_k: 5
      }
    }]
  }

  const searchResponse = await fetch(searchUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': API_KEY
    },
    body: JSON.stringify(searchBody)
  })

  if (!searchResponse.ok) {
    console.error(`   ❌ 검색 실패:`, await searchResponse.text())
    continue
  }

  const searchData = await searchResponse.json()
  const candidate = searchData.candidates?.[0]
  const groundingMetadata = candidate?.groundingMetadata

  if (!groundingMetadata) {
    console.log('   ❌ Grounding metadata 없음')
    continue
  }

  const chunks = groundingMetadata.groundingChunks || []
  console.log(`   ✅ 찾은 청크: ${chunks.length}개`)

  if (chunks.length > 0) {
    console.log(`   첫 번째 청크:`)
    console.log(`      - URI: ${chunks[0].retrievedContext?.uri}`)
    console.log(`      - 텍스트 (100자):`, chunks[0].retrievedContext?.text?.substring(0, 100))
  }
}

console.log('\n✅ 디버깅 완료')
