/**
 * 법령 MD를 Structured Markdown으로 변환
 *
 * Before:
 *   # 관세법
 *   ## 제38조 신고납부
 *   ① 내용...
 *
 * After:
 *   # 관세법
 *   ---
 *   **법령명**: 관세법
 *   **조문**: 제38조
 *   **제목**: 신고납부
 *   ## 제38조 신고납부
 *   ① 내용...
 *   ---
 *
 * Usage: node scripts/convert-to-structured-md.mjs data/parsed-laws/관세법_001.md
 */

import fs from 'fs'
import path from 'path'

const filePath = process.argv[2]

if (!filePath) {
  console.error('❌ Usage: node convert-to-structured-md.mjs <file-path>')
  process.exit(1)
}

if (!fs.existsSync(filePath)) {
  console.error(`❌ File not found: ${filePath}`)
  process.exit(1)
}

const content = fs.readFileSync(filePath, 'utf-8')
const lines = content.split('\n')

// Extract law metadata from header
const lawNameMatch = content.match(/^# (.+)$/m)
const lawIdMatch = content.match(/\*\*법령 ID\*\*: (.+)$/m)
const effectiveDateMatch = content.match(/\*\*시행일\*\*: (.+)$/m)

if (!lawNameMatch) {
  console.error('❌ Could not find law name (# 법령명) in file')
  process.exit(1)
}

const lawName = lawNameMatch[1].trim()
const lawId = lawIdMatch ? lawIdMatch[1].trim() : 'unknown'
const effectiveDate = effectiveDateMatch ? effectiveDateMatch[1].trim() : 'unknown'

console.log(`📋 Law: ${lawName} (${lawId})`)
console.log(`📅 Effective Date: ${effectiveDate}`)

// Split into articles
const articleBlocks = []
let currentBlock = []
let isHeader = true
let articleCount = 0

for (const line of lines) {
  // Article title: ## 제N조 or ## 제N조의M
  const articleMatch = line.match(/^## (제\d+(?:의\d+)?조)\s*(.*)$/)

  if (articleMatch) {
    // Save previous article
    if (currentBlock.length > 0 && !isHeader) {
      articleBlocks.push(currentBlock.join('\n'))
    }

    // Start new article with metadata
    const articleNum = articleMatch[1]
    const articleTitle = articleMatch[2].trim()

    currentBlock = [
      '---',
      '',
      `**법령명**: ${lawName}`,
      `**법령ID**: ${lawId}`,
      `**조문**: ${articleNum}`,
      articleTitle ? `**제목**: ${articleTitle}` : '',
      `**시행일**: ${effectiveDate}`,
      '',
      line  // ## 제N조 ...
    ].filter(Boolean)

    isHeader = false
    articleCount++

    if (articleCount <= 3) {
      console.log(`  ✅ ${articleNum} ${articleTitle}`)
    }
  } else {
    currentBlock.push(line)
  }
}

// Add last article
if (currentBlock.length > 0 && !isHeader) {
  articleBlocks.push(currentBlock.join('\n'))
}

console.log(`\n✅ Processed ${articleCount} articles`)

// Combine: header + structured articles
const headerEndIndex = lines.findIndex(line => line.match(/^## 제\d+/))
const header = lines.slice(0, headerEndIndex).join('\n')

const output = [
  header,
  '',
  ...articleBlocks,
  '\n---\n'
].join('\n')

// Save
const outputPath = filePath.replace(/\.md$/, '_structured.md')
fs.writeFileSync(outputPath, output, 'utf-8')

console.log(`\n💾 Saved to: ${outputPath}`)
console.log(`\n📊 Statistics:`)
console.log(`   Original size: ${(content.length / 1024).toFixed(1)} KB`)
console.log(`   New size: ${(output.length / 1024).toFixed(1)} KB`)
console.log(`   Overhead: +${((output.length / content.length - 1) * 100).toFixed(1)}%`)

console.log(`\n📌 Next steps:`)
console.log(`   1. Review: ${outputPath}`)
console.log(`   2. Upload: npm run file-search:upload "${outputPath}"`)
console.log(`   3. Test: "관세법 38조에 대해 궁금해"`)
console.log(`\n💡 Benefits:`)
console.log(`   - 청킹이 어디서 일어나도 법령명/조문 추출 가능`)
console.log(`   - 정규식 패턴: /\\*\\*법령명\\*\\*: (.+)/`)
console.log(`   - 가독성 유지, 구조화된 메타데이터`)
