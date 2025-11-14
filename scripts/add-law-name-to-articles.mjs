/**
 * 법령 MD 파일의 모든 조문 제목에 법령명 추가
 *
 * Before: ## 제38조 신고납부
 * After:  ## 【관세법】제38조 신고납부
 *
 * Usage: node scripts/add-law-name-to-articles.mjs data/parsed-laws/관세법_001.md
 */

import fs from 'fs'
import path from 'path'

const filePath = process.argv[2]

if (!filePath) {
  console.error('❌ Usage: node add-law-name-to-articles.mjs <file-path>')
  process.exit(1)
}

if (!fs.existsSync(filePath)) {
  console.error(`❌ File not found: ${filePath}`)
  process.exit(1)
}

const content = fs.readFileSync(filePath, 'utf-8')
const lines = content.split('\n')

// Extract law name from "# 법령명" header
const lawNameMatch = content.match(/^# (.+)$/m)
if (!lawNameMatch) {
  console.error('❌ Could not find law name (# 법령명) in file')
  process.exit(1)
}

const lawName = lawNameMatch[1].trim()
console.log(`📋 Law name: ${lawName}`)

// Replace article titles
let modifiedLines = []
let articleCount = 0

for (const line of lines) {
  // Match: ## 제N조 or ## 제N조의M
  const articleMatch = line.match(/^## (제\d+(?:의\d+)?조.*)$/)

  if (articleMatch && !line.includes('【')) {
    // Add law name if not already present
    const newLine = `## 【${lawName}】${articleMatch[1]}`
    modifiedLines.push(newLine)
    articleCount++

    if (articleCount <= 3) {
      console.log(`  ✅ ${line} → ${newLine}`)
    }
  } else {
    modifiedLines.push(line)
  }
}

console.log(`\n✅ Modified ${articleCount} articles`)

// Save
const outputPath = filePath.replace(/\.md$/, '_with_lawname.md')
fs.writeFileSync(outputPath, modifiedLines.join('\n'), 'utf-8')

console.log(`\n💾 Saved to: ${outputPath}`)
console.log(`\n📌 Next steps:`)
console.log(`   1. Review the file: ${outputPath}`)
console.log(`   2. Upload to File Search: npm run file-search:upload ${outputPath}`)
console.log(`   3. Test query: "관세법 38조에 대해 궁금해"`)
