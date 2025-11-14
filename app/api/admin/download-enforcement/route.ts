/**
 * Download Enforcement Decree/Rule API
 * POST /api/admin/download-enforcement
 */

import { NextRequest, NextResponse } from 'next/server'
import { saveParsedLaw } from '@/lib/file-storage'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LAW_OC = process.env.LAW_OC

interface DownloadRequest {
  lawName: string
  type: '시행령' | '시행규칙'
}

/**
 * Search law by name
 */
async function searchLaw(lawName: string) {
  const params = new URLSearchParams({
    OC: LAW_OC!,
    type: 'XML',
    target: 'law',
    query: lawName
  })

  const url = `https://www.law.go.kr/DRF/lawSearch.do?${params.toString()}`

  const response = await fetch(url)
  const xml = await response.text()

  if (!response.ok) {
    return null
  }

  // Parse XML to find MST
  const mstMatch = xml.match(/<법령일련번호>(\d+)<\/법령일련번호>/)
  const idMatch = xml.match(/<법령ID>(\d+)<\/법령ID>/)
  const nameMatch = xml.match(/<법령명한글>([^<]+)<\/법령명한글>/)

  const mst = mstMatch ? mstMatch[1] : idMatch ? idMatch[1] : null

  if (!mst) {
    return null
  }

  return {
    lawId: mst,
    lawName: nameMatch ? nameMatch[1] : lawName
  }
}

/**
 * Fetch law content
 */
async function fetchLawContent(lawId: string) {
  const params = new URLSearchParams({
    target: 'eflaw',
    OC: LAW_OC!,
    type: 'JSON',
    MST: lawId
  })

  const url = `https://www.law.go.kr/DRF/lawService.do?${params.toString()}`

  const response = await fetch(url)
  const text = await response.text()

  if (!response.ok || text.includes('<!DOCTYPE html')) {
    return null
  }

  return JSON.parse(text)
}

/**
 * Parse law JSON
 */
function parseLawJSON(jsonData: any) {
  const lawData = jsonData.법령

  if (!lawData) {
    throw new Error('법령 데이터가 없습니다')
  }

  const basicInfo = lawData.기본정보 || lawData
  const lawId = basicInfo.법령ID || basicInfo.법령키 || 'unknown'
  const lawName = basicInfo.법령명_한글 || basicInfo.법령명한글 || basicInfo.법령명 || '제목 없음'
  const effectiveDate = basicInfo.최종시행일자 || basicInfo.시행일자 || ''
  const promulgationDate = basicInfo.공포일자 || ''
  const promulgationNumber = basicInfo.공포번호 || ''
  const revisionType = basicInfo.제개정구분명 || basicInfo.제개정구분 || ''

  const articles: any[] = []
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
    articleCount: articles.length,
    totalCharacters: articles.reduce((sum, a) => sum + a.content.length, 0),
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
 * Generate markdown
 */
function generateMarkdown(parsed: any): string {
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

  md += `**조문 수**: ${parsed.articleCount}개\n`
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

export async function POST(request: NextRequest) {
  try {
    const body: DownloadRequest = await request.json()
    const { lawName, type } = body

    if (!lawName || !type) {
      return NextResponse.json({ success: false, error: 'lawName과 type이 필요합니다' }, { status: 400 })
    }

    if (!LAW_OC) {
      return NextResponse.json({ success: false, error: 'LAW_OC 환경변수가 설정되지 않았습니다' }, { status: 500 })
    }

    const searchName = `${lawName} ${type}`
    const fileName = `${searchName}.md`
    const filePath = path.join(process.cwd(), 'data', 'parsed-laws', fileName)

    // Check if already exists
    if (fs.existsSync(filePath)) {
      return NextResponse.json({
        success: true,
        skipped: true,
        message: `${searchName}은(는) 이미 존재합니다`
      })
    }

    console.log(`[Download Enforcement] Searching: ${searchName}`)

    // Step 1: Search
    const searchResult = await searchLaw(searchName)

    if (!searchResult) {
      return NextResponse.json({
        success: false,
        notFound: true,
        message: `${searchName}을(를) 찾을 수 없습니다`
      })
    }

    console.log(`[Download Enforcement] Found: ${searchResult.lawName} (${searchResult.lawId})`)

    // Step 2: Fetch content
    const content = await fetchLawContent(searchResult.lawId)

    if (!content) {
      return NextResponse.json({
        success: false,
        fetchFailed: true,
        error: '법령 내용을 가져올 수 없습니다'
      })
    }

    // Step 3: Parse
    const parsed = parseLawJSON(content)

    // Step 4: Generate markdown
    const markdown = generateMarkdown(parsed)

    // Step 5: Save using existing saveParsedLaw (auto-converts to structured)
    await saveParsedLaw(parsed.lawId, markdown, {
      lawId: parsed.lawId,
      lawName: parsed.lawName,
      effectiveDate: parsed.effectiveDate,
      promulgationDate: parsed.promulgationDate,
      promulgationNumber: parsed.promulgationNumber,
      revisionType: parsed.revisionType,
      articleCount: parsed.articleCount,
      totalCharacters: parsed.totalCharacters,
      fetchedAt: new Date().toISOString()
    })

    console.log(`[Download Enforcement] ✅ Downloaded: ${parsed.lawName} (${parsed.articleCount} articles)`)

    return NextResponse.json({
      success: true,
      lawName: parsed.lawName,
      articleCount: parsed.articleCount
    })
  } catch (error: any) {
    console.error('[Download Enforcement] Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || '다운로드 중 오류가 발생했습니다'
      },
      { status: 500 }
    )
  }
}
