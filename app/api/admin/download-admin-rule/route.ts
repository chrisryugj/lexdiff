/**
 * Download Admin Rule API
 * POST /api/admin/download-admin-rule
 */

import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LAW_OC = process.env.LAW_OC

interface DownloadRequest {
  id: string
  serialNumber?: string
  name: string
  lawName: string
}

/**
 * Fetch admin rule content
 */
async function fetchAdminRule(id: string) {
  try {
    const params = new URLSearchParams({
      target: 'admrul',
      OC: LAW_OC!,
      type: 'XML',
      ID: id
    })

    const url = `https://www.law.go.kr/DRF/lawService.do?${params.toString()}`

    const response = await fetch(url, {
      next: { revalidate: 86400 } // 24 hour cache
    })

    const xml = await response.text()

    if (!response.ok || xml.includes('<!DOCTYPE html')) {
      return null
    }

    return xml
  } catch (error) {
    console.error(`Fetch error: ${error}`)
    return null
  }
}

/**
 * Parse admin rule XML
 */
function parseAdminRuleXML(xml: string, ruleName: string, lawName: string) {
  try {
    // Basic info
    const idMatch = xml.match(/<행정규칙ID>(\d+)<\/행정규칙ID>/)
    const nameMatch = xml.match(/<행정규칙명>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/행정규칙명>/)
    const orgMatch = xml.match(/<소관부처>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/소관부처>/)
    const effectiveDateMatch = xml.match(/<시행일자>(\d+)<\/시행일자>/)
    const publishDateMatch = xml.match(/<발령일자>(\d+)<\/발령일자>/)
    const publishNumberMatch = xml.match(/<발령번호>([^<]+)<\/발령번호>/)

    const ruleId = idMatch ? idMatch[1] : 'unknown'
    const name = nameMatch ? nameMatch[1] : ruleName
    const org = orgMatch ? orgMatch[1] : ''
    const effectiveDate = effectiveDateMatch ? effectiveDateMatch[1] : ''
    const publishDate = publishDateMatch ? publishDateMatch[1] : ''
    const publishNumber = publishNumberMatch ? publishNumberMatch[1] : ''

    // Articles - similar to ordinance parsing
    const articles: any[] = []
    const articleMatches = xml.matchAll(/<조[^>]*>([\s\S]*?)<\/조>/g)

    for (const match of articleMatches) {
      const articleXml = match[1]

      const articleNumMatch = articleXml.match(/<조문번호>(\d+)<\/조문번호>/)
      const titleMatch = articleXml.match(/<조문제목>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/조문제목>/)
      const contentMatch = articleXml.match(/<조문내용>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/조문내용>/)

      if (articleNumMatch) {
        const articleNum = articleNumMatch[1]

        // Skip 제0조
        if (articleNum === '000000') {
          continue
        }

        const title = titleMatch ? titleMatch[1].trim() : ''
        let content = contentMatch ? contentMatch[1] : ''

        // Clean content
        content = content
          .replace(/<[^>]+>/g, '')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .trim()

        // Convert 6-digit number
        const joNum = Math.floor(parseInt(articleNum) / 100)
        const jiBranch = parseInt(articleNum) % 100

        let displayNumber
        if (jiBranch === 0) {
          displayNumber = `제${joNum}조`
        } else {
          displayNumber = `제${joNum}조의${jiBranch}`
        }

        // Remove title duplication
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
      ruleId,
      ruleName: name,
      lawName,
      organization: org,
      effectiveDate,
      publishDate,
      publishNumber,
      articleCount: articles.length,
      totalCharacters: articles.reduce((sum: number, a: any) => sum + a.content.length, 0),
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
 * Generate markdown (with per-article metadata like laws/ordinances)
 */
function generateMarkdown(parsed: any): string {
  let md = `# ${parsed.ruleName}\n\n`
  md += `**상위 법령**: ${parsed.lawName}\n`
  md += `**행정규칙 ID**: ${parsed.ruleId}\n`

  if (parsed.organization) {
    md += `**소관부처**: ${parsed.organization}\n`
  }

  if (parsed.effectiveDate) {
    md += `**시행일**: ${formatDate(parsed.effectiveDate)}\n`
  }

  if (parsed.publishDate) {
    md += `**발령일**: ${formatDate(parsed.publishDate)}`
    if (parsed.publishNumber) {
      md += ` (${parsed.publishNumber})`
    }
    md += `\n`
  }

  md += `**조문 수**: ${parsed.articleCount}개\n`
  md += `\n---\n\n`

  // Each article with metadata (for chunking resilience)
  for (const article of parsed.articles) {
    md += `\n---\n`
    md += `**행정규칙명**: ${parsed.ruleName}\n`
    md += `**행정규칙ID**: ${parsed.ruleId}\n`
    md += `**상위 법령**: ${parsed.lawName}\n`
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
    const { id, serialNumber, name, lawName } = body

    if (!id || !name || !lawName) {
      return NextResponse.json(
        { success: false, error: 'id, name, lawName이 필요합니다' },
        { status: 400 }
      )
    }

    if (!LAW_OC) {
      return NextResponse.json(
        { success: false, error: 'LAW_OC 환경변수가 설정되지 않았습니다' },
        { status: 500 }
      )
    }

    const fileName = `${name}.md`
    const filePath = path.join(process.cwd(), 'data', 'parsed-admin-rules', fileName)

    // Create directory if not exists
    const dirPath = path.dirname(filePath)
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true })
    }

    // Check if already exists
    if (fs.existsSync(filePath)) {
      return NextResponse.json({
        success: true,
        skipped: true,
        message: `${name}은(는) 이미 존재합니다`
      })
    }

    console.log(`[Download Admin Rule] Fetching: ${name}`)

    // Use serialNumber if available, otherwise id
    const idParam = serialNumber || id

    // Fetch content
    const xml = await fetchAdminRule(idParam)

    if (!xml) {
      return NextResponse.json({
        success: false,
        notFound: true,
        message: `${name}을(를) 가져올 수 없습니다`
      })
    }

    // Parse
    const parsed = parseAdminRuleXML(xml, name, lawName)

    // Generate markdown
    const markdown = generateMarkdown(parsed)

    // Save file
    fs.writeFileSync(filePath, markdown, 'utf8')

    console.log(`[Download Admin Rule] ✅ Downloaded: ${parsed.ruleName} (${parsed.articleCount} articles)`)

    return NextResponse.json({
      success: true,
      ruleName: parsed.ruleName,
      articleCount: parsed.articleCount
    })
  } catch (error: any) {
    console.error('[Download Admin Rule] Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || '다운로드 중 오류가 발생했습니다'
      },
      { status: 500 }
    )
  }
}
