import { debugLogger } from "./debug-logger"
import type { RevisionHistoryItem } from "./law-types"
import { normalizeLawSearchText, resolveLawAlias } from "./search-normalizer"

interface ArticleComponents {
  articleNumber: number
  branchNumber: number
}

interface ParsedSearchQuery {
  lawName: string
  article?: string
  jo?: string
  clause?: string
  item?: string
  subItem?: string
}

function stripClauseAndItem(raw: string): string {
  return raw
    .replace(/제?\d+항.*$/u, "")
    .replace(/제?\d+호.*$/u, "")
    .replace(/제?\d+목.*$/u, "")
}

function normalizeSeparators(raw: string): string {
  return raw
    .replace(/[‐‑‒–—―﹘﹣－]/gu, "-")
    .replace(/[·•]/gu, " ")
}

function parseArticleComponents(input: string): ArticleComponents {
  debugLogger.debug("조문 컴포넌트 파싱", { input })

  const sanitized = stripClauseAndItem(
    normalizeSeparators(input)
      .replace(/제|第/gu, "")
      .replace(/조문|條/gu, "조")
      .replace(/之/gu, "의")
      .replace(/[()]/gu, "")
      .replace(/\s+/gu, "")
      .trim(),
  )

  const match = sanitized.match(/(\d+)(?:조)?(?:(?:의|-)\s*(\d+))?/u)

  if (!match) {
    debugLogger.error("조문 숫자 추출 실패", { input, sanitized })
    throw new Error(`조문 패턴을 인식할 수 없습니다: ${input}`)
  }

  const articleNumber = Number.parseInt(match[1], 10)
  const branchNumber = match[2] ? Number.parseInt(match[2], 10) : 0

  if (Number.isNaN(articleNumber) || Number.isNaN(branchNumber)) {
    debugLogger.error("조문 숫자 변환 실패", { input, match })
    throw new Error(`조문 번호를 해석할 수 없습니다: ${input}`)
  }

  return { articleNumber, branchNumber }
}

function formatArticleLabel({ articleNumber, branchNumber }: ArticleComponents): string {
  const base = `제${articleNumber}조`
  return branchNumber > 0 ? `${base}의${branchNumber}` : base
}

/**
 * Converts Korean law article notation to 6-digit JO code
 * Examples:
 *   "38조" → "003800"
 *   "10조의2" → "001002"
 *   "제5조" → "000500"
 */
export function buildJO(input: string): string {
  debugLogger.debug("JO 파싱 시작", { input })

  const components = parseArticleComponents(input)

  const articleNum = components.articleNumber.toString().padStart(4, "0")
  const branchNum = components.branchNumber.toString().padStart(2, "0")
  const jo = `${articleNum}${branchNum}`

  return jo
}

/**
 * Parses search query to extract law name and article
 * Examples:
 *   "관세법 38조" → { lawName: "관세법", article: "38조" }
 *   "관세법 제38조" → { lawName: "관세법", article: "제38조" }
 */
export function parseSearchQuery(query: string): ParsedSearchQuery {
  debugLogger.debug("검색어 파싱 시작", { query })

  const normalizedQuery = normalizeLawSearchText(query)
  // 법령명과 조문 사이 공백 선택적 (행정법2조, 행정법 2조 둘 다 지원)
  const articlePattern =
    /\s*(제?\d+(?:조)?(?:[-의]\d+)?)(?:\s*제?\d+항)?(?:\s*제?\d+호)?(?:\s*제?\d+목)?$/u
  const match = articlePattern.exec(normalizedQuery)

  if (match && match.index !== undefined) {
    const rawLawName = normalizedQuery.slice(0, match.index).trim()
    const lawNameResolution = resolveLawAlias(rawLawName || normalizedQuery.trim())
    const lawName = lawNameResolution.canonical

    const fullArticleSegment = normalizedQuery.slice(match.index).trim()
    const articleLabel = normalizeArticle(match[1].trim())
    const jo = buildJO(articleLabel)

    const clauseMatch = fullArticleSegment.match(/제?\s*(\d+)\s*항/u)
    const itemMatch = fullArticleSegment.match(/제?\s*(\d+)\s*호/u)
    const subItemMatch = fullArticleSegment.match(/제?\s*(\d+)\s*목/u)

    const parsed: ParsedSearchQuery = {
      lawName,
      article: articleLabel,
      jo,
    }

    if (clauseMatch) {
      parsed.clause = clauseMatch[1]
    }

    if (itemMatch) {
      parsed.item = itemMatch[1]
    }

    if (subItemMatch) {
      parsed.subItem = subItemMatch[1]
    }

    return parsed
  }

  const trimmedLawName = normalizedQuery.trim()
  const lawNameResolution = resolveLawAlias(trimmedLawName)

  debugLogger.info("법령명 정규화 결과", {
    lawName: lawNameResolution.canonical,
    matchedAlias: lawNameResolution.matchedAlias,
  })

  return { lawName: lawNameResolution.canonical }
}

/**
 * Normalizes law article notation
 * Examples:
 *   "38조" → "제38조"
 *   "10조의2" → "제10조의2"
 */
export function normalizeArticle(article: string): string {
  const components = parseArticleComponents(article)
  return formatArticleLabel(components)
}

/**
 * Formats JO code back to readable Korean
 * Examples:
 *   "003800" → "제38조"
 *   "001002" → "제10조의2"
 *   "38" → "제38조" (short format support)
 */
export function formatJO(jo: string): string {
  if (!jo) return ""

  // If already in "제N조" format, return as is
  if (jo.startsWith("제") && jo.includes("조")) {
    return jo
  }

  // Handle short format (e.g., "38")
  if (jo.length < 6) {
    const articleNum = Number.parseInt(jo, 10)
    if (!isNaN(articleNum)) {
      return `제${articleNum}조`
    }
    return jo
  }

  // Handle 6-digit format
  if (jo.length === 6) {
    const articleNum = Number.parseInt(jo.substring(0, 4), 10)
    const branchNum = Number.parseInt(jo.substring(4, 6), 10)

    if (branchNum === 0) {
      return `제${articleNum}조`
    }

    return `제${articleNum}조의${branchNum}`
  }

  return jo
}

/**
 * Formats JO code to readable Korean with support for Ordinances
 * Examples:
 *   "003800" → "제38조"
 *   "010000" (Ordinance) → "제1조"
 *   "010100" (Ordinance) → "제1조의1"
 */
export function formatSimpleJo(jo: string, isOrdinance = false): string {
  // Already formatted (e.g., "제1조", "제10조의2")
  if (jo.startsWith("제") && jo.includes("조")) {
    return jo
  }

  // Ordinance format: 6-digit AABBCC (AA = article, BB = branch, CC = sub)
  // Example: "010000" = 제1조, "010100" = 제1조의1
  if (isOrdinance && jo.length === 6 && /^\d{6}$/.test(jo)) {
    const articleNum = Number.parseInt(jo.substring(0, 2), 10)
    const branchNum = Number.parseInt(jo.substring(2, 4), 10)
    const subNum = Number.parseInt(jo.substring(4, 6), 10)

    let result = `제${articleNum}조`
    if (branchNum > 0) result += `의${branchNum}`
    if (subNum > 0) result += `-${subNum}`

    return result
  }

  // Law format: 6-digit AAAABB (AAAA = article, BB = branch)
  if (!isOrdinance && jo.length === 6 && /^\d{6}$/.test(jo)) {
    const articleNum = Number.parseInt(jo.substring(0, 4), 10)
    const branchNum = Number.parseInt(jo.substring(4, 6), 10)
    return branchNum === 0 ? `제${articleNum}조` : `제${articleNum}조의${branchNum}`
  }

  // 8-digit code format (fallback)
  if (jo.length === 8 && /^\d{8}$/.test(jo)) {
    const articleNum = Number.parseInt(jo.substring(0, 4), 10)
    const branchNum = Number.parseInt(jo.substring(4, 6), 10)
    const subNum = Number.parseInt(jo.substring(6, 8), 10)

    let result = `제${articleNum}조`
    if (branchNum > 0) result += `의${branchNum}`
    if (subNum > 0) result += `-${subNum}`

    return result
  }

  // Fallback: return as-is
  return jo
}

/**
 * Parses article revision history XML response
 */
export function parseArticleHistory(xml: string): RevisionHistoryItem[] {
  debugLogger.debug("조문 변경이력 파싱 시작")

  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, "text/xml")

  // Check for parsing errors
  const parserError = doc.querySelector("parsererror")
  if (parserError) {
    debugLogger.error("XML 파싱 오류", { error: parserError.textContent })
    return []
  }

  const items = doc.querySelectorAll("law")
  const history: RevisionHistoryItem[] = []


  items.forEach((item, index) => {
    const lawInfo = item.querySelector("법령정보")
    const articleInfo = item.querySelector("조문정보")

    if (!lawInfo || !articleInfo) {
      console.log(`[조문이력 ${index + 1}] Missing lawInfo or articleInfo, skipping`)
      return
    }

    // Extract from 법령정보
    const promulgationDate = lawInfo.querySelector("공포일자")?.textContent || ""
    const promulgationNumber = lawInfo.querySelector("공포번호")?.textContent || ""
    const revisionType = lawInfo.querySelector("제개정구분명")?.textContent || ""
    const effectiveDate = lawInfo.querySelector("시행일자")?.textContent || ""
    const department = lawInfo.querySelector("소관부처명")?.textContent || ""
    const lawType = lawInfo.querySelector("법령구분명")?.textContent || ""

    // Extract from 조문정보
    const changeReason = articleInfo.querySelector("변경사유")?.textContent || ""
    const articleLink = articleInfo.querySelector("조문링크")?.textContent || ""
    const articleNumber = articleInfo.querySelector("조문번호")?.textContent || ""

    // Format date as YYYY-MM-DD
    const formatDate = (dateStr: string) => {
      if (!dateStr || dateStr.length !== 8) return dateStr
      return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`
    }

    const fullArticleLink = articleLink ? `https://www.law.go.kr${articleLink}` : ""

    const historyItem: RevisionHistoryItem = {
      date: formatDate(promulgationDate),
      type: revisionType,
      description: changeReason,
      promulgationDate: formatDate(promulgationDate),
      promulgationNumber,
      effectiveDate: formatDate(effectiveDate),
      department,
      lawType,
      changeReason,
      articleLink: fullArticleLink,
    }

    history.push(historyItem)

    console.log(`[조문이력 ${index + 1}]`, {
      date: historyItem.date,
      type: historyItem.type,
      reason: historyItem.changeReason,
      articleNumber,
    })
  })

  return history
}

/**
 * AI 답변에서 관련 법령 제목 파싱
 *
 * 입력 예시: "**관세법 제38조 (신고납부)**"
 * 출력: { lawName: "관세법", article: "제38조", jo: "003800", title: "(신고납부)", display: "관세법 제38조 (신고납부)" }
 */
export interface ParsedRelatedLaw {
  lawName: string        // "관세법"
  article: string        // "제38조"
  jo: string            // "003800" (6-digit JO code)
  title?: string        // "(신고납부)"
  display: string       // "관세법 제38조 (신고납부)" (전체 표시명)
  source: 'excerpt' | 'related' | 'citation'  // 발췌조문 vs 관련법령 vs Citations (File Search)
  fullText?: string     // 조문 전문 (나중에 로드)
}

export function parseRelatedLawTitle(title: string, source: 'excerpt' | 'related' = 'related'): ParsedRelatedLaw | null {
  // 이모지 및 마크다운 제거
  const cleanTitle = title
    .replace(/\*\*/g, '')
    .replace(/📜|📋|📖/g, '')
    .trim()

  // 법령명 + 제N조 + (제목) 패턴
  const pattern = /^(.+?)\s+(제\d+조(?:의\d+)?)\s*(\([^)]+\))?/
  const match = cleanTitle.match(pattern)

  if (!match) {
    debugLogger.warning('관련법령 제목 파싱 실패', { title })
    return null
  }

  const [, lawName, article, titlePart] = match

  // 법령명이 너무 긴 경우 파싱 오류로 판단 (정상적인 법령명은 50자 이하)
  if (lawName.trim().length > 50) {
    debugLogger.warning('법령명이 너무 길어 파싱 스킵', { lawName: lawName.substring(0, 50) + '...' })
    return null
  }

  try {
    // 제38조 → 003800 변환
    const jo = buildJO(article)

    debugLogger.debug('관련법령 파싱 성공', {
      lawName,
      article,
      jo,
      title: titlePart,
      display: cleanTitle,
      source
    })

    return {
      lawName: lawName.trim(),
      article,
      jo,
      title: titlePart?.trim(),
      display: cleanTitle,
      source
    }
  } catch (error) {
    debugLogger.error('JO 코드 변환 실패', { article, error })
    return null
  }
}

/**
 * AI 답변 마크다운에서 발췌조문 헤더 + 관련 법령 목록 모두 추출
 *
 * 패턴 1: **📜 관세법 제38조 (신고납부)** - 조문 발췌 헤더
 * 패턴 2: - 관세법 제38조 (신고납부) - 관련 법령 리스트
 */
export function extractRelatedLaws(markdown: string): ParsedRelatedLaw[] {
  const laws: ParsedRelatedLaw[] = []

  // 패턴 1: 조문 발췌 헤더 (볼드 + 이모지)
  // 예: **📜 관세법 제38조 (신고납부)**
  // 주의: "⚖️ 조문 발췌"는 섹션 제목이고, 실제 법령은 📜로 시작
  const headerPattern = /\*\*📜\s*([^*]+?)\*\*/g
  let match

  while ((match = headerPattern.exec(markdown)) !== null) {
    const title = match[1].trim()
    const parsed = parseRelatedLawTitle(title, 'excerpt')
    if (parsed) {
      laws.push(parsed)
    }
  }

  debugLogger.info('발췌조문 헤더 추출', { count: laws.length })

  // 패턴 2: 관련 법령 섹션의 리스트
  // "🔗 관련 법령" 또는 "## 🔗 관련 법령" 섹션 찾기
  // Phase 7: AI 프롬프트가 ## 없이 출력하므로 선택적으로 매칭
  const relatedSectionPattern = /(?:##\s*)?🔗\s*관련\s*법령([\s\S]*?)(?=📋|📄|💡|⚖️|##|$)/
  const sectionMatch = markdown.match(relatedSectionPattern)

  if (sectionMatch) {
    const section = sectionMatch[1]

    // 리스트 아이템 파싱: - 📜 법령명 제N조 (제목)
    const listPattern = /-\s*📜?\s*([^\n]+)/g
    let listMatch

    while ((listMatch = listPattern.exec(section)) !== null) {
      const title = listMatch[1].trim()
      const parsed = parseRelatedLawTitle(title, 'related')
      if (parsed) {
        laws.push(parsed)
      }
    }

    debugLogger.info('관련법령 리스트 추출', {
      relatedCount: laws.filter(l => l.source === 'related').length
    })
  } else {
    debugLogger.info('관련 법령 섹션 없음')
  }

  // 패턴 3: 인라인 「법령명」 제N조 (제목) 패턴 (인용 괄호)
  // 예: 「도로법」 제61조, 「도로법 시행령」 제63조 (신고납부)
  // Phase 7: (제목) 패턴도 캡처
  const quotedLawPattern = /「([^」]+)」\s*제(\d+)조(의(\d+))?\s*(\([^)]+\))?/g
  let quotedMatch

  while ((quotedMatch = quotedLawPattern.exec(markdown)) !== null) {
    const lawName = quotedMatch[1].trim()
    const articleNum = quotedMatch[2] + (quotedMatch[4] ? `의${quotedMatch[4]}` : '')
    const jo = buildJO(articleNum)
    const titlePart = quotedMatch[5]?.trim()  // (제목) 부분

    if (jo) {
      laws.push({
        lawName,
        article: `제${articleNum}조`,
        jo,
        title: titlePart,  // ✅ 조문 제목 추가
        display: `${lawName} 제${articleNum}조${titlePart ? ' ' + titlePart : ''}`,
        source: 'related'
      })
    }
  }

  debugLogger.info('인라인 「」 법령 추출', {
    count: laws.filter(l => l.source === 'related').length
  })

  // 패턴 4: 인라인 법령명 제N조 패턴 (인용 괄호 없음)
  // 예: 도로법 제61조, 도로법 시행령 제63조
  // 주의: 이미 「」로 캡처된 것은 제외
  const unquotedLawPattern = /(?<!「)([가-힣a-zA-Z0-9·]{2,20}(?:법률|법|령|규칙|조례)(?:\s*시행령|\s*시행규칙)?)\s*제(\d+)조(의(\d+))?/g
  let unquotedMatch

  while ((unquotedMatch = unquotedLawPattern.exec(markdown)) !== null) {
    const lawName = unquotedMatch[1].trim()
    const articleNum = unquotedMatch[2] + (unquotedMatch[4] ? `의${unquotedMatch[4]}` : '')
    const jo = buildJO(articleNum)

    // 단독 '시행령', '시행규칙' 등 부모 법령명 없이 불완전한 법령명 제외
    // 예: "관세법 시행령 제20조"에서 "시행령" 위치를 별도 추출하는 오매칭 방지
    if (/^시행(령|규칙)$/.test(lawName)) continue

    // 중복 체크: 같은 법령+조문이 이미 있는지 확인
    const isDuplicate = laws.some(l =>
      l.lawName === lawName && l.article === `제${articleNum}조`
    )

    if (jo && !isDuplicate) {
      laws.push({
        lawName,
        article: `제${articleNum}조`,
        jo,
        display: `${lawName} 제${articleNum}조`,
        source: 'related'
      })
    }
  }

  debugLogger.info('인라인 일반 법령 추출', {
    totalRelated: laws.filter(l => l.source === 'related').length
  })

  // ⚠️ 중복 제거 하지 않음 - 사이드바에서 source별로 그룹화하여 표시
  // 같은 법령이 발췌(excerpt)와 관련(related) 둘 다 있을 수 있으므로 모두 반환
  debugLogger.success('전체 법령 추출 완료 (중복 미제거)', {
    total: laws.length,
    excerpt: laws.filter(l => l.source === 'excerpt').length,
    related: laws.filter(l => l.source === 'related').length,
    laws: laws.map(l => `${l.lawName} ${l.article} (${l.source})`)
  })

  return laws
}
