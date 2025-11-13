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
  effectiveDate: string
  promulgationDate: string
  promulgationNumber: string
  revisionType: string
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
 * This is the CORRECT parsing logic copied from app/page.tsx
 *
 * CRITICAL: This function handles the law.go.kr API's hierarchical structure:
 * - 항 (paragraphs)
 * - 호 (items within paragraphs)
 * - 목 (sub-items within items)
 */
function extractContentFromHangArray(hangArray: any[]): string {
  let content = ""

  if (!Array.isArray(hangArray)) {
    return content
  }

  for (const hang of hangArray) {
    // Extract 항내용 (paragraph content)
    if (hang.항내용) {
      let hangContent = hang.항내용

      // Handle array format (some 항내용 are arrays of strings)
      if (Array.isArray(hangContent)) {
        hangContent = hangContent.join("\n")
      }

      content += "\n" + hangContent
    }

    // Extract 호 (items) if present
    if (hang.호 && Array.isArray(hang.호)) {
      for (const ho of hang.호) {
        if (ho.호내용) {
          let hoContent = ho.호내용

          // Handle array format
          if (Array.isArray(hoContent)) {
            hoContent = hoContent.join("\n")
          }

          content += "\n" + hoContent
        }

        // Extract 목 (sub-items) if present
        if (ho.목 && Array.isArray(ho.목)) {
          for (const mok of ho.목) {
            if (mok.목내용) {
              let mokContent = mok.목내용

              // Handle array format
              if (Array.isArray(mokContent)) {
                mokContent = mokContent.join("\n")
              }

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
 * Parse law JSON data from law.go.kr API
 */
export function parseLawFromAPI(jsonData: any): ParsedLaw {
  const lawData = jsonData.법령

  if (!lawData) {
    throw new Error("법령 데이터가 없습니다")
  }

  // Extract metadata
  const basicInfo = lawData.기본정보 || lawData
  const metadata: ParsedLawMetadata = {
    lawId: basicInfo.법령ID || basicInfo.법령키 || "unknown",
    lawName: basicInfo.법령명_한글 || basicInfo.법령명한글 || basicInfo.법령명 || "제목 없음",
    effectiveDate: basicInfo.최종시행일자 || basicInfo.시행일자 || "",
    promulgationDate: basicInfo.공포일자 || "",
    promulgationNumber: basicInfo.공포번호 || "",
    revisionType: basicInfo.제개정구분명 || basicInfo.제개정구분 || "",
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

    if (unit.항 && Array.isArray(unit.항)) {
      content = extractContentFromHangArray(unit.항)
    }
    // Fallback: if 항 is an object with 호 array (old structure)
    else if (unit.항 && typeof unit.항 === "object" && unit.항.호) {
      if (Array.isArray(unit.항.호)) {
        for (const ho of unit.항.호) {
          if (ho.호내용) {
            let hoContent = ho.호내용
            if (Array.isArray(hoContent)) {
              hoContent = hoContent.join("\n")
            }
            content += "\n" + hoContent
          }
        }
      }
    }
    // Last resort: use 조문내용 (usually only contains title)
    else if (unit.조문내용 && typeof unit.조문내용 === "string") {
      let rawContent = unit.조문내용.trim()

      // Remove the article header (e.g., "제28조(개별소비세의 사무 관할)")
      const headerPattern = /^제\d+조(?:의\d+)?\([^)]+\)\s*/
      rawContent = rawContent.replace(headerPattern, "")

      content = rawContent
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

  // Generate markdown
  const markdown = generateMarkdown(metadata, articles)

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
  md += `**법령 ID**: ${metadata.lawId}\n`

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

  if (metadata.revisionType) {
    md += `**제개정구분**: ${metadata.revisionType}\n`
  }

  md += `**조문 수**: ${metadata.articleCount}개\n`
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
        const lawData = await fetchLawFromAPI(searchQuery, apiKey)
        const parsed = parseLawFromAPI(lawData)
        return { success: true, law: parsed }
      } catch (e) {
        // Not a valid ID, continue to search
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
