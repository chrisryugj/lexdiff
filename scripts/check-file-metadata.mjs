/**
 * File Search Store 내 파일의 메타데이터 확인
 *
 * Usage: node scripts/check-file-metadata.mjs
 */

import { GoogleGenAI } from '@google/genai'
import 'dotenv/config'

const STORE_ID = process.env.GEMINI_FILE_SEARCH_STORE_ID
const apiKey = process.env.GEMINI_API_KEY

if (!apiKey || !STORE_ID) {
  console.error('❌ Missing GEMINI_API_KEY or GEMINI_FILE_SEARCH_STORE_ID')
  process.exit(1)
}

const genAI = new GoogleGenAI({ apiKey })

console.log('📚 Listing files in store...')
console.log('Store ID:', STORE_ID)

const files = await genAI.fileSearchStores.listFiles({
  fileSearchStoreName: STORE_ID
})

console.log(`\n✅ Found ${files.length} files\n`)

for (const file of files) {
  console.log('─'.repeat(80))
  console.log('📄 File:', file.name)
  console.log('   Display Name:', file.displayName)
  console.log('   URI:', file.uri || '(none)')
  console.log('   State:', file.state)
  console.log('   Size:', file.sizeBytes, 'bytes')
  console.log('   Created:', file.createTime)

  if (file.metadata && Object.keys(file.metadata).length > 0) {
    console.log('   📋 Metadata:')
    for (const [key, value] of Object.entries(file.metadata)) {
      console.log(`      ${key}: ${value}`)
    }
  } else {
    console.log('   ⚠️  No metadata')
  }
}

console.log('\n' + '─'.repeat(80))
console.log('\n💡 Next steps:')
console.log('   1. If metadata exists → check why it\'s not in chunks')
console.log('   2. If no metadata → re-upload with metadata')
console.log('   3. Test query and check grounding chunks')
