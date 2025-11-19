/**
 * Download Ordinances API
 * POST /api/admin/download-ordinances
 * Downloads ordinances for a specific district
 */

import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes

const LAW_OC = process.env.LAW_OC

interface DownloadRequest {
  districtCode: string
  districtName: string
  delay?: number
}

/**
 * Extract district name from organization name
 */
function extractDistrictFromOrgName(orgName: string): string {
  if (!orgName) return ''

  // Remove "서울특별시" prefix
  let extracted = orgName.replace(/^서울특별시\s*/, '').trim()

  // If nothing left, it's city-level (본청)
  if (!extracted) {
    return '서울특별시'
  }

  return extracted
}

/**
 * Search ordinances for a district
 */
async function searchOrdinances(districtCode: string, districtName: string) {
  try {
    const params = new URLSearchParams({
      target: 'ordin',
      OC: LAW_OC!,
      type: 'XML',
      display: '100',
      orgnCd: districtCode
    })

    const url = `https://www.law.go.kr/DRF/lawSearch.do?${params.toString()}`
    const response = await fetch(url)
    const xml = await response.text()

    if (!response.ok) {
      return []
    }

    const allOrdinances: Array<{ id: string; name: string; kind: string }> = []
    const lawMatches = xml.matchAll(/<자치법규>([\s\S]*?)<\/자치법규>/g)

    for (const match of lawMatches) {
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

      if (id && name && kind && (kind === '조례' || kind === '규칙')) {
        const extractedDistrict = extractDistrictFromOrgName(orgName)
        if (extractedDistrict === districtName) {
          allOrdinances.push({ id, name, kind })
        }
      }
    }

    return allOrdinances
  } catch (error: any) {
    console.error(`[Download Ordinances] Search error: ${error.message}`)
    return []
  }
}

/**
 * Fetch ordinance content
 */
async function fetchOrdinanceContent(ordinId: string) {
  try {
    const params = new URLSearchParams({
      target: 'ordin',
      OC: LAW_OC!,
      type: 'XML',
      MST: ordinId
    })

    const url = `https://www.law.go.kr/DRF/lawService.do?${params.toString()}`
    const response = await fetch(url)
    const xml = await response.text()

    if (!response.ok || xml.includes('<!DOCTYPE html')) {
      return null
    }

    return xml
  } catch (error) {
    return null
  }
}

/**
 * Parse ordinance XML
 */
function parseOrdinanceXML(xml: string, ordinanceName: string, districtName: string) {
  try {
    const ordinIdMatch = xml.match(/<자치법규ID>(\d+)<\/자치법규ID>/)
    const effectiveDateMatch = xml.match(/<시행일자>(\d+)<\/시행일자>/)
    const promulgationDateMatch = xml.match(/<공포일자>(\d+)<\/공포일자>/)
    const promulgationNumberMatch = xml.match(/<공포번호>([^<]+)<\/공포번호>/)

    const ordinId = ordinIdMatch ? ordinIdMatch[1] : 'unknown'
    const effectiveDate = effectiveDateMatch ? effectiveDateMatch[1] : ''
    const promulgationDate = promulgationDateMatch ? promulgationDateMatch[1] : ''
    const promulgationNumber = promulgationNumberMatch ? promulgationNumberMatch[1] : ''

    const articles: any[] = []
    const articleMatches = xml.matchAll(/<조[^>]*>([\s\S]*?)<\/조>/g)

    for (const match of articleMatches) {
      const articleXml = match[1]

      const articleNumMatch = articleXml.match(/<조문번호>(\d+)<\/조문번호>/)
      const titleMatch = articleXml.match(/<조제목>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/조제목>/)
      const contentMatch = articleXml.match(/<조내용>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/조내용>/)

      if (articleNumMatch) {
        const articleNum = articleNumMatch[1]

        if (articleNum === '000000') continue

        const title = titleMatch ? titleMatch[1].trim() : ''
        let content = contentMatch ? contentMatch[1] : ''

        content = content
          .replace(/<[^>]+>/g, '')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .trim()

        const joNum = Math.floor(parseInt(articleNum) / 100)
        const jiBranch = parseInt(articleNum) % 100

        let displayNumber
        if (jiBranch === 0) {
          displayNumber = `제${joNum}조`
        } else {
          displayNumber = `제${joNum}조의${jiBranch}`
        }

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
      articles
    }
  } catch (error: any) {
    throw new Error(`Parse failed: ${error.message}`)
  }
}

/**
 * Format date
 */
function formatDate(dateStr: string) {
  if (!dateStr || dateStr.length !== 8) return dateStr

  const year = dateStr.substring(0, 4)
  const month = dateStr.substring(4, 6)
  const day = dateStr.substring(6, 8)

  return `${year}년 ${parseInt(month)}월 ${parseInt(day)}일`
}

/**
 * Generate markdown with per-article metadata
 */
function generateMarkdown(parsed: any): string {
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

  // Each article with metadata (for chunking resilience)
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

export async function POST(request: NextRequest) {
  try {
    const body: DownloadRequest = await request.json()
    const { districtCode, districtName, delay = 1000 } = body

    if (!districtCode || !districtName) {
      return NextResponse.json({ success: false, error: 'districtCode와 districtName이 필요합니다' }, { status: 400 })
    }

    if (!LAW_OC) {
      return NextResponse.json({ success: false, error: 'LAW_OC 환경변수가 설정되지 않았습니다' }, { status: 500 })
    }

    console.log(`[Download Ordinances] Starting: ${districtName} (${districtCode})`)

    // 1. Search ordinances
    const ordinances = await searchOrdinances(districtCode, districtName)

    if (ordinances.length === 0) {
      return NextResponse.json({
        success: true,
        ordinanceCount: 0,
        message: `${districtName}에서 조례를 찾을 수 없습니다`
      })
    }

    console.log(`[Download Ordinances] Found ${ordinances.length} ordinances`)

    // Create directory
    const districtDir = path.join(process.cwd(), 'data', 'parsed-ordinances', districtName)
    if (!fs.existsSync(districtDir)) {
      fs.mkdirSync(districtDir, { recursive: true })
    }

    // 2. Download each ordinance
    let successCount = 0
    let skipCount = 0
    let errorCount = 0

    for (const ordinance of ordinances) {
      try {
        // Sanitize filename
        const sanitized = ordinance.name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_').substring(0, 200)
        const filename = `${sanitized}.md`
        const filepath = path.join(districtDir, filename)

        // Skip if exists
        if (fs.existsSync(filepath)) {
          skipCount++
          continue
        }

        // Fetch content
        const xml = await fetchOrdinanceContent(ordinance.id)

        if (!xml) {
          errorCount++
          continue
        }

        // Parse
        const parsed = parseOrdinanceXML(xml, ordinance.name, districtName)

        // Generate markdown
        const markdown = generateMarkdown(parsed)

        // Save file
        fs.writeFileSync(filepath, markdown, 'utf-8')

        successCount++

        // Delay between requests
        await new Promise((resolve) => setTimeout(resolve, delay))
      } catch (error: any) {
        console.error(`[Download Ordinances] Error downloading ${ordinance.name}:`, error)
        errorCount++
      }
    }

    console.log(
      `[Download Ordinances] ✅ Completed: ${districtName} - ${successCount} downloaded, ${skipCount} skipped, ${errorCount} errors`
    )

    return NextResponse.json({
      success: true,
      ordinanceCount: successCount,
      skippedCount: skipCount,
      errorCount: errorCount,
      totalFound: ordinances.length
    })
  } catch (error: any) {
    console.error('[Download Ordinances] Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || '다운로드 중 오류가 발생했습니다'
      },
      { status: 500 }
    )
  }
}
