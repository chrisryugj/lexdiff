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
    // Use district name as search query since orgnCd doesn't filter properly
    // For Seoul districts, search with full name like "서울특별시 광진구"
    const searchQuery = districtName === '서울특별시' ? '서울특별시' : `서울특별시 ${districtName}`

    const allOrdinances: Array<{ id: string; name: string; kind: string }> = []
    const seenIds = new Set<string>()
    let page = 1
    let totalCnt = 0
    const pageSize = 100

    // Paginate through all results
    while (true) {
      const params = new URLSearchParams({
        target: 'ordin',
        OC: LAW_OC!,
        type: 'XML',
        display: String(pageSize),
        page: String(page),
        query: searchQuery,
        section: 'orgNm' // Search in organization name field
      })

      const url = `https://www.law.go.kr/DRF/lawSearch.do?${params.toString()}`
      const response = await fetch(url)
      const xml = await response.text()

      if (page === 1) {
        // Extract totalCnt from first page
        const totalCntMatch = xml.match(/<totalCnt>(\d+)<\/totalCnt>/)
        totalCnt = totalCntMatch ? parseInt(totalCntMatch[1]) : 0
      }

      if (!response.ok) {
        break
      }

      const lawMatches = xml.matchAll(/<law[^>]*>([\s\S]*?)<\/law>/g)
      let pageMatches = 0

      for (const match of lawMatches) {
        pageMatches++
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

        if (id && !seenIds.has(id) && name && kind && (kind === '조례' || kind === '규칙')) {
          const extractedDistrict = extractDistrictFromOrgName(orgName)

          // For 서울특별시 (city-level), only match exact "서울특별시" without district names
          // This excludes "서울특별시 광진구", "서울특별시교육청" etc.
          let isMatch = false
          if (districtName === '서울특별시') {
            // Must be exactly "서울특별시" or "서울특별시 본청" etc.
            // Exclude: 자치구(OO구), 교육청
            isMatch = orgName === '서울특별시' ||
                      (orgName.startsWith('서울특별시') &&
                       !/(구|군)$/.test(orgName.trim()) &&
                       !orgName.includes('교육청'))
          } else {
            // For districts, match exact district or if orgName contains the district name
            isMatch = extractedDistrict === districtName || orgName.includes(districtName)
          }

          if (isMatch) {
            seenIds.add(id)
            allOrdinances.push({ id, name, kind })
          }
        }
      }

      // Check if we've fetched all pages
      if (pageMatches < pageSize || page * pageSize >= totalCnt) {
        break
      }

      page++
      // Small delay between pages to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 200))
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
 * @param lawKindFromSearch - 검색 결과에서 가져온 법령종류 (조례/규칙)
 */
function parseOrdinanceXML(xml: string, ordinanceName: string, districtName: string, lawKindFromSearch: string) {
  try {
    const ordinIdMatch = xml.match(/<자치법규ID>(\d+)<\/자치법규ID>/)
    const mstMatch = xml.match(/<자치법규일련번호>(\d+)<\/자치법규일련번호>/)
    const effectiveDateMatch = xml.match(/<시행일자>(\d+)<\/시행일자>/)
    const promulgationDateMatch = xml.match(/<공포일자>(\d+)<\/공포일자>/)
    const promulgationNumberMatch = xml.match(/<공포번호>([^<]+)<\/공포번호>/)
    const lastAmendmentDateMatch = xml.match(/<최종개정일자>(\d+)<\/최종개정일자>/)

    const ordinId = ordinIdMatch ? ordinIdMatch[1] : 'unknown'
    const mst = mstMatch ? mstMatch[1] : ''
    const effectiveDate = effectiveDateMatch ? effectiveDateMatch[1] : ''
    const promulgationDate = promulgationDateMatch ? promulgationDateMatch[1] : ''
    const promulgationNumber = promulgationNumberMatch ? promulgationNumberMatch[1] : ''
    const lastAmendmentDate = lastAmendmentDateMatch ? lastAmendmentDateMatch[1] : ''
    // Use the kind from search results (already parsed as 조례/규칙)
    const lawKind = lawKindFromSearch || '조례'

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
      mst,
      ordinanceName,
      districtName,
      lawKind,
      effectiveDate,
      promulgationDate,
      promulgationNumber,
      lastAmendmentDate,
      url: mst ? `https://www.law.go.kr/LSW/ordinInfoP.do?ordinSeq=${mst}` : '',
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
  md += `**법령종류**: ${parsed.lawKind}\n`
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
  // Check if client wants SSE stream
  const isStreaming = request.headers.get('accept')?.includes('text/event-stream')

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
        skippedCount: 0,
        errorCount: 0,
        totalFound: 0,
        message: `${districtName}에서 조례를 찾을 수 없습니다`
      })
    }

    console.log(`[Download Ordinances] Found ${ordinances.length} ordinances`)

    // Create directory
    const districtDir = path.join(process.cwd(), 'data', 'parsed-ordinances', districtName)
    if (!fs.existsSync(districtDir)) {
      fs.mkdirSync(districtDir, { recursive: true })
    }

    // SSE streaming mode - allows abort
    if (isStreaming) {
      const encoder = new TextEncoder()
      let aborted = false

      const stream = new ReadableStream({
        async start(controller) {
          let successCount = 0
          let skipCount = 0
          let errorCount = 0
          const total = ordinances.length

          const sendEvent = (data: any) => {
            if (!aborted) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
            }
          }

          // Send initial info
          sendEvent({ type: 'start', total, districtName })

          for (let i = 0; i < ordinances.length && !aborted; i++) {
            const ordinance = ordinances[i]
            try {
              const sanitized = ordinance.name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_').substring(0, 200)
              const filename = `${sanitized}.md`
              const filepath = path.join(districtDir, filename)

              if (fs.existsSync(filepath)) {
                skipCount++
              } else {
                const xml = await fetchOrdinanceContent(ordinance.id)
                if (xml) {
                  const parsed = parseOrdinanceXML(xml, ordinance.name, districtName, ordinance.kind)
                  const markdown = generateMarkdown(parsed)
                  fs.writeFileSync(filepath, markdown, 'utf-8')
                  successCount++
                  await new Promise((resolve) => setTimeout(resolve, delay))
                } else {
                  errorCount++
                }
              }

              // Send progress every 10 items
              if ((i + 1) % 10 === 0 || i === ordinances.length - 1) {
                sendEvent({
                  type: 'progress',
                  processed: i + 1,
                  total,
                  successCount,
                  skipCount,
                  errorCount
                })
              }
            } catch (error) {
              errorCount++
            }
          }

          // Send final result
          sendEvent({
            type: 'complete',
            success: true,
            ordinanceCount: successCount,
            skippedCount: skipCount,
            errorCount,
            totalFound: total
          })

          console.log(`[${districtName}] ✅ 완료: 신규 ${successCount}, 스킵 ${skipCount}, 에러 ${errorCount} (총 ${total}개)`)
          controller.close()
        },
        cancel() {
          aborted = true
          console.log(`[${districtName}] ⛔ 클라이언트가 연결을 끊음 - 다운로드 중지`)
        }
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      })
    }

    // Non-streaming mode (legacy)
    let successCount = 0
    let skipCount = 0
    let errorCount = 0
    const total = ordinances.length
    let processed = 0

    for (const ordinance of ordinances) {
      processed++
      try {
        const sanitized = ordinance.name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_').substring(0, 200)
        const filename = `${sanitized}.md`
        const filepath = path.join(districtDir, filename)

        if (fs.existsSync(filepath)) {
          skipCount++
          if (processed % 50 === 0 || processed === total) {
            console.log(`[${districtName}] ${processed}/${total} (신규: ${successCount}, 스킵: ${skipCount}, 에러: ${errorCount})`)
          }
          continue
        }

        const xml = await fetchOrdinanceContent(ordinance.id)
        if (!xml) {
          errorCount++
          continue
        }

        const parsed = parseOrdinanceXML(xml, ordinance.name, districtName, ordinance.kind)
        const markdown = generateMarkdown(parsed)
        fs.writeFileSync(filepath, markdown, 'utf-8')
        successCount++

        if (successCount % 10 === 0 || processed === total) {
          console.log(`[${districtName}] ${processed}/${total} (신규: ${successCount}, 스킵: ${skipCount}, 에러: ${errorCount})`)
        }

        await new Promise((resolve) => setTimeout(resolve, delay))
      } catch (error: any) {
        console.error(`[${districtName}] Error: ${ordinance.name}`)
        errorCount++
      }
    }

    console.log(`[${districtName}] ✅ 완료: 신규 ${successCount}, 스킵 ${skipCount}, 에러 ${errorCount} (총 ${total}개)`)

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
