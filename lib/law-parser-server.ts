/**
 * Law Parser for Server-Side Operations
 *
 * This module provides server-side law parsing functionality for:
 * - Fetching law data from law.go.kr API
 * - Parsing law JSON with correct 항/호/목 extraction
 * - Converting to markdown format for File Search upload
 * - Extracting metadata (enforcement date, article count, etc.)
 */

export interface ParsedLawMetadata {
  lawId: string
  lawName: string
  lawType: string // 법률, 시행령, 시행규칙, 조례, 헌법
  ministry: string // 소관부처
  effectiveDate: string
  promulgationDate: string
  promulgationNumber: string
  lastAmendmentDate: string // 최종개정일
  revisionType: string
  mst: string // 법령일련번호 (URL 생성용)
  url: string // 법제처 URL
  articleCount: number
  totalCharacters: number
  fetchedAt: string
}

export interface ParsedLawArticle {
  articleNumber: string
  branchNumber?: string
  title: string
  content: string
  displayNumber: string // "제38조" or "제10조의2"
}

export interface ParsedLaw {
  metadata: ParsedLawMetadata
  articles: ParsedLawArticle[]
  markdown: string
}

/**
 * Extract content from 항 array (paragraph array)
 * This is the CORRECT parsing logic copied from law-xml-parser.tsx
 *
 * CRITICAL: This function handles the law.go.kr API's hierarchical structure:
 * - 항 (paragraphs)
 * - 호 (items within paragraphs)
 * - 목 (sub-items within items)
 *
 * EDGE CASES HANDLED:
 * - 항내용 없고 호만 있는 경우 (도로법 시행령 제55조)
 * - 항만 있고 항내용/호가 없는 경우
 * - 호만 있는 경우
 */
function extractContentFromHangArray(hangArray: any[]): string {
  let content = ""

  if (!Array.isArray(hangArray)) {
    return content
  }

  // 먼저 항내용이 있는지 확인
  const hasHangContent = hangArray.some(hang => {
    const hangContent = hang.항내용
    if (!hangContent) return false

    // 배열인 경우
    if (Array.isArray(hangContent)) {
      return hangContent.some(c => c && typeof c === 'string' && c.trim())
    }
    // 문자열인 경우
    if (typeof hangContent === 'string') {
      return hangContent.trim().length > 0
    }
    // 객체인 경우 (예: { content: '...' })
    if (typeof hangContent === 'object' && hangContent.content) {
      return hangContent.content.trim().length > 0
    }
    return false
  })

  // 모든 호 수집
  const allItems = hangArray.flatMap(hang => {
    if (hang.호 && Array.isArray(hang.호)) {
      return hang.호
    }
    return []
  })

  if (hasHangContent) {
    // 항내용이 있는 경우: 기존 로직
    for (const hang of hangArray) {
      // Extract 항내용 (paragraph content)
      if (hang.항내용) {
        let hangContent = hang.항내용

        // Handle array format (some 항내용 are arrays of strings or objects)
        if (Array.isArray(hangContent)) {
          hangContent = hangContent
            .map(c => typeof c === 'string' ? c : (c?.content || ''))
            .join("\n")
        }
        // Handle object format (e.g., { content: '...' })
        else if (typeof hangContent === 'object' && hangContent.content) {
          hangContent = hangContent.content
        }

        if (typeof hangContent === 'string') {
          content += "\n" + hangContent
        }
      }

      // Extract 호 (items) if present
      if (hang.호 && Array.isArray(hang.호)) {
        for (const ho of hang.호) {
          if (ho.호내용) {
            let hoContent = ho.호내용

            // Handle array format
            if (Array.isArray(hoContent)) {
              hoContent = hoContent.map(c => typeof c === 'string' ? c : (c?.content || '')).join("\n")
            } else if (typeof hoContent === 'object' && hoContent.content) {
              hoContent = hoContent.content
            }

            if (typeof hoContent === 'string') {
              content += "\n" + hoContent
            }
          }

          // Extract 목 (sub-items) if present
          if (ho.목 && Array.isArray(ho.목)) {
            for (const mok of ho.목) {
              if (mok.목내용) {
                let mokContent = mok.목내용

                // Handle array format
                if (Array.isArray(mokContent)) {
                  mokContent = mokContent.map(c => typeof c === 'string' ? c : (c?.content || '')).join("\n")
                } else if (typeof mokContent === 'object' && mokContent.content) {
                  mokContent = mokContent.content
                }

                if (typeof mokContent === 'string') {
                  content += "\n  " + mokContent
                }
              }
            }
          }
        }
      }
    }
  } else if (allItems.length > 0) {
    // 항내용 없고 호만 있는 경우: 호만 추가
    // (본문은 조문내용에서 처리됨)
    for (const ho of allItems) {
      if (ho.호내용) {
        let hoContent = ho.호내용

        // Handle array format
        if (Array.isArray(hoContent)) {
          hoContent = hoContent.map(c => typeof c === 'string' ? c : (c?.content || '')).join("\n")
        } else if (typeof hoContent === 'object' && hoContent.content) {
          hoContent = hoContent.content
        }

        if (typeof hoContent === 'string') {
          content += "\n" + hoContent
        }
      }

      // Extract 목 (sub-items) if present
      if (ho.목 && Array.isArray(ho.목)) {
        for (const mok of ho.목) {
          if (mok.목내용) {
            let mokContent = mok.목내용

            // Handle array format
            if (Array.isArray(mokContent)) {
              mokContent = mokContent.map(c => typeof c === 'string' ? c : (c?.content || '')).join("\n")
            } else if (typeof mokContent === 'object' && mokContent.content) {
              mokContent = mokContent.content
            }

            if (typeof mokContent === 'string') {
              content += "\n  " + mokContent
            }
          }
        }
      }
    }
  }

  return content.trim()
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
 * Parse law JSON data from law.go.kr API
 */
export function parseLawFromAPI(jsonData: any): ParsedLaw {
  const lawData = jsonData.법령

  if (!lawData) {
    throw new Error("법령 데이터가 없습니다")
  }

  // Extract metadata
  const basicInfo = lawData.기본정보 || lawData

  // Debug: log available metadata fields
  console.log('[parseLawFromAPI] Available basicInfo keys:', Object.keys(basicInfo))
  console.log('[parseLawFromAPI] 소관부처명:', basicInfo.소관부처명)
  console.log('[parseLawFromAPI] 소관부처:', basicInfo.소관부처)
  console.log('[parseLawFromAPI] 최종개정일자:', basicInfo.최종개정일자)
  console.log('[parseLawFromAPI] 법령일련번호:', basicInfo.법령일련번호)

  const lawName = basicInfo.법령명_한글 || basicInfo.법령명한글 || basicInfo.법령명 || "제목 없음"
  const mst = basicInfo.법령일련번호 || basicInfo.법령MST || ""

  // Handle ministry field - can be string or object with content/소관부처명 property
  let ministry = ""
  const rawMinistry = basicInfo.소관부처명 || basicInfo.소관부처
  if (typeof rawMinistry === "string") {
    ministry = rawMinistry
  } else if (rawMinistry && typeof rawMinistry === "object") {
    // API returns: { content: '법제처', 소관부처코드: '1170000' }
    ministry = rawMinistry.content || rawMinistry.소관부처명 || rawMinistry["#text"] || ""
  }

  console.log('[parseLawFromAPI] Extracted ministry:', ministry)
  console.log('[parseLawFromAPI] Extracted mst:', mst)

  const lawId = basicInfo.법령ID || basicInfo.법령키 || "unknown"

  // URL 생성: MST가 없으면 법령ID로 대체
  let url = ""
  if (mst) {
    url = `https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=${mst}`
  } else if (lawId && lawId !== "unknown") {
    url = `https://www.law.go.kr/법령/${encodeURIComponent(lawName)}`
  }

  const metadata: ParsedLawMetadata = {
    lawId,
    lawName,
    lawType: detectLawType(lawName),
    ministry,
    effectiveDate: basicInfo.최종시행일자 || basicInfo.시행일자 || "",
    promulgationDate: basicInfo.공포일자 || "",
    promulgationNumber: basicInfo.공포번호 || "",
    lastAmendmentDate: basicInfo.최종개정일자 || "",
    revisionType: basicInfo.제개정구분명 || basicInfo.제개정구분 || "",
    mst,
    url,
    articleCount: 0,
    totalCharacters: 0,
    fetchedAt: new Date().toISOString()
  }

  // Parse articles
  const articles: ParsedLawArticle[] = []
  const articleUnits = lawData.조문?.조문단위 || []

  for (const unit of articleUnits) {
    // CRITICAL: Filter non-articles
    if (unit.조문여부 !== "조문") {
      continue
    }

    const articleNum = unit.조문번호
    const branchNum = unit.조문가지번호
    const title = unit.조문제목 || ""

    // Build display number
    let displayNumber = `제${articleNum}조`
    if (branchNum && Number.parseInt(branchNum) > 0) {
      displayNumber = `제${articleNum}조의${branchNum}`
    }

    // Extract content using CORRECT parsing logic
    let content = ""
    let mainContent = "" // 본문 (조문내용에서 추출)

    // STEP 1: 본문 추출 (조문내용에서)
    // CRITICAL: 제목 부분 제거 (마크다운 헤더에 이미 포함됨)
    if (unit.조문내용 && typeof unit.조문내용 === "string") {
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

    // STEP 2: 항/호 내용 추출
    let paraContent = ""

    if (unit.항 && Array.isArray(unit.항)) {
      paraContent = extractContentFromHangArray(unit.항)
    }
    // Fallback: if 항 is an object with 호 array (제55조 같은 경우: {"호": [...]})
    else if (unit.항 && typeof unit.항 === "object" && unit.항.호) {
      if (Array.isArray(unit.항.호)) {
        const hoItems: string[] = []
        for (const ho of unit.항.호) {
          if (ho.호내용) {
            let hoContent = ho.호내용
            if (Array.isArray(hoContent)) {
              hoContent = hoContent.join("\n")
            }
            hoItems.push(hoContent)
          }

          // 목 처리 추가
          if (ho.목 && Array.isArray(ho.목)) {
            for (const mok of ho.목) {
              if (mok.목내용) {
                let mokContent = mok.목내용
                if (Array.isArray(mokContent)) {
                  mokContent = mokContent.join("\n")
                }
                hoItems.push("  " + mokContent)
              }
            }
          }
        }
        // CRITICAL FIX: 호 사이에만 \n 추가 (첫 호 앞에는 없음)
        paraContent = hoItems.join("\n")
      }
    }

    // STEP 3: 본문 + 항/호 결합
    if (mainContent) {
      content = mainContent
      if (paraContent) {
        // CRITICAL FIX: 본문과 호 사이 \n 하나만 추가 (브라우저 자동 줄바꿈)
        content += "\n" + paraContent
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

    metadata.totalCharacters += content.length
  }

  metadata.articleCount = articles.length

  console.log(`[parseLawFromAPI] Parsed ${articles.length} articles for ${metadata.lawName}`)

  // Generate markdown
  const markdown = generateMarkdown(metadata, articles)

  console.log(`[parseLawFromAPI] Generated markdown (${markdown.length} chars)`)

  return {
    metadata,
    articles,
    markdown
  }
}

/**
 * Generate markdown format for File Search upload
 */
function generateMarkdown(metadata: ParsedLawMetadata, articles: ParsedLawArticle[]): string {
  let md = ""

  // Header
  md += `# ${metadata.lawName}\n\n`
  md += `**법령종류**: ${metadata.lawType}\n`
  md += `**법령 ID**: ${metadata.lawId}\n`

  if (metadata.ministry) {
    md += `**소관부처**: ${metadata.ministry}\n`
  }

  if (metadata.effectiveDate) {
    const formatted = formatDate(metadata.effectiveDate)
    md += `**시행일**: ${formatted}\n`
  }

  if (metadata.promulgationDate) {
    const formatted = formatDate(metadata.promulgationDate)
    md += `**공포일**: ${formatted}`
    if (metadata.promulgationNumber) {
      md += ` (${metadata.promulgationNumber})`
    }
    md += `\n`
  }

  if (metadata.lastAmendmentDate) {
    md += `**최종개정일**: ${formatDate(metadata.lastAmendmentDate)}\n`
  }

  if (metadata.revisionType) {
    md += `**제개정구분**: ${metadata.revisionType}\n`
  }

  md += `**조문 수**: ${metadata.articleCount}개\n`

  if (metadata.url) {
    md += `**URL**: ${metadata.url}\n`
  }

  md += `\n---\n\n`

  // Articles
  for (const article of articles) {
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
 * Format date string from YYYYMMDD to YYYY-MM-DD or readable format
 */
function formatDate(dateStr: string): string {
  if (!dateStr || dateStr.length !== 8) {
    return dateStr
  }

  const year = dateStr.substring(0, 4)
  const month = dateStr.substring(4, 6)
  const day = dateStr.substring(6, 8)

  return `${year}년 ${month}월 ${day}일`
}

/**
 * Fetch law data from law.go.kr API
 */
export async function fetchLawFromAPI(lawId: string, apiKey: string): Promise<any> {
  const url = `https://www.law.go.kr/DRF/lawService.do?target=eflaw&OC=${apiKey}&type=JSON&ID=${lawId}`

  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`법령 API 호출 실패: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()

  // Check for HTML error page
  const text = JSON.stringify(data)
  if (text.includes("<!DOCTYPE html") || text.includes("<html")) {
    throw new Error("법령 API에서 HTML 오류 페이지를 반환했습니다")
  }

  return data
}

/**
 * Search law by name and return candidates
 */
export async function searchLawByName(lawName: string, apiKey: string): Promise<any[]> {
  const url = `https://www.law.go.kr/DRF/lawSearch.do?target=law&OC=${apiKey}&type=JSON&query=${encodeURIComponent(lawName)}`

  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`법령 검색 API 호출 실패: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()

  // Extract law list
  const lawList = data.LawSearch?.law || []

  // Normalize to array
  return Array.isArray(lawList) ? lawList : [lawList]
}

/**
 * Complete workflow: Search → Parse → Generate Markdown
 */
export async function parseLawByNameOrId(
  searchQuery: string,
  apiKey: string
): Promise<{ success: true; law: ParsedLaw; candidates?: any[] } | { success: false; error: string; candidates?: any[] }> {
  try {
    // Try as law ID first (if it's all digits)
    if (/^\d+$/.test(searchQuery)) {
      try {
        console.log(`[parseLawByNameOrId] Trying to fetch by ID: ${searchQuery}`)
        const lawData = await fetchLawFromAPI(searchQuery, apiKey)
        console.log(`[parseLawByNameOrId] Fetched law data, parsing...`)
        const parsed = parseLawFromAPI(lawData)
        console.log(`[parseLawByNameOrId] Successfully parsed: ${parsed.metadata.lawName}`)
        return { success: true, law: parsed }
      } catch (e: any) {
        // Not a valid ID, continue to search
        console.log(`[parseLawByNameOrId] ID fetch/parse failed: ${e.message}`)
      }
    }

    // Search by name
    const candidates = await searchLawByName(searchQuery, apiKey)

    if (candidates.length === 0) {
      return {
        success: false,
        error: "검색 결과가 없습니다",
        candidates: []
      }
    }

    // If exact match found, parse it
    const exactMatch = candidates.find(
      (c) => c.법령명한글 === searchQuery || c.법령명_한글 === searchQuery
    )

    if (exactMatch && candidates.length === 1) {
      const lawId = exactMatch.법령ID || exactMatch.법령키
      const lawData = await fetchLawFromAPI(lawId, apiKey)
      const parsed = parseLawFromAPI(lawData)
      return { success: true, law: parsed }
    }

    // Multiple candidates - return for user selection
    return {
      success: false,
      error: "여러 후보가 있습니다",
      candidates
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "알 수 없는 오류"
    }
  }
}
