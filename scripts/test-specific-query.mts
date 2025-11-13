/**
 * Test with very specific queries that MUST match uploaded documents
 */

import { GoogleGenAI } from '@google/genai'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const STORE_ID = process.env.GEMINI_FILE_SEARCH_STORE_ID
const API_KEY = process.env.GEMINI_API_KEY

if (!STORE_ID || !API_KEY) {
  console.error('Missing required environment variables')
  process.exit(1)
}

const genAI = new GoogleGenAI({ apiKey: API_KEY })

const queries = [
  '관세법 제38조의 내용을 전문 그대로 알려줘',
  '관세법 제1조 목적 조문을 정확히 인용해줘',
  '민법 제1조는 무엇인가?',
  '형법 제1조의 내용은?'
]

for (const query of queries) {
  console.log('\n' + '='.repeat(80))
  console.log('Query:', query)
  console.log('='.repeat(80) + '\n')

  try {
    const result = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: query,
      systemInstruction: '반드시 업로드된 문서에서만 답변하세요. 문서에 없으면 "문서에서 찾을 수 없습니다"라고 하세요. 조문을 정확히 인용하세요.',
      tools: [{
        fileSearch: {
          fileSearchStoreNames: [STORE_ID]
        }
      }],
      temperature: 0.1
    })

    console.log('Answer:', result.text?.substring(0, 300))
    console.log('\n📊 Grounding Metadata:')
    console.log('  Citations:', result.groundingMetadata?.citations?.length || 0)
    console.log('  Chunks:', result.groundingMetadata?.groundingChunks?.length || 0)
    console.log('  Supports:', result.groundingMetadata?.groundingSupports?.length || 0)

    if (result.groundingMetadata?.groundingChunks?.length > 0) {
      console.log('\n✅ SUCCESS: File Search found documents!')
      console.log('\nFirst chunk:')
      const chunk = result.groundingMetadata.groundingChunks[0]
      console.log('  Relevance:', chunk.relevanceScore)
      console.log('  Content:', chunk.content?.substring(0, 200))
    } else {
      console.log('\n❌ FAILED: No grounding - NOT using uploaded documents')
    }

    await new Promise(resolve => setTimeout(resolve, 2000)) // Rate limiting
  } catch (error: any) {
    console.error('❌ Error:', error.message)
  }
}

console.log('\n\n' + '='.repeat(80))
console.log('All tests completed')
console.log('='.repeat(80))
