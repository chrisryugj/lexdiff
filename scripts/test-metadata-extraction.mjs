/**
 * Test Metadata Extraction from Markdown
 *
 * Tests the extractLawMetadata function with real law files
 *
 * Usage: node scripts/test-metadata-extraction.mjs
 */

import fs from 'fs'
import path from 'path'
import { extractLawMetadata, validateMetadata } from '../lib/law-metadata-extractor.ts'

const parsedLawsDir = path.join(process.cwd(), 'data', 'parsed-laws')

// Test files
const testFiles = [
  '관세법.md',           // 법률
  '관세법 시행령.md',    // 시행령
  '관세법 시행규칙.md',  // 시행규칙
  '고용보험법.md'        // 다른 법률
]

console.log('🧪 Testing Metadata Extraction\n')
console.log('─'.repeat(80))

for (const fileName of testFiles) {
  const filePath = path.join(parsedLawsDir, fileName)

  if (!fs.existsSync(filePath)) {
    console.log(`\n⚠️  File not found: ${fileName}`)
    continue
  }

  console.log(`\n📄 Testing: ${fileName}`)

  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const metadata = extractLawMetadata(content, fileName)
    const validation = validateMetadata(metadata)

    console.log('\n  Extracted Metadata:')
    console.log(`    law_name: ${metadata.law_name}`)
    console.log(`    law_id: ${metadata.law_id}`)
    console.log(`    law_type: ${metadata.law_type}`)
    console.log(`    effective_date: ${metadata.effective_date || '(없음)'}`)
    console.log(`    total_articles: ${metadata.total_articles}`)
    console.log(`    region: ${metadata.region || '(없음)'}`)
    console.log(`    category: ${metadata.category || '(없음)'}`)

    if (validation.valid) {
      console.log('\n  ✅ Validation: PASS')
    } else {
      console.log('\n  ❌ Validation: FAIL')
      validation.errors.forEach(err => {
        console.log(`    - ${err}`)
      })
    }

  } catch (error) {
    console.log(`\n  ❌ Error: ${error.message}`)
  }

  console.log('  ' + '─'.repeat(76))
}

console.log('\n✅ Test complete!')
console.log('\n💡 Next step: Upload one file and verify metadata in File Search Store')
