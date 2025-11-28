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
 * Fetch admin rule content (XML - same as /api/admrul)
 */
async function fetchAdminRuleXML(id: string) {
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
 * Parse admin rule XML (server-side with @xmldom/xmldom)
 */
function parseAdminRuleXML(xml: string, ruleName: string, lawName: string) {
  const { DOMParser } = require('@xmldom/xmldom')
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'text/xml')

  // AdmRulService 구조
  const serviceNode = doc.getElementsByTagName('AdmRulService')[0]
  if (!serviceNode) {
    throw new Error('AdmRulService node not found')
  }

  const infoNode = serviceNode.getElementsByTagName('행정규칙기본정보')[0]
  if (!infoNode) {
    throw new Error('행정규칙기본정보 node not found')
  }

  // Extract basic info
  const getNodeText = (tagName: string) => {
    const nodes = infoNode.getElementsByTagName(tagName)
    return nodes.length > 0 ? nodes[0].textContent?.trim() || '' : ''
  }

  const ruleId = getNodeText('행정규칙ID') || 'unknown'
  const mst = getNodeText('행정규칙일련번호') || ''
  const name = getNodeText('행정규칙명') || ruleName
  const org = getNodeText('소관부처명')
  const ruleKind = getNodeText('행정규칙종류') || '행정규칙'
  const effectiveDate = getNodeText('시행일자')
  const publishDate = getNodeText('발령일자')
  const publishNumber = getNodeText('발령번호')
  const lastAmendmentDate = getNodeText('최종개정일자')

  // Extract articles from <조문> elements
  const joElements = serviceNode.getElementsByTagName('조문')
  const articles: any[] = []

  console.log(`[parseAdminRuleXML] Found ${joElements.length} 조문 elements`)

  // If no <조문> elements, try direct <조문내용> extraction
  if (joElements.length === 0) {
    console.log('[parseAdminRuleXML] No <조문> elements, trying direct <조문내용>')

    const contentNodes = serviceNode.getElementsByTagName('조문내용')
    console.log(`[parseAdminRuleXML] Found ${contentNodes.length} 조문내용 nodes`)

    for (let i = 0; i < contentNodes.length; i++) {
      const node = contentNodes[i]
      const text = node.textContent?.trim() || ''

      if (!text) {
        console.log(`[parseAdminRuleXML] Content node ${i} is empty`)
        continue
      }

      console.log(`[parseAdminRuleXML] Content node ${i} preview:`, text.substring(0, 100))

      // Extract article pattern: 제N조(제목) 본문...
      const match = text.match(/^(제\d+조(?:의\d+)?)\s*(?:\(([^)]+)\))?\s*([\s\S]*)/)
      if (match) {
        const displayNumber = match[1]
        const title = match[2] || ''
        const content = match[3].trim()

        console.log(`[parseAdminRuleXML] Parsed: ${displayNumber} (${title}) - ${content.length} chars`)

        articles.push({
          displayNumber,
          title,
          content,
          articleNumber: displayNumber.replace(/제(\d+)조.*/, '$1'),
          branchNumber: '00'
        })
      } else {
        console.log(`[parseAdminRuleXML] Node ${i} does not match article pattern`)
      }
    }
  } else {
    // Has <조문> elements
    for (let i = 0; i < joElements.length; i++) {
      const joElement = joElements[i]

      const joNumNode = joElement.getElementsByTagName('조문번호')[0]
      const joTitleNode = joElement.getElementsByTagName('조문제목')[0]
      const joContentNode = joElement.getElementsByTagName('조문내용')[0]

      const joNum = joNumNode?.textContent?.trim() || ''
      const joTitle = joTitleNode?.textContent?.trim() || ''
      const joContent = joContentNode?.textContent?.trim() || ''

      if (!joContent) {
        console.log(`[parseAdminRuleXML] Skipping article ${i + 1} - no content`)
        continue
      }

      // Extract display number (제N조) from content
      let displayNumber = joNum || ''
      const displayMatch = joContent.match(/^(제\d+조(?:의\d+)?)/)
      if (displayMatch) {
        displayNumber = displayMatch[1]
      } else if (joNum) {
        // Try to format joNum
        displayNumber = `제${joNum}조`
      }

      // Extract title from content if not in joTitle
      let title = joTitle
      if (!title) {
        const titleMatch = joContent.match(/^제\d+조(?:의\d+)?\s*\(([^)]+)\)/)
        if (titleMatch) {
          title = titleMatch[1]
        }
      }

      // Remove "제N조(제목)" prefix from content
      let content = joContent
      const prefixMatch = content.match(/^(제\d+조(?:의\d+)?(?:\s*\([^)]+\))?\s*)/)
      if (prefixMatch) {
        content = content.substring(prefixMatch[0].length).trim()
      }

      console.log(`[parseAdminRuleXML] Article ${i + 1}: ${displayNumber} (${title}) - ${content.length} chars`)

      articles.push({
        displayNumber,
        title,
        content,
        articleNumber: displayNumber.replace(/제(\d+)조.*/, '$1'),
        branchNumber: '00'
      })
    }
  }

  console.log(`[parseAdminRuleXML] Total articles parsed: ${articles.length}`)

  return {
    ruleId,
    mst,
    ruleName: name,
    lawName,
    organization: org,
    ruleKind,
    effectiveDate,
    publishDate,
    publishNumber,
    lastAmendmentDate,
    url: mst ? `https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq=${mst}` : '',
    articleCount: articles.length,
    totalCharacters: articles.reduce((sum: number, a: any) => sum + a.content.length, 0),
    articles
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
 * Parse article content into structured paragraphs (항) and items (호)
 */
function parseArticleStructure(content: string): { plainContent: string; paragraphs: any[] } {
  if (!content) return { plainContent: '', paragraphs: [] }

  // Check if content has 항 (①②③) or 호 (1.2.3.)
  const has항 = /[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]/.test(content)
  const has호 = /\d+\./.test(content)

  if (!has항 && !has호) {
    // No structure, return as plain content
    return { plainContent: content, paragraphs: [] }
  }

  const paragraphs: any[] = []
  let plainContent = ''

  // Split by 항 (①②③...)
  const 항Regex = /([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮])/g
  const parts = content.split(항Regex).filter(Boolean)

  if (parts.length === 1 && !has항) {
    // No 항, only 호
    const items = parseItems(content)
    if (items.length > 0) {
      // Extract content before first item (호)
      const firstItemMatch = content.match(/\d+\./)
      if (firstItemMatch && firstItemMatch.index! > 0) {
        const beforeItems = content.substring(0, firstItemMatch.index).trim()
        paragraphs.push({ num: '', content: beforeItems, items })
      } else {
        // No content before first item
        paragraphs.push({ num: '', content: '', items })
      }
    } else {
      plainContent = content
    }
  } else {
    // Has 항
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim()
      if (!part) continue

      // Check if this is a 항 marker
      if (/^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]$/.test(part)) {
        // Next part is the content
        if (i + 1 < parts.length) {
          const paraContent = parts[i + 1].trim()
          const items = parseItems(paraContent)

          if (items.length > 0) {
            // Has items (호) - split content before first item
            const firstItemMatch = paraContent.match(/\d+\./)
            if (firstItemMatch && firstItemMatch.index! > 0) {
              const beforeItems = paraContent.substring(0, firstItemMatch.index).trim()
              paragraphs.push({ num: part, content: beforeItems, items })
            } else {
              paragraphs.push({ num: part, content: '', items })
            }
          } else {
            paragraphs.push({ num: part, content: paraContent, items: [] })
          }
          i++ // Skip next part (already processed)
        }
      } else if (i === 0) {
        // Content before first 항
        plainContent = part
      }
    }
  }

  return { plainContent, paragraphs }
}

/**
 * Parse items (호) from content - extracts "1. xxx", "2. xxx", etc.
 */
function parseItems(content: string): Array<{ num: string; content: string }> {
  const items: Array<{ num: string; content: string }> = []

  // Match: "1. xxx" or "1.xxx" (may or may not have space after dot)
  const itemRegex = /(\d+)\.\s*/g
  const matches = Array.from(content.matchAll(itemRegex))

  if (matches.length === 0) return []

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]
    const num = `${match[1]}.`
    const startIdx = match.index! + match[0].length

    // Find content until next item or end
    const endIdx = i < matches.length - 1 ? matches[i + 1].index! : content.length
    const itemContent = content.substring(startIdx, endIdx).trim()

    if (itemContent) {
      items.push({ num, content: itemContent })
    }
  }

  return items
}

/**
 * Generate markdown (with per-article metadata like laws/ordinances)
 */
function generateMarkdown(parsed: any): string {
  let md = `# ${parsed.ruleName}\n\n`
  md += `**법령종류**: ${parsed.ruleKind}\n`
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

  if (parsed.lastAmendmentDate) {
    md += `**최종개정일**: ${formatDate(parsed.lastAmendmentDate)}\n`
  }

  md += `**조문 수**: ${parsed.articleCount}개\n`

  if (parsed.url) {
    md += `**URL**: ${parsed.url}\n`
  }

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

    // Parse structure (항/호) from content
    const { plainContent, paragraphs } = parseArticleStructure(article.content)

    if (plainContent) {
      md += `${plainContent}\n\n`
    }

    if (paragraphs.length > 0) {
      for (const para of paragraphs) {
        // If no 항 number (virtual paragraph for items-only case)
        if (!para.num) {
          // Render content before items (if any)
          if (para.content) {
            md += `${para.content}\n`
          }
          // Render items directly
          for (const item of para.items) {
            md += `${item.num} ${item.content}\n`
          }
        } else {
          // Has 항 number
          md += `${para.num} `

          // Paragraph content (if no items)
          if (!para.items || para.items.length === 0) {
            md += `${para.content}\n`
          } else {
            // Paragraph has items (호)
            if (para.content) {
              md += `${para.content}\n`
            } else {
              md += `\n`
            }

            // Render items
            for (const item of para.items) {
              md += `  ${item.num} ${item.content}\n`
            }
          }
        }
      }

      md += `\n`
    } else if (!plainContent) {
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

    // Fetch content (XML)
    const xml = await fetchAdminRuleXML(idParam)

    if (!xml) {
      return NextResponse.json({
        success: false,
        notFound: true,
        message: `${name}을(를) 가져올 수 없습니다`
      })
    }

    // Parse XML
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
