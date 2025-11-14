/**
 * Batch Convert MD Files to Structured Markdown
 *
 * Converts all .md files in data/parsed-laws to structured markdown
 * Also deletes all .meta.json files
 *
 * Usage: node scripts/batch-convert-to-structured.mjs
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PARSED_LAWS_DIR = path.join(__dirname, '..', 'data', 'parsed-laws')

/**
 * Convert basic markdown to structured markdown
 */
function convertToStructuredMarkdown(markdown, fileName) {
  const lines = markdown.split('\n')

  // Extract law metadata from header
  const lawNameMatch = markdown.match(/^# (.+)$/m)
  const lawIdMatch = markdown.match(/\*\*법령 ID\*\*:\s*(.+?)$/m)
  const effectiveDateMatch = markdown.match(/\*\*시행일\*\*:\s*(.+?)$/m)

  if (!lawNameMatch) {
    console.error(`❌ ${fileName}: 법령명(# ...)을 찾을 수 없습니다`)
    return null
  }

  const lawName = lawNameMatch[1].trim()
  const lawId = lawIdMatch ? lawIdMatch[1].trim() : 'unknown'
  const effectiveDate = effectiveDateMatch ? effectiveDateMatch[1].trim() : 'unknown'

  // Check if already structured
  if (/\*\*법령명\*\*:\s*.+/.test(markdown) && /\*\*조문\*\*:\s*.+/.test(markdown)) {
    console.log(`  ⏩ ${fileName}: Already structured`)
    return null // Skip
  }

  // Split into articles
  const articleBlocks = []
  let currentBlock = []
  let isHeader = true
  let articleCount = 0

  for (const line of lines) {
    // Match article title: ## 제N조 or ## 제N조의M
    const articleMatch = line.match(/^## (제\d+(?:의\d+)?조)\s*(.*)$/)

    if (articleMatch) {
      // Save previous article
      if (currentBlock.length > 0 && !isHeader) {
        articleBlocks.push(currentBlock.join('\n'))
      }

      // Start new article with metadata block
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
        line // ## 제N조 ...
      ].filter(Boolean)

      isHeader = false
      articleCount++
    } else {
      currentBlock.push(line)
    }
  }

  // Add last article
  if (currentBlock.length > 0 && !isHeader) {
    articleBlocks.push(currentBlock.join('\n'))
  }

  // Combine: header + structured articles
  const headerEndIndex = lines.findIndex((line) => line.match(/^## 제\d+/))
  const header = headerEndIndex > 0 ? lines.slice(0, headerEndIndex).join('\n') : lines.slice(0, 10).join('\n')

  const output = [header, '', ...articleBlocks, '\n---\n'].join('\n')

  return { output, articleCount }
}

// Main execution
console.log('🚀 Batch Converting MD files to Structured Markdown\n')
console.log(`📂 Directory: ${PARSED_LAWS_DIR}\n`)

if (!fs.existsSync(PARSED_LAWS_DIR)) {
  console.error(`❌ Directory not found: ${PARSED_LAWS_DIR}`)
  process.exit(1)
}

const files = fs.readdirSync(PARSED_LAWS_DIR)
const mdFiles = files.filter((f) => f.endsWith('.md'))
const metaFiles = files.filter((f) => f.endsWith('.meta.json'))

console.log(`📋 Found ${mdFiles.length} .md files`)
console.log(`🗑️  Found ${metaFiles.length} .meta.json files\n`)

let convertedCount = 0
let skippedCount = 0
let errorCount = 0

// Convert MD files
for (const mdFile of mdFiles) {
  const filePath = path.join(PARSED_LAWS_DIR, mdFile)
  const markdown = fs.readFileSync(filePath, 'utf-8')

  const result = convertToStructuredMarkdown(markdown, mdFile)

  if (result === null) {
    skippedCount++
    continue
  }

  try {
    fs.writeFileSync(filePath, result.output, 'utf-8')
    console.log(`  ✅ ${mdFile} (${result.articleCount} articles)`)
    convertedCount++
  } catch (error) {
    console.error(`  ❌ ${mdFile}: ${error.message}`)
    errorCount++
  }
}

console.log(`\n📊 Conversion Results:`)
console.log(`   ✅ Converted: ${convertedCount}`)
console.log(`   ⏩ Skipped (already structured): ${skippedCount}`)
console.log(`   ❌ Errors: ${errorCount}`)

// Delete meta.json files
if (metaFiles.length > 0) {
  console.log(`\n🗑️  Deleting .meta.json files...`)

  for (const metaFile of metaFiles) {
    const filePath = path.join(PARSED_LAWS_DIR, metaFile)
    try {
      fs.unlinkSync(filePath)
      console.log(`  ✅ Deleted: ${metaFile}`)
    } catch (error) {
      console.error(`  ❌ ${metaFile}: ${error.message}`)
    }
  }
}

console.log(`\n✨ Batch conversion complete!`)
console.log(`\n📌 Next steps:`)
console.log(`   1. Verify files: ls data/parsed-laws`)
console.log(`   2. Upload to File Search: npm run file-search:upload-all`)
console.log(`   3. Test: "관세법 38조에 대해 궁금해"`)
