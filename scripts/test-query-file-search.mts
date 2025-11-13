/**
 * Test querying the File Search Store
 */

import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const STORE_ID = process.env.GEMINI_FILE_SEARCH_STORE_ID
const API_KEY = process.env.GEMINI_API_KEY

async function queryFileSearch(query: string) {
  if (!STORE_ID || !API_KEY) {
    throw new Error('GEMINI_FILE_SEARCH_STORE_ID and GEMINI_API_KEY required')
  }

  console.log(`\n🔍 Querying: "${query}"\n`)

  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': API_KEY
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: query
        }]
      }],
      tools: [{
        file_search: {
          file_search_store_names: [STORE_ID]
        }
      }]
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Query failed (${response.status}): ${error}`)
  }

  const result = await response.json()

  // Extract answer
  const answer = result.candidates?.[0]?.content?.parts?.[0]?.text || 'No answer'

  // Extract citations (if available)
  const groundingMetadata = result.candidates?.[0]?.groundingMetadata
  const citations = groundingMetadata?.groundingChunks || []

  console.log('📝 Answer:')
  console.log(answer)

  if (citations.length > 0) {
    console.log(`\n📚 Citations (${citations.length}):`)
    citations.forEach((cite: any, idx: number) => {
      const source = cite.web?.uri || cite.retrievedContext?.uri || 'Unknown source'
      console.log(`${idx + 1}. ${source}`)
    })
  }

  return { answer, citations, groundingMetadata }
}

async function main() {
  console.log('🧪 Testing File Search queries...')

  try {
    // Test query 1: Simple information retrieval
    await queryFileSearch('관세법의 목적은 무엇인가요?')

    // Test query 2: Specific article
    await queryFileSearch('관세법 제38조는 무엇에 관한 내용인가요?')

    console.log('\n✅ All tests completed successfully!')

  } catch (error) {
    console.error('\n❌ Test failed:', error)
    process.exit(1)
  }
}

main()
