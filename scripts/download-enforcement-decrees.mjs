/**
 * Download Enforcement Decrees and Rules
 *
 * For each law in data/parsed-laws, downloads:
 * - 시행령 (Enforcement Decree)
 * - 시행규칙 (Enforcement Rule)
 *
 * Usage: node scripts/download-enforcement-decrees.mjs [--law="법령명"] [--delay=1000]
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PARSED_LAWS_DIR = path.join(__dirname, '..', 'data', 'parsed-laws')
const LAW_OC = process.env.LAW_OC

// Parse CLI args
const args = process.argv.slice(2)
const specificLaw = args.find((arg) => arg.startsWith('--law='))?.split('=')[1]
const delay = parseInt(args.find((arg) => arg.startsWith('--delay='))?.split('=')[1] || '1000')

if (!LAW_OC) {
  console.error('❌ LAW_OC 환경변수가 설정되지 않았습니다')
  console.error('   .env.local 파일에 LAW_OC=<API_KEY> 추가 필요')
  process.exit(1)
}

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Extract law name from MD file
 */
function extractLawNameFromMD(markdown) {
  const match = markdown.match(/^# (.+)$/m)
  return match ? match[1].trim() : null
}

/**
 * Search law by name
 */
async function searchLaw(lawName) {
  const params = new URLSearchParams({
    OC: LAW_OC,
    type: 'XML',
    target: 'law',
    query: lawName
  })

  const url = `https://www.law.go.kr/DRF/lawSearch.do?${params.toString()}`

  try {
    const response = await fetch(url)
    const xml = await response.text()

    if (!response.ok) {
      console.error(`  ❌ Search failed: ${response.status}`)
      return null
    }

    // Parse XML to find MST (for eflaw API)
    // Try multiple field names
    let mst = null
    const mstMatch = xml.match(/<법령일련번호>(\d+)<\/법령일련번호>/)
    const idMatch = xml.match(/<법령ID>(\d+)<\/법령ID>/)
    const nameMatch = xml.match(/<법령명한글>([^<]+)<\/법령명한글>/)

    // MST is 법령일련번호, not 법령ID
    if (mstMatch) {
      mst = mstMatch[1]
    } else if (idMatch) {
      mst = idMatch[1]
    }

    if (!mst) {
      console.error(`  ❌ MST not found in XML`)
      console.log('  XML sample:', xml.substring(0, 500))
      return null
    }

    return {
      lawId: mst,
      lawName: nameMatch ? nameMatch[1] : lawName
    }
  } catch (error) {
    console.error(`  ❌ Search error: ${error.message}`)
    return null
  }
}

/**
 * Fetch law content from eflaw API
 */
async function fetchLawContent(lawId) {
  const params = new URLSearchParams({
    target: 'eflaw',
    OC: LAW_OC,
    type: 'JSON',
    MST: lawId
  })

  const url = `https://www.law.go.kr/DRF/lawService.do?${params.toString()}`

  try {
    const response = await fetch(url)
    const text = await response.text()

    if (!response.ok) {
      console.error(`  ❌ Fetch failed: ${response.status}`)
      return null
    }

    // Check if HTML error page
    if (text.includes('<!DOCTYPE html')) {
      console.error(`  ❌ Received HTML error page`)
      return null
    }

    const json = JSON.parse(text)
    return json
  } catch (error) {
    console.error(`  ❌ Fetch error: ${error.message}`)
    return null
  }
}

/**
 * Parse law JSON (simplified from law-parser-server.ts)
 */
function parseLawJSON(jsonData) {
  // Debug: log available keys
  console.log('  🔍 JSON keys:', Object.keys(jsonData))

  const lawData = jsonData.법령

  if (!lawData) {
    console.error('  ❌ JSON structure:', JSON.stringify(jsonData, null, 2).substring(0, 500))
    throw new Error('법령 데이터가 없습니다')
  }

  const basicInfo = lawData.기본정보 || lawData
  const lawId = basicInfo.법령ID || basicInfo.법령키 || 'unknown'
  const lawName = basicInfo.법령명_한글 || basicInfo.법령명한글 || basicInfo.법령명 || '제목 없음'
  const effectiveDate = basicInfo.최종시행일자 || basicInfo.시행일자 || ''
  const promulgationDate = basicInfo.공포일자 || ''
  const promulgationNumber = basicInfo.공포번호 || ''
  const revisionType = basicInfo.제개정구분명 || basicInfo.제개정구분 || ''

  // Extract articles
  const articles = []
  const articleUnits = lawData.조문?.조문단위 || []

  for (const unit of articleUnits) {
    if (unit.조문여부 !== '조문') {
      continue
    }

    const articleNum = unit.조문번호
    const branchNum = unit.조문가지번호
    const title = unit.조문제목 || ''

    let displayNumber = `제${articleNum}조`
    if (branchNum && parseInt(branchNum) > 0) {
      displayNumber = `제${articleNum}조의${branchNum}`
    }

    // Extract content
    let content = ''
    if (unit.항 && Array.isArray(unit.항)) {
      for (const hang of unit.항) {
        if (hang.항내용) {
          let hangContent = Array.isArray(hang.항내용) ? hang.항내용.join('\n') : hang.항내용
          content += '\n' + hangContent
        }

        if (hang.호 && Array.isArray(hang.호)) {
          for (const ho of hang.호) {
            if (ho.호내용) {
              let hoContent = Array.isArray(ho.호내용) ? ho.호내용.join('\n') : ho.호내용
              content += '\n' + hoContent
            }

            if (ho.목 && Array.isArray(ho.목)) {
              for (const mok of ho.목) {
                if (mok.목내용) {
                  let mokContent = Array.isArray(mok.목내용) ? mok.목내용.join('\n') : mok.목내용
                  content += '\n  ' + mokContent
                }
              }
            }
          }
        }
      }
    }

    articles.push({
      articleNumber: articleNum,
      branchNumber: branchNum,
      title,
      content: content.trim(),
      displayNumber
    })
  }

  return {
    lawId,
    lawName,
    effectiveDate,
    promulgationDate,
    promulgationNumber,
    revisionType,
    articles
  }
}

/**
 * Format date (YYYYMMDD -> YYYY년 MM월 DD일)
 */
function formatDate(dateStr) {
  if (!dateStr || dateStr.length !== 8) return dateStr

  const year = dateStr.substring(0, 4)
  const month = dateStr.substring(4, 6)
  const day = dateStr.substring(6, 8)

  return `${year}년 ${parseInt(month)}월 ${parseInt(day)}일`
}

/**
 * Generate markdown (basic format, will be converted to structured later)
 */
function generateMarkdown(parsed) {
  let md = `# ${parsed.lawName}\n\n`
  md += `**법령 ID**: ${parsed.lawId}\n`

  if (parsed.effectiveDate) {
    md += `**시행일**: ${formatDate(parsed.effectiveDate)}\n`
  }

  if (parsed.promulgationDate) {
    md += `**공포일**: ${formatDate(parsed.promulgationDate)}`
    if (parsed.promulgationNumber) {
      md += ` (${parsed.promulgationNumber})`
    }
    md += `\n`
  }

  if (parsed.revisionType) {
    md += `**제개정구분**: ${parsed.revisionType}\n`
  }

  md += `**조문 수**: ${parsed.articles.length}개\n`
  md += `\n---\n\n`

  for (const article of parsed.articles) {
    md += `## ${article.displayNumber}`
    if (article.title) {
      md += ` ${article.title}`
    }
    md += `\n\n`

    if (article.content) {
      md += `${article.content}\n\n`
    } else {
      md += `(조문 내용 없음)\n\n`
    }
  }

  return md
}

/**
 * Convert to structured markdown
 */
function convertToStructuredMarkdown(markdown) {
  const lines = markdown.split('\n')

  const lawNameMatch = markdown.match(/^# (.+)$/m)
  const lawIdMatch = markdown.match(/\*\*법령 ID\*\*:\s*(.+?)$/m)
  const effectiveDateMatch = markdown.match(/\*\*시행일\*\*:\s*(.+?)$/m)

  if (!lawNameMatch) {
    throw new Error('법령명을 찾을 수 없습니다')
  }

  const lawName = lawNameMatch[1].trim()
  const lawId = lawIdMatch ? lawIdMatch[1].trim() : 'unknown'
  const effectiveDate = effectiveDateMatch ? effectiveDateMatch[1].trim() : 'unknown'

  const articleBlocks = []
  let currentBlock = []
  let isHeader = true
  let articleCount = 0

  for (const line of lines) {
    const articleMatch = line.match(/^## (제\d+(?:의\d+)?조)\s*(.*)$/)

    if (articleMatch) {
      if (currentBlock.length > 0 && !isHeader) {
        articleBlocks.push(currentBlock.join('\n'))
      }

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
        line
      ].filter(Boolean)

      isHeader = false
      articleCount++
    } else {
      currentBlock.push(line)
    }
  }

  if (currentBlock.length > 0 && !isHeader) {
    articleBlocks.push(currentBlock.join('\n'))
  }

  const headerEndIndex = lines.findIndex((line) => line.match(/^## 제\d+/))
  const header = headerEndIndex > 0 ? lines.slice(0, headerEndIndex).join('\n') : lines.slice(0, 10).join('\n')

  const output = [header, '', ...articleBlocks, '\n---\n'].join('\n')

  return { output, articleCount }
}

/**
 * Download and save decree/rule
 */
async function downloadEnforcementLaw(baseLawName, suffix) {
  const searchName = `${baseLawName} ${suffix}`
  const fileName = `${searchName}.md`
  const filePath = path.join(PARSED_LAWS_DIR, fileName)

  // Skip if already exists
  if (fs.existsSync(filePath)) {
    console.log(`  ⏩ ${searchName} - Already exists`)
    return { success: true, skipped: true }
  }

  console.log(`  🔍 Searching: ${searchName}`)

  // Step 1: Search
  const searchResult = await searchLaw(searchName)
  await sleep(delay)

  if (!searchResult) {
    console.log(`  ⚠️  ${searchName} - Not found`)
    return { success: false, notFound: true }
  }

  console.log(`  ✓ Found: ${searchResult.lawName} (ID: ${searchResult.lawId})`)

  // Step 2: Fetch content
  console.log(`  📥 Fetching content...`)
  const content = await fetchLawContent(searchResult.lawId)
  await sleep(delay)

  if (!content) {
    console.log(`  ❌ ${searchName} - Failed to fetch content`)
    return { success: false, fetchFailed: true }
  }

  // Step 3: Parse
  console.log(`  📝 Parsing...`)
  const parsed = parseLawJSON(content)

  // Step 4: Generate markdown
  const basicMarkdown = generateMarkdown(parsed)

  // Step 5: Convert to structured
  const { output: structuredMarkdown, articleCount } = convertToStructuredMarkdown(basicMarkdown)

  // Step 6: Save
  fs.writeFileSync(filePath, structuredMarkdown, 'utf-8')

  console.log(`  ✅ ${searchResult.lawName} (${articleCount} articles)`)

  return { success: true, articleCount }
}

// ========== Main Execution ==========

console.log('🚀 Downloading Enforcement Decrees and Rules\n')
console.log(`📂 Directory: ${PARSED_LAWS_DIR}`)
console.log(`⏱️  Delay: ${delay}ms between requests\n`)

if (!fs.existsSync(PARSED_LAWS_DIR)) {
  console.error(`❌ Directory not found: ${PARSED_LAWS_DIR}`)
  process.exit(1)
}

const files = fs.readdirSync(PARSED_LAWS_DIR)
const mdFiles = files.filter((f) => f.endsWith('.md'))

// Filter laws (exclude enforcement decrees/rules)
const baseLaws = mdFiles.filter((f) => !f.includes('시행령') && !f.includes('시행규칙'))

console.log(`📋 Found ${baseLaws.length} base laws\n`)

if (specificLaw) {
  console.log(`🎯 Specific law mode: "${specificLaw}"\n`)
}

let processedCount = 0
let successCount = 0
let skippedCount = 0
let notFoundCount = 0
let errorCount = 0

for (const mdFile of baseLaws) {
  const filePath = path.join(PARSED_LAWS_DIR, mdFile)
  const markdown = fs.readFileSync(filePath, 'utf-8')

  const lawName = extractLawNameFromMD(markdown)
  if (!lawName) {
    console.log(`⚠️  ${mdFile}: 법령명을 찾을 수 없음`)
    continue
  }

  // Skip if specific law is requested and this is not it
  if (specificLaw && lawName !== specificLaw) {
    continue
  }

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`📖 ${lawName}`)
  processedCount++

  // Download 시행령
  const decreeResult = await downloadEnforcementLaw(lawName, '시행령')
  if (decreeResult.success && !decreeResult.skipped) successCount++
  if (decreeResult.skipped) skippedCount++
  if (decreeResult.notFound) notFoundCount++
  if (decreeResult.fetchFailed) errorCount++

  // Download 시행규칙
  const ruleResult = await downloadEnforcementLaw(lawName, '시행규칙')
  if (ruleResult.success && !ruleResult.skipped) successCount++
  if (ruleResult.skipped) skippedCount++
  if (ruleResult.notFound) notFoundCount++
  if (ruleResult.fetchFailed) errorCount++

  console.log()
}

console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
console.log(`\n📊 Results:`)
console.log(`   📖 Base laws processed: ${processedCount}`)
console.log(`   ✅ Downloaded: ${successCount}`)
console.log(`   ⏩ Skipped (already exists): ${skippedCount}`)
console.log(`   ⚠️  Not found: ${notFoundCount}`)
console.log(`   ❌ Errors: ${errorCount}`)

console.log(`\n✨ Download complete!`)
console.log(`\n📌 Next steps:`)
console.log(`   1. Verify files: ls data/parsed-laws | grep "시행"`)
console.log(`   2. Upload to File Search: npm run file-search:upload-all`)
console.log(`   3. Test: "관세법 시행령 10조에 대해 궁금해"`)
