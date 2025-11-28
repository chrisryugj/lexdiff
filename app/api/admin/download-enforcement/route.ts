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
 * Extract content from 항 array (paragraph array)
 * CRITICAL: 항내용 없고 호만 있는 경우 처리
 */
function extractContentFromHangArray(hangArray: any[], articleNum?: string): string {
  let content = ''

  if (!Array.isArray(hangArray)) {
    if (articleNum === '55') {
      console.log('[DEBUG-EXTRACT] Article 55: hangArray is not an array!', typeof hangArray)
    }
    return content
  }

  // DEBUG: 제55조 항 구조 상세 로그
  if (articleNum === '55') {
    console.log('[DEBUG-EXTRACT] Article 55 hangArray structure:', {
      length: hangArray.length,
      firstHang_keys: hangArray[0] ? Object.keys(hangArray[0]) : null,
      firstHang_항내용: hangArray[0]?.항내용,
      firstHang_has호: !!hangArray[0]?.호,
      firstHang_호_type: typeof hangArray[0]?.호,
      firstHang_호_isArray: Array.isArray(hangArray[0]?.호),
      firstHang_호_length: hangArray[0]?.호?.length,
      firstHang_호_first: hangArray[0]?.호?.[0]
    })
  }

  // 먼저 항내용이 있는지 확인
  const hasHangContent = hangArray.some(hang => {
    const hangContent = hang.항내용
    if (!hangContent) return false

    // 배열인 경우
    if (Array.isArray(hangContent)) {
      return hangContent.some(c => c && c.trim())
    }
    // 문자열인 경우
    return hangContent.trim().length > 0
  })

  // 모든 호 수집
  const allItems = hangArray.flatMap(hang => {
    if (hang.호 && Array.isArray(hang.호)) {
      return hang.호
    }
    return []
  })

  if (articleNum === '55') {
    console.log('[DEBUG-EXTRACT] Article 55 parsing decision:', {
      hasHangContent,
      allItems_length: allItems.length,
      willUse: hasHangContent ? 'hang+ho logic' : (allItems.length > 0 ? 'ho only logic' : 'nothing')
    })
  }

  if (hasHangContent) {
    // 항내용이 있는 경우: 기존 로직
    for (const hang of hangArray) {
      if (hang.항내용) {
        let hangContent = hang.항내용
        if (Array.isArray(hangContent)) {
          hangContent = hangContent.join('\n')
        }
        content += '\n' + hangContent
      }

      if (hang.호 && Array.isArray(hang.호)) {
        for (const ho of hang.호) {
          if (ho.호내용) {
            let hoContent = ho.호내용
            if (Array.isArray(hoContent)) {
              hoContent = hoContent.join('\n')
            }
            content += '\n' + hoContent
          }

          if (ho.목 && Array.isArray(ho.목)) {
            for (const mok of ho.목) {
              if (mok.목내용) {
                let mokContent = mok.목내용
                if (Array.isArray(mokContent)) {
                  mokContent = mokContent.join('\n')
                }
                content += '\n  ' + mokContent
              }
            }
          }
        }
      }
    }
  } else if (allItems.length > 0) {
    // 항내용 없고 호만 있는 경우: 호만 추가
    for (const ho of allItems) {
      if (ho.호내용) {
        let hoContent = ho.호내용
        if (Array.isArray(hoContent)) {
          hoContent = hoContent.join('\n')
        }
        content += '\n' + hoContent
      }

      if (ho.목 && Array.isArray(ho.목)) {
        for (const mok of ho.목) {
          if (mok.목내용) {
            let mokContent = mok.목내용
            if (Array.isArray(mokContent)) {
              mokContent = mokContent.join('\n')
            }
            content += '\n  ' + mokContent
          }
        }
      }
    }
  }

  return content.trim()
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

  // Debug: log available metadata fields
  console.log('[parseLawJSON] Available basicInfo keys:', Object.keys(basicInfo))
  console.log('[parseLawJSON] 소관부처명:', basicInfo.소관부처명)
  console.log('[parseLawJSON] 소관부처:', basicInfo.소관부처)
  console.log('[parseLawJSON] 최종개정일자:', basicInfo.최종개정일자)
  console.log('[parseLawJSON] 법령일련번호:', basicInfo.법령일련번호)
  const lawId = basicInfo.법령ID || basicInfo.법령키 || 'unknown'
  const lawName = basicInfo.법령명_한글 || basicInfo.법령명한글 || basicInfo.법령명 || '제목 없음'
  const effectiveDate = basicInfo.최종시행일자 || basicInfo.시행일자 || ''
  const promulgationDate = basicInfo.공포일자 || ''
  const promulgationNumber = basicInfo.공포번호 || ''
  const revisionType = basicInfo.제개정구분명 || basicInfo.제개정구분 || ''

  // 소관부처 - 객체 또는 문자열 처리
  // API returns: { content: '법제처', 소관부처코드: '1170000' }
  let ministry = ''
  const rawMinistry = basicInfo.소관부처명 || basicInfo.소관부처
  if (typeof rawMinistry === 'string') {
    ministry = rawMinistry
  } else if (rawMinistry && typeof rawMinistry === 'object') {
    ministry = rawMinistry.content || rawMinistry.소관부처명 || rawMinistry['#text'] || ''
  }

  const lastAmendmentDate = basicInfo.최종개정일자 || ''
  const mst = basicInfo.법령일련번호 || basicInfo.법령MST || ''

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

    // STEP 1: 본문 추출 (조문내용)
    // CRITICAL: 제목 부분 제거 (마크다운 헤더에 이미 포함됨)
    let mainContent = ''
    if (unit.조문내용 && typeof unit.조문내용 === 'string') {
      let rawContent = unit.조문내용.trim()

      // 제목 패턴: 제X조(제목) 또는 제X조의Y(제목)
      const headerMatch = rawContent.match(/^(제\d+조(?:의\d+)?\s*(?:\([^)]+\))?)[\s\S]*/)

      if (headerMatch) {
        const headerPart = headerMatch[1]
        const bodyPart = rawContent.substring(headerPart.length).trim()

        // 제목 제거하고 본문만 저장
        if (bodyPart) {
          mainContent = bodyPart
        }
        // else: 본문 없음 (호만 있는 경우이므로 mainContent는 빈 문자열)
      } else {
        // 제목 형식이 아니면 전체를 본문으로
        mainContent = rawContent
      }
    }

    // DEBUG: 제55조 구조 확인
    if (articleNum === '55' || displayNumber.includes('55')) {
      console.log('[DEBUG-ADMIN] Article 55 structure:', {
        조문번호: articleNum,
        조문내용_length: unit.조문내용?.length,
        조문내용_sample: unit.조문내용?.substring(0, 100),
        mainContent_length: mainContent.length,
        mainContent_sample: mainContent.substring(0, 100),
        has항: !!unit.항,
        항_isArray: Array.isArray(unit.항),
        항_length: unit.항?.length,
        항_structure: JSON.stringify(unit.항, null, 2)?.substring(0, 1000)
      })
    }

    // STEP 2: 항/호/목 추출
    let paraContent = ''

    if (unit.항) {
      // 항이 배열인 경우
      if (Array.isArray(unit.항)) {
        paraContent = extractContentFromHangArray(unit.항, articleNum)
      }
      // 항이 객체인 경우 (제55조 같은 경우: {"호": [...]})
      else if (typeof unit.항 === 'object' && unit.항.호 && Array.isArray(unit.항.호)) {
        // 호만 있는 경우: 직접 호 배열 처리
        for (const ho of unit.항.호) {
          if (ho.호내용) {
            let hoContent = Array.isArray(ho.호내용) ? ho.호내용.join('\n') : ho.호내용
            paraContent += '\n' + hoContent
          }

          if (ho.목 && Array.isArray(ho.목)) {
            for (const mok of ho.목) {
              if (mok.목내용) {
                let mokContent = Array.isArray(mok.목내용) ? mok.목내용.join('\n') : mok.목내용
                paraContent += '\n  ' + mokContent
              }
            }
          }
        }
        paraContent = paraContent.trim()
      }

      // DEBUG: 제55조 paraContent 확인
      if (articleNum === '55' || displayNumber.includes('55')) {
        console.log('[DEBUG-ADMIN] Article 55 paraContent:', {
          항_type: typeof unit.항,
          항_isArray: Array.isArray(unit.항),
          항_hasHo: !!(unit.항 && typeof unit.항 === 'object' && unit.항.호),
          paraContent_length: paraContent.length,
          paraContent_sample: paraContent.substring(0, 200)
        })
      }
    }

    // STEP 3: 본문 + 항/호 결합
    let content = ''
    if (mainContent) {
      content = mainContent
      if (paraContent) {
        content += '\n' + paraContent
      }
    } else {
      content = paraContent
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
    // 추가 메타데이터
    ministry,
    lastAmendmentDate,
    mst,
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
 * Detect law type from name
 */
function detectLawType(lawName: string): string {
  if (/시행규칙$/.test(lawName)) return '시행규칙'
  if (/시행령$/.test(lawName)) return '시행령'
  if (/조례|규칙/.test(lawName)) return '조례'
  if (lawName === '대한민국헌법') return '헌법'
  return '법률'
}

/**
 * Generate law.go.kr URL from MST or law name
 */
function generateLawUrl(mst: string, lawName?: string): string {
  if (mst) {
    return `https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=${mst}`
  }
  if (lawName) {
    return `https://www.law.go.kr/법령/${encodeURIComponent(lawName)}`
  }
  return ''
}

/**
 * Generate markdown
 */
function generateMarkdown(parsed: any): string {
  let md = `# ${parsed.lawName}\n\n`

  // 법령 종류
  const lawType = detectLawType(parsed.lawName)
  md += `**법령종류**: ${lawType}\n`
  md += `**법령 ID**: ${parsed.lawId}\n`

  // 소관부처
  if (parsed.ministry) {
    md += `**소관부처**: ${parsed.ministry}\n`
  }

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

  // 최종개정일
  if (parsed.lastAmendmentDate) {
    md += `**최종개정일**: ${formatDate(parsed.lastAmendmentDate)}\n`
  }

  if (parsed.revisionType) {
    md += `**제개정구분**: ${parsed.revisionType}\n`
  }

  md += `**조문 수**: ${parsed.articleCount}개\n`

  // 법제처 URL - MST가 없으면 법령명으로 URL 생성
  const lawUrl = generateLawUrl(parsed.mst, parsed.lawName)
  if (lawUrl) {
    md += `**URL**: ${lawUrl}\n`
  }

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
      lawType: detectLawType(parsed.lawName),
      ministry: parsed.ministry,
      effectiveDate: parsed.effectiveDate,
      promulgationDate: parsed.promulgationDate,
      promulgationNumber: parsed.promulgationNumber,
      lastAmendmentDate: parsed.lastAmendmentDate,
      revisionType: parsed.revisionType,
      articleCount: parsed.articleCount,
      totalCharacters: parsed.totalCharacters,
      url: generateLawUrl(parsed.mst, parsed.lawName),
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
