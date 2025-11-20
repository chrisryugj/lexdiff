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
 * Parse admin rule XML (using DOMParser like frontend)
 */
function parseAdminRuleXML(xml: string, ruleName: string, lawName: string) {
  try {
    const { DOMParser } = require('@xmldom/xmldom')
    const parser = new DOMParser()
    const doc = parser.parseFromString(xml, 'text/xml')

    // AdmRulService 구조
    const serviceNode = doc.getElementsByTagName('AdmRulService')[0]
    if (!serviceNode) {
      console.error('[parseAdminRuleXML] AdmRulService node not found')
      console.error('[parseAdminRuleXML] XML preview:', xml.substring(0, 500))
      throw new Error('AdmRulService node not found')
    }

    const infoNode = serviceNode.getElementsByTagName('행정규칙기본정보')[0]
    if (!infoNode) {
      console.error('[parseAdminRuleXML] 행정규칙기본정보 node not found')
      throw new Error('행정규칙기본정보 node not found')
    }

    // Basic info (getElementsByTagName returns HTMLCollection, need [0])
    const nameNodes = infoNode.getElementsByTagName('행정규칙명')
    const idNodes = infoNode.getElementsByTagName('행정규칙ID')
    const orgNodes = infoNode.getElementsByTagName('소관부처명')
    const effectiveDateNodes = infoNode.getElementsByTagName('시행일자')
    const publishDateNodes = infoNode.getElementsByTagName('발령일자')
    const publishNumberNodes = infoNode.getElementsByTagName('발령번호')

    const nameNode = nameNodes.length > 0 ? nameNodes[0] : null
    const idNode = idNodes.length > 0 ? idNodes[0] : null
    const orgNode = orgNodes.length > 0 ? orgNodes[0] : null
    const effectiveDateNode = effectiveDateNodes.length > 0 ? effectiveDateNodes[0] : null
    const publishDateNode = publishDateNodes.length > 0 ? publishDateNodes[0] : null
    const publishNumberNode = publishNumberNodes.length > 0 ? publishNumberNodes[0] : null

    const ruleId = idNode?.textContent?.trim() || 'unknown'
    const name = nameNode?.textContent?.trim() || ruleName
    const org = orgNode?.textContent?.trim() || ''
    const effectiveDate = effectiveDateNode?.textContent?.trim() || ''
    const publishDate = publishDateNode?.textContent?.trim() || ''
    const publishNumber = publishNumberNode?.textContent?.trim() || ''

    // 조문내용 노드들 (각 <조문내용>이 이미 조문별로 분리되어 있음)
    const contentNodes = Array.from(serviceNode.getElementsByTagName('조문내용'))
    const articles: any[] = []

    console.log(`[parseAdminRuleXML] Found ${contentNodes.length} 조문내용 nodes`)

    contentNodes.forEach((node: any, index: number) => {
      const text = node.textContent?.trim()
      if (!text) {
        console.log(`[parseAdminRuleXML] Node ${index} is empty`)
        return
      }

      console.log(`[parseAdminRuleXML] Node ${index} preview:`, text.substring(0, 100))

      // 각 조문내용에서 제N조 패턴 추출
      const match = text.match(/^(제\d+조(?:의\d+)?)\s*(?:\(([^)]+)\))?\s*([\s\S]*)/)

      if (match) {
        const displayNumber = match[1] // "제1조"
        const title = match[2] || '' // "목적"
        const content = match[3].trim() // 나머지 모든 내용

        articles.push({
          displayNumber,
          title,
          content
        })
        console.log(`[parseAdminRuleXML] Parsed article: ${displayNumber} (${title})`)
      } else {
        console.log(`[parseAdminRuleXML] Node ${index} does not match article pattern`)
      }
    })

    console.log(`[parseAdminRuleXML] Total articles parsed: ${articles.length}`)

    // If no articles found, try to get full text content
    if (articles.length === 0) {
      console.log('[parseAdminRuleXML] No articles found, extracting full text content')

      // Try to get all text content from service node
      const allTextNodes = serviceNode.getElementsByTagName('*')
      let fullText = ''

      for (let i = 0; i < allTextNodes.length; i++) {
        const tagName = allTextNodes[i].tagName
        // Skip metadata tags, only get content tags
        if (tagName === '조문내용' || tagName === '본문내용' || tagName === '내용') {
          const text = allTextNodes[i].textContent?.trim()
          if (text && text.length > 10) {
            fullText += text + '\n\n'
          }
        }
      }

      if (fullText.trim()) {
        console.log(`[parseAdminRuleXML] Found full text: ${fullText.length} chars`)
        articles.push({
          displayNumber: '전문',
          title: '전체 내용',
          content: fullText.trim()
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

    md += `\n## ${article.displayNumber}`
    if (article.title) {
      md += ` (${article.title})`
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

    // Create subfolder for each law (sanitize law name for filesystem)
    const sanitizedLawName = lawName.replace(/[<>:"/\\|?*]/g, '_')
    const fileName = `${name}.md`
    const filePath = path.join(process.cwd(), 'data', 'parsed-admin-rules', sanitizedLawName, fileName)

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
