/**
 * Test File Search using direct REST API (bypassing SDK)
 */

import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const STORE_ID = process.env.GEMINI_FILE_SEARCH_STORE_ID
const API_KEY = process.env.GEMINI_API_KEY

if (!STORE_ID || !API_KEY) {
  console.error('Missing environment variables')
  process.exit(1)
}

console.log('\n🧪 Testing File Search with DIRECT REST API\n')
console.log('Store ID:', STORE_ID)
console.log()

const requestBody = {
  contents: [{
    parts: [{
      text: '관세법 제38조의 내용을 정확히 인용해줘'
    }]
  }],
  system_instruction: {
    parts: [{
      text: '반드시 업로드된 문서에서만 답변하세요. 문서에 없으면 "문서에서 찾을 수 없습니다"라고 하세요.'
    }]
  },
  tools: [{
    file_search: {
      file_search_store_names: [STORE_ID]
    }
  }],
  generation_config: {
    temperature: 0.1,
    top_p: 0.9,
    top_k: 40
  }
}

console.log('Request Body:')
console.log(JSON.stringify(requestBody, null, 2))
console.log()

try {
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
    const error = await response.text()
    console.error('❌ API Error:')
    console.error(error)
    process.exit(1)
  }

  const result = await response.json()

  console.log('='.repeat(100))
  console.log('✅ API Response received')
  console.log('='.repeat(100))
  console.log()

  const candidate = result.candidates?.[0]
  const text = candidate?.content?.parts?.[0]?.text || 'No text'
  const groundingMetadata = candidate?.groundingMetadata

  console.log('Answer (first 300 chars):')
  console.log(text.substring(0, 300))
  console.log()

  console.log('📊 Grounding Metadata:')
  console.log('  groundingChunks:', groundingMetadata?.groundingChunks?.length || 0)
  console.log('  groundingSupports:', groundingMetadata?.groundingSupports?.length || 0)
  console.log('  searchQueries:', groundingMetadata?.searchQueries?.length || 0)
  console.log()

  if (groundingMetadata?.groundingChunks?.length > 0) {
    console.log('✅ ✅ ✅ SUCCESS! File Search is WORKING! ✅ ✅ ✅')
    console.log()
    console.log('First Grounding Chunk:')
    const chunk = groundingMetadata.groundingChunks[0]
    console.log(JSON.stringify(chunk, null, 2))
  } else {
    console.log('❌ ❌ ❌ FAILED: Still no grounding chunks ❌ ❌ ❌')
    console.log()
    console.log('Full response:')
    console.log(JSON.stringify(result, null, 2))
  }

} catch (error: any) {
  console.error('❌ Error:', error.message)
  console.error(error)
}
