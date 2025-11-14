/**
 * Download All Ordinances (Seoul City + 25 Districts)
 * Downloads ALL ordinances from Seoul Metropolitan Government and 25 districts
 */

import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const LAW_OC = process.env.LAW_OC

if (!LAW_OC) {
  console.error('❌ LAW_OC environment variable is required')
  process.exit(1)
}

// Seoul City + 25 Districts
const DISTRICTS = [
  { code: '11', name: '서울특별시', type: 'city' },
  { code: '11215', name: '광진구', type: 'district' },
  { code: '11110', name: '종로구', type: 'district' },
  { code: '11140', name: '중구', type: 'district' },
  { code: '11170', name: '용산구', type: 'district' },
  { code: '11200', name: '성동구', type: 'district' },
  { code: '11230', name: '성북구', type: 'district' },
  { code: '11260', name: '강북구', type: 'district' },
  { code: '11290', name: '도봉구', type: 'district' },
  { code: '11305', name: '노원구', type: 'district' },
  { code: '11320', name: '은평구', type: 'district' },
  { code: '11350', name: '서대문구', type: 'district' },
  { code: '11380', name: '마포구', type: 'district' },
  { code: '11410', name: '양천구', type: 'district' },
  { code: '11440', name: '강서구', type: 'district' },
  { code: '11470', name: '구로구', type: 'district' },
  { code: '11500', name: '금천구', type: 'district' },
  { code: '11530', name: '영등포구', type: 'district' },
  { code: '11545', name: '동작구', type: 'district' },
  { code: '11560', name: '관악구', type: 'district' },
  { code: '11590', name: '서초구', type: 'district' },
  { code: '11620', name: '강남구', type: 'district' },
  { code: '11650', name: '송파구', type: 'district' },
  { code: '11680', name: '강동구', type: 'district' },
  { code: '11710', name: '동대문구', type: 'district' },
  { code: '11740', name: '중랑구', type: 'district' }
]

const DELAY = parseInt(process.argv[2]) || 1000 // Default 1 second (faster)
const DISTRICT_FILTER = process.argv[3] || null // Optional: filter by district name

const stats = {
  districts: 0,
  totalOrdinances: 0,
  downloaded: 0,
  skipped: 0,
  errors: 0,
  notFound: 0
}

/**
 * Extract district name from organization name (<지자체기관명>)
 * Example: "서울특별시 광진구" → "광진구"
 * Example: "서울특별시" → "서울특별시" (city level, 본청)
 */
function extractDistrictFromOrgName(orgName) {
  // Organization name format: "서울특별시 {구명}" or just "서울특별시"

  // Check for each district name
  const districtNames = [
    '광진구', '종로구', '중구', '용산구', '성동구', '성북구', '강북구', '도봉구',
    '노원구', '은평구', '서대문구', '마포구', '양천구', '강서구', '구로구', '금천구',
    '영등포구', '동작구', '관악구', '서초구', '강남구', '송파구', '강동구', '동대문구', '중랑구'
  ]

  for (const districtName of districtNames) {
    if (orgName.includes(districtName)) {
      return districtName
    }
  }

  // If no district found, it's Seoul City (본청)
  return '서울특별시'
}

/**
 * Search ordinances for a district
 */
async function searchOrdinances(districtCode, districtName) {
  try {
    // Search all Seoul ordinances, then filter by district name in ordinance title
    const searchQuery = '서울특별시'
    console.log(`  🔍 Searching ordinances (query: ${searchQuery})...`)

    // Fetch first page to get total count
    const params = new URLSearchParams({
      OC: LAW_OC,
      target: 'ordin',
      type: 'XML',
      query: searchQuery,
      display: '100',
      page: '1'
    })

    let url = `https://www.law.go.kr/DRF/lawSearch.do?${params.toString()}`
    let response = await fetch(url)
    let xml = await response.text()

    if (!response.ok) {
      console.error(`  ❌ Search failed: ${response.status}`)
      return []
    }

    // Get total count and pages
    const totalCountMatch = xml.match(/<totalCnt>(\d+)<\/totalCnt>/)
    const totalCount = totalCountMatch ? parseInt(totalCountMatch[1]) : 0
    const totalPages = Math.ceil(totalCount / 100)
    console.log(`  📊 Total: ${totalCount} ordinances across ${totalPages} pages`)

    // Collect all ordinances from all pages
    const allOrdinances = []

    for (let page = 1; page <= totalPages; page++) {
      if (page > 1) {
        // Fetch next page
        params.set('page', page.toString())
        url = `https://www.law.go.kr/DRF/lawSearch.do?${params.toString()}`
        console.log(`  📄 Fetching page ${page}/${totalPages}...`)

        response = await fetch(url)
        xml = await response.text()

        if (!response.ok) {
          console.error(`  ❌ Page ${page} failed`)
          continue
        }

        await new Promise((resolve) => setTimeout(resolve, DELAY))
      }

      // Parse XML
      const matches = Array.from(xml.matchAll(/<law[^>]*>([\s\S]*?)<\/law>/g))

      for (const match of matches) {
        const lawXml = match[1]

        const ordinSeqMatch = lawXml.match(/<자치법규일련번호>(\d+)<\/자치법규일련번호>/)
        const ordinIdMatch = lawXml.match(/<자치법규ID>(\d+)<\/자치법규ID>/)
        const nameMatch = lawXml.match(/<자치법규명>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/자치법규명>/)
        const kindMatch = lawXml.match(/<자치법규종류>([^<]+)<\/자치법규종류>/)
        const orgNameMatch = lawXml.match(/<지자체기관명>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/지자체기관명>/)

        const ordinSeq = ordinSeqMatch ? ordinSeqMatch[1] : null
        const ordinId = ordinIdMatch ? ordinIdMatch[1] : null
        const name = nameMatch ? nameMatch[1].trim() : 'Unknown'
        const kind = kindMatch ? kindMatch[1] : ''
        const orgName = orgNameMatch ? orgNameMatch[1].trim() : ''
        const id = ordinSeq || ordinId

        // Filter by district using <지자체기관명> field (more accurate than ordinance name)
        if (id && name && kind && (kind === '조례' || kind === '규칙')) {
          // Extract district from organization name
          // Example: "서울특별시 광진구" → "광진구"
          // Example: "서울특별시" → "서울특별시" (city level, 본청)
          const extractedDistrict = extractDistrictFromOrgName(orgName)

          // Only include if matches current district
          if (extractedDistrict === districtName) {
            allOrdinances.push({ id, name, kind })
          }
        }
      }
    }

    console.log(`  ✓ Found ${allOrdinances.length} ordinances (조례+규칙)`)
    return allOrdinances
  } catch (error) {
    console.error(`  ❌ Search error: ${error.message}`)
    return []
  }
}

/**
 * Fetch ordinance content
 */
async function fetchOrdinanceContent(ordinSeq, ordinId) {
  try {
    const params = new URLSearchParams({
      target: 'ordin',  // CRITICAL: Must specify target=ordin
      OC: LAW_OC,
      type: 'XML'
    })

    // Use MST for ordinSeq, ID for ordinId (matching app/api/ordin/route.ts)
    if (ordinSeq) {
      params.append('MST', ordinSeq)
    } else if (ordinId) {
      params.append('ID', ordinId)
    }

    const url = `https://www.law.go.kr/DRF/lawService.do?${params.toString()}`

    const response = await fetch(url)
    const xml = await response.text()

    if (!response.ok || xml.includes('<!DOCTYPE html')) {
      return null
    }

    return xml
  } catch (error) {
    console.error(`    ❌ Fetch error: ${error.message}`)
    return null
  }
}

/**
 * Parse ordinance XML
 */
function parseOrdinanceXML(xml, ordinanceName, districtName) {
  try {
    // Basic info
    const ordinIdMatch = xml.match(/<자치법규ID>(\d+)<\/자치법규ID>/)
    const effectiveDateMatch = xml.match(/<시행일자>(\d+)<\/시행일자>/)
    const promulgationDateMatch = xml.match(/<공포일자>(\d+)<\/공포일자>/)
    const promulgationNumberMatch = xml.match(/<공포번호>([^<]+)<\/공포번호>/)

    const ordinId = ordinIdMatch ? ordinIdMatch[1] : 'unknown'
    const effectiveDate = effectiveDateMatch ? effectiveDateMatch[1] : ''
    const promulgationDate = promulgationDateMatch ? promulgationDateMatch[1] : ''
    const promulgationNumber = promulgationNumberMatch ? promulgationNumberMatch[1] : ''

    // Articles - FIXED: Use <조> not <조문단위>
    const articles = []
    const articleMatches = xml.matchAll(/<조[^>]*>([\s\S]*?)<\/조>/g)

    for (const match of articleMatches) {
      const articleXml = match[1]

      const articleNumMatch = articleXml.match(/<조문번호>(\d+)<\/조문번호>/)
      // FIXED: Use <조제목> not <조문제목>
      const titleMatch = articleXml.match(/<조제목>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/조제목>/)
      // FIXED: Use <조내용> not <조문내용>
      const contentMatch = articleXml.match(/<조내용>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/조내용>/)

      if (articleNumMatch) {
        const articleNum = articleNumMatch[1]

        // SKIP: 제0조 (장 구분자)
        if (articleNum === '000000') {
          continue
        }

        const title = titleMatch ? titleMatch[1].trim() : ''
        let content = contentMatch ? contentMatch[1] : ''

        // Clean content (remove XML tags and HTML entities)
        content = content
          .replace(/<[^>]+>/g, '')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .trim()

        // Convert 6-digit article number
        // Format: AAAABB where AAAA = article, BB = branch
        // Example: 000100 = 제1조, 000102 = 제1조의2
        const joNum = Math.floor(parseInt(articleNum) / 100)
        const jiBranch = parseInt(articleNum) % 100

        let displayNumber
        if (jiBranch === 0) {
          displayNumber = `제${joNum}조`
        } else {
          displayNumber = `제${joNum}조의${jiBranch}`
        }

        // REMOVE: First line "제N조(제목)" duplication
        // Pattern: "제5조(도로굴착사업계획 조정 신청 공고)"
        const firstLinePattern = new RegExp(`^${displayNumber}\\s*\\([^)]+\\)\\s*\n?`, 'm')
        content = content.replace(firstLinePattern, '').trim()

        articles.push({
          articleNumber: articleNum,
          title,
          content,
          displayNumber
        })
      }
    }

    return {
      ordinId,
      ordinanceName,
      districtName,
      effectiveDate,
      promulgationDate,
      promulgationNumber,
      articleCount: articles.length,
      totalCharacters: articles.reduce((sum, a) => sum + a.content.length, 0),
      articles
    }
  } catch (error) {
    throw new Error(`Parse failed: ${error.message}`)
  }
}

/**
 * Format date
 */
function formatDate(dateStr) {
  if (!dateStr || dateStr.length !== 8) return dateStr

  const year = dateStr.substring(0, 4)
  const month = dateStr.substring(4, 6)
  const day = dateStr.substring(6, 8)

  return `${year}년 ${parseInt(month)}월 ${parseInt(day)}일`
}

/**
 * Generate markdown (with metadata like laws)
 */
function generateMarkdown(parsed) {
  // Header metadata (once)
  let md = `# ${parsed.ordinanceName}\n\n`
  md += `**자치구**: ${parsed.districtName}\n`
  md += `**자치법규 ID**: ${parsed.ordinId}\n`

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

  md += `**조문 수**: ${parsed.articleCount}개\n`
  md += `\n---\n\n`

  // Each article with metadata (like laws)
  for (const article of parsed.articles) {
    md += `\n---\n`
    md += `**조례명**: ${parsed.ordinanceName}\n`
    md += `**자치법규ID**: ${parsed.ordinId}\n`
    md += `**조문**: ${article.displayNumber}\n`
    if (article.title) {
      md += `**제목**: ${article.title}\n`
    }
    if (parsed.effectiveDate) {
      md += `**시행일**: ${formatDate(parsed.effectiveDate)}\n`
    }

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
 * Save ordinance to file (with district folder separation)
 */
async function saveOrdinance(parsed, markdown) {
  // Create district-specific folder
  const districtDir = path.join(process.cwd(), 'data', 'parsed-ordinances', parsed.districtName)

  if (!fs.existsSync(districtDir)) {
    fs.mkdirSync(districtDir, { recursive: true })
  }

  // Sanitize filename (without district prefix)
  const sanitized = parsed.ordinanceName
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 200)

  const filename = `${sanitized}.md`
  const filepath = path.join(districtDir, filename)

  // Check if already exists
  if (fs.existsSync(filepath)) {
    return { exists: true, filepath }
  }

  // Save markdown (metadata is inside markdown, no separate .meta.json)
  fs.writeFileSync(filepath, markdown, 'utf-8')

  return { exists: false, filepath }
}

/**
 * Download ordinances for a district
 */
async function downloadDistrictOrdinances(districtCode, districtName) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`🏙️  ${districtName} (${districtCode})`)
  console.log(`${'='.repeat(60)}`)

  // Search ordinances
  const ordinances = await searchOrdinances(districtCode, districtName)

  if (ordinances.length === 0) {
    console.log(`  ⚠️  No ordinances found`)
    return
  }

  stats.totalOrdinances += ordinances.length

  // Download each ordinance
  let districtDownloaded = 0
  let districtSkipped = 0
  let districtErrors = 0

  for (let i = 0; i < ordinances.length; i++) {
    const ordinance = ordinances[i]
    console.log(`\n  📜 [${i + 1}/${ordinances.length}] ${ordinance.name}`)

    try {
      // Fetch content
      console.log(`    📥 Fetching...`)
      const xml = await fetchOrdinanceContent(ordinance.id, ordinance.id)

      if (!xml) {
        console.log(`    ❌ Failed to fetch`)
        stats.errors++
        districtErrors++
        continue
      }

      // Parse
      console.log(`    📝 Parsing...`)
      const parsed = parseOrdinanceXML(xml, ordinance.name, districtName)

      // Generate markdown
      const markdown = generateMarkdown(parsed)

      // Save
      const { exists, filepath } = await saveOrdinance(parsed, markdown)

      if (exists) {
        console.log(`    ⏩ Already exists`)
        stats.skipped++
        districtSkipped++
      } else {
        console.log(`    ✅ Downloaded (${parsed.articleCount} articles)`)
        stats.downloaded++
        districtDownloaded++
      }

      // Delay
      if (i < ordinances.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, DELAY))
      }
    } catch (error) {
      console.error(`    ❌ Error: ${error.message}`)
      stats.errors++
      districtErrors++
    }
  }

  console.log(`\n  📊 ${districtName} Summary:`)
  console.log(`     Total: ${ordinances.length}`)
  console.log(`     ✅ Downloaded: ${districtDownloaded}`)
  console.log(`     ⏩ Skipped: ${districtSkipped}`)
  console.log(`     ❌ Errors: ${districtErrors}`)

  stats.districts++
}

/**
 * Main
 */
async function main() {
  // Filter districts if specified
  let districtsToProcess = DISTRICTS
  if (DISTRICT_FILTER) {
    districtsToProcess = DISTRICTS.filter(d => d.name.includes(DISTRICT_FILTER))
    if (districtsToProcess.length === 0) {
      console.error(`❌ No district found matching: ${DISTRICT_FILTER}`)
      console.log('Available districts:', DISTRICTS.map(d => d.name).join(', '))
      process.exit(1)
    }
  }

  console.log('🚀 Downloading Seoul Ordinances\n')
  console.log(`📂 Directory: data/parsed-ordinances`)
  console.log(`⏱️  Delay: ${DELAY}ms between requests`)
  console.log(`🏙️  Districts: ${districtsToProcess.length}${DISTRICT_FILTER ? ` (filtered: ${DISTRICT_FILTER})` : ''}\n`)

  const startTime = Date.now()

  // Download each district
  for (const district of districtsToProcess) {
    await downloadDistrictOrdinances(district.code, district.name)

    // Delay between districts
    if (district !== districtsToProcess[districtsToProcess.length - 1]) {
      console.log(`\n⏸️  Waiting ${DELAY}ms before next district...`)
      await new Promise((resolve) => setTimeout(resolve, DELAY))
    }
  }

  const endTime = Date.now()
  const duration = ((endTime - startTime) / 1000 / 60).toFixed(1)

  console.log(`\n${'='.repeat(60)}`)
  console.log('\n📊 Final Results:')
  console.log(`   🏙️  Districts processed: ${stats.districts}`)
  console.log(`   📜 Total ordinances found: ${stats.totalOrdinances}`)
  console.log(`   ✅ Downloaded: ${stats.downloaded}`)
  console.log(`   ⏩ Skipped (already exists): ${stats.skipped}`)
  console.log(`   ❌ Errors: ${stats.errors}`)
  console.log(`   ⏱️  Duration: ${duration} minutes`)

  console.log('\n✨ Download complete!')
  console.log('\n📌 Next steps:')
  console.log('   1. Check files: ls data/parsed-ordinances')
  console.log('   2. Build embeddings: npm run build-ordinance-embeddings')
  console.log('   3. Test RAG: "광진구 청년 일자리 조례 알려줘"')
}

main().catch(console.error)
