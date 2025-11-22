/**
 * 행정규칙 파싱 유틸리티
 */

import { linkifyRefsB } from "./unified-link-generator"

export interface AdminRuleListItem {
  name: string // 행정규칙명
  id: string // 행정규칙ID
  serialNumber?: string // 행정규칙일련번호
  detailLink?: string // 행정규칙상세링크
  publishDate?: string // 발령일자
  publishNumber?: string // 발령번호
  department?: string // 소관부처명
  type?: string // 행정규칙종류 (훈령/예규/고시/공고/지침/기타)
  effectiveDate?: string // 시행일자
}

export interface AdminRuleContent {
  name: string // 행정규칙명
  id: string // 행정규칙ID
  serialNumber?: string // 일련번호
  department?: string // 소관부처
  publishDate?: string // 발령일자
  publishNumber?: string // 발령번호
  effectiveDate?: string // 시행일자
  content: string // 조문내용 (전체)
  articles: AdminRuleArticle[] // 파싱된 조문들
}

export interface AdminRuleArticle {
  number: string // 조번호 (제1조, 제2조 등)
  title?: string // 조제목 (예: 목적)
  content: string // 조내용
}

/**
 * 행정규칙 제1조(목적)만 빠르게 추출 (경량 버전)
 * 전체 파싱 없이 제1조만 추출하여 성능 최적화
 */
export function parseAdminRulePurposeOnly(xmlText: string): {
  name: string
  id: string
  purpose: AdminRuleArticle | null
} | null {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, "text/xml")

  const serviceNode = doc.querySelector("AdmRulService")
  if (!serviceNode) return null

  const infoNode = serviceNode.querySelector("행정규칙기본정보")
  if (!infoNode) return null

  const name = infoNode.querySelector("행정규칙명")?.textContent?.trim() || ""
  const id = infoNode.querySelector("행정규칙ID")?.textContent?.trim() || ""

  // 모든 조문내용 가져오기 (첫 번째가 "제1장" 같은 경우 있음)
  const contentNodes = serviceNode.querySelectorAll("조문내용")
  if (!contentNodes || contentNodes.length === 0) {
    return { name, id, purpose: null }
  }

  // 제1조를 찾을 때까지 순회
  for (const contentNode of contentNodes) {
    const content = contentNode.textContent?.trim() || ""

    // 제1조(목적) 패턴 매칭
    const purposeMatch = content.match(/(제1조)\s*(?:\(([^)]+)\))?\s*([\s\S]+)/)

    if (purposeMatch) {
      const purpose: AdminRuleArticle = {
        number: purposeMatch[1], // "제1조"
        title: purposeMatch[2] || undefined, // "목적"
        content: purposeMatch[3].trim(),
      }
      return { name, id, purpose }
    }
  }

  return { name, id, purpose: null }
}

/**
 * 행정규칙 목록 XML 파싱
 */
export function parseAdminRuleList(xmlText: string): AdminRuleListItem[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, "text/xml")

  const rules: AdminRuleListItem[] = []
  const ruleNodes = doc.querySelectorAll("admrul")

  ruleNodes.forEach((node) => {
    const name = node.querySelector("행정규칙명")?.textContent?.trim() || ""
    const id = node.querySelector("행정규칙ID")?.textContent?.trim() || ""
    const serialNumber = node.querySelector("행정규칙일련번호")?.textContent?.trim()
    const detailLink = node.querySelector("행정규칙상세링크")?.textContent?.trim()
    const publishDate = node.querySelector("발령일자")?.textContent?.trim()
    const publishNumber = node.querySelector("발령번호")?.textContent?.trim()
    const department = node.querySelector("소관부처명")?.textContent?.trim()
    const type = node.querySelector("행정규칙종류")?.textContent?.trim()
    const effectiveDate = node.querySelector("시행일자")?.textContent?.trim()

    if (name && id) {
      rules.push({
        name,
        id,
        serialNumber,
        detailLink,
        publishDate,
        publishNumber,
        department,
        type,
        effectiveDate,
      })
    }
  })

  return rules
}

/**
 * 행정규칙 본문 XML 파싱
 */
export function parseAdminRuleContent(xmlText: string): AdminRuleContent | null {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, "text/xml")

  // AdmRulService 구조 확인
  const serviceNode = doc.querySelector("AdmRulService")
  if (!serviceNode) {
    console.error("[admrul-parser] AdmRulService node not found")
    return null
  }

  const infoNode = serviceNode.querySelector("행정규칙기본정보")
  if (!infoNode) {
    console.error("[admrul-parser] 행정규칙기본정보 node not found")
    return null
  }

  const name = infoNode.querySelector("행정규칙명")?.textContent?.trim() || ""
  const id = infoNode.querySelector("행정규칙ID")?.textContent?.trim() || ""
  const serialNumber = infoNode.querySelector("행정규칙일련번호")?.textContent?.trim()
  const department = infoNode.querySelector("소관부처명")?.textContent?.trim()
  const publishDate = infoNode.querySelector("발령일자")?.textContent?.trim()
  const publishNumber = infoNode.querySelector("발령번호")?.textContent?.trim()
  const effectiveDate = infoNode.querySelector("시행일자")?.textContent?.trim()

  // 조문내용이 여러 개 있을 수 있음 - 각각이 이미 조문별로 나뉘어져 있음
  const contentNodes = serviceNode.querySelectorAll("조문내용")
  const contentParts: string[] = []
  const articles: AdminRuleArticle[] = []

  contentNodes.forEach((node) => {
    const text = node.textContent?.trim()
    if (!text) return

    contentParts.push(text)

    // 각 조문내용에서 첫 번째 조문 패턴만 추출
    const article = parseArticleFromSingleContent(text)
    if (article) {
      articles.push(article)
    }
  })

  const content = contentParts.join("\n\n")

  if (!content) {
    console.warn("[admrul-parser] No content found for:", name)
  }

  return {
    name,
    id,
    serialNumber,
    department,
    publishDate,
    publishNumber,
    effectiveDate,
    content,
    articles,
  }
}

/**
 * 단일 조문내용에서 조문 추출
 * 각 <조문내용> 태그는 이미 조문별로 분리되어 있으므로,
 * 첫 번째 "제N조" 패턴만 조문 번호로 인식하고 나머지는 모두 내용으로 처리
 */
function parseArticleFromSingleContent(text: string): AdminRuleArticle | null {
  // 첫 번째 제N조 패턴 찾기
  const match = text.match(/^(제\d+조(?:의\d+)?)\s*(?:\(([^)]+)\))?\s*([\s\S]*)/)

  if (!match) {
    // 조문 패턴이 없으면 (예: "제1장 총칙") 장/절 제목으로 간주하고 건너뜀
    return null
  }

  const number = match[1] // "제1조"
  const title = match[2]  // "목적"
  const content = match[3].trim() // 나머지 모든 내용

  return {
    number,
    title,
    content,
  }
}

/**
 * 조문 내용에서 개별 조문 추출 (레거시, 사용 안 함)
 * 예: "제1조(목적) 이 고시는..." → { number: "제1조", title: "목적", content: "이 고시는..." }
 */
function parseArticlesFromContent(content: string): AdminRuleArticle[] {
  const articles: AdminRuleArticle[] = []

  // 제N조 패턴으로 분할
  const articlePattern = /(제\d+조(?:의\d+)?)\s*(?:\(([^)]+)\))?\s*/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  const matches: Array<{ number: string; title?: string; index: number }> = []

  while ((match = articlePattern.exec(content)) !== null) {
    matches.push({
      number: match[1],
      title: match[2],
      index: match.index,
    })
  }

  // 각 조문의 내용 추출
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i]
    const next = matches[i + 1]

    const startIndex = current.index + content.substring(current.index).indexOf(current.number) + current.number.length
    const endIndex = next ? next.index : content.length

    // 괄호 제목 다음부터 시작
    let articleContent = content.substring(startIndex, endIndex).trim()

    // 괄호 제목이 있으면 제거
    if (current.title) {
      articleContent = articleContent.replace(/^\([^)]+\)\s*/, "").trim()
    }

    articles.push({
      number: current.number,
      title: current.title,
      content: articleContent,
    })
  }

  return articles
}

/**
 * 제1조(목적) 추출
 */
export function extractPurposeArticle(ruleContent: AdminRuleContent): AdminRuleArticle | null {
  return ruleContent.articles.find((art) => art.number === "제1조" && art.title === "목적") || null
}

/**
 * 법령 참조 표현 정규화
 * "동법", "같은 법", "영", "규칙" 등을 정규 표현으로 변환
 */
function normalizeLawReferences(content: string, baseLawName: string): string {
  let normalized = content

  // "「법령명」"을 기준 법령명으로 인식
  const baseLawPattern = new RegExp(`「\\s*${baseLawName}\\s*」`, "g")
  const hasBaseLaw = baseLawPattern.test(content)

  if (hasBaseLaw) {
    // 동법 → 「법령명」
    normalized = normalized.replace(/동법(?!\s*시행)/g, `「${baseLawName}」`)

    // 같은 법 → 「법령명」
    normalized = normalized.replace(/같은\s*법(?!\s*시행)/g, `「${baseLawName}」`)

    // 동법시행령, 같은 법 시행령 → 「법령명 시행령」
    normalized = normalized.replace(/(?:동법|같은\s*법)\s*시행령/g, `「${baseLawName} 시행령」`)

    // 동법시행규칙, 같은 법 시행규칙 → 「법령명 시행규칙」
    normalized = normalized.replace(/(?:동법|같은\s*법)\s*시행규칙/g, `「${baseLawName} 시행규칙」`)

    // "영 제N조" → 「법령명 시행령」 제N조
    normalized = normalized.replace(/영\s+(제\d+조)/g, `「${baseLawName} 시행령」 $1`)

    // "규칙 제N조" → 「법령명 시행규칙」 제N조
    normalized = normalized.replace(/규칙\s+(제\d+조)/g, `「${baseLawName} 시행규칙」 $1`)
  }

  return normalized
}

/**
 * 행정규칙 제목에서 법령명과 조문번호 추출
 * 예: "관세법 제97조 재수출면세 제도 시행에 관한 고시" → { lawName: "관세법", article: "제97조" }
 */
function extractLawReferenceFromTitle(title: string): { lawName?: string; article?: string } {
  // 제목에서 "법령명 제N조" 패턴 추출
  const match = title.match(/([\w가-힣]+법(?:\s*시행령|\s*시행규칙)?)\s+(제\d+조(?:의\d+)?)/)

  if (match) {
    return {
      lawName: match[1].trim(),
      article: match[2].trim(),
    }
  }

  return {}
}

/**
 * 행정규칙이 특정 법령 조문을 참조하는지 확인 (제목 + 제1조 통합)
 * @param ruleTitle 행정규칙명
 * @param purposeContent 제1조(목적) 내용
 * @param lawName 법령명 (예: "관세법")
 * @param articleNumber 조문번호 (예: "제38조")
 * @returns 참조 여부
 */
export function checkLawArticleReference(
  purposeContent: string,
  lawName: string,
  articleNumber: string,
  ruleTitle?: string
): boolean {
  // 1. 제목에서 법령 참조 확인
  if (ruleTitle) {
    const titleRef = extractLawReferenceFromTitle(ruleTitle)

    // 제목에 법령명이 있고, 조문번호가 매칭되면 즉시 true
    if (titleRef.lawName && titleRef.article) {
      // 법령명 매칭 (시행령/시행규칙 포함)
      const lawMatches =
        titleRef.lawName.includes(lawName) ||
        titleRef.lawName === `${lawName} 시행령` ||
        titleRef.lawName === `${lawName} 시행규칙`

      // 조문번호 매칭
      const articleMatches = titleRef.article === articleNumber

      if (lawMatches && articleMatches) {
        return true
      }
    }
  }

  // 2. 제1조(목적) 내용에서 법령 참조 확인
  // 법령 참조 표현 정규화
  const normalized = normalizeLawReferences(purposeContent, lawName)

  // 2-1. 정확한 법령명 + 조문번호 패턴
  const exactPattern = new RegExp(`「\\s*${lawName}\\s*」[^「」]*${articleNumber}(?![0-9의])`)
  if (exactPattern.test(normalized)) {
    return true
  }

  // 2-2. 시행령 참조 패턴
  const decreePattern = new RegExp(
    `「\\s*${lawName}\\s*시행령\\s*」[^「」]*${articleNumber}(?![0-9의])`
  )
  if (decreePattern.test(normalized)) {
    return true
  }

  // 2-3. 시행규칙 참조 패턴
  const rulePattern = new RegExp(
    `「\\s*${lawName}\\s*시행규칙\\s*」[^「」]*${articleNumber}(?![0-9의])`
  )
  if (rulePattern.test(normalized)) {
    return true
  }

  return false
}

/**
 * 여러 행정규칙 중에서 특정 법령 조문을 참조하는 것들 필터링
 */
export function filterMatchingAdminRules(
  rules: AdminRuleContent[],
  lawName: string,
  articleNumber: string
): AdminRuleContent[] {
  return rules.filter((rule) => {
    const purpose = extractPurposeArticle(rule)
    if (!purpose) return false
    return checkLawArticleReference(purpose.content, lawName, articleNumber)
  })
}

/**
 * 행정규칙 조문 내용을 HTML로 포맷팅
 * 일반 법령과 동일한 파이프라인 적용:
 * 1. 법령 참조 링크 생성
 * 2. HTML escape (링크 태그만 보존)
 * 3. 개정 마커 스타일링
 * 4. 줄바꿈 → <br> 변환
 * 5. 문단 마커 스타일링
 */
export function formatAdminRuleHTML(content: string, baseLawName?: string): string {
  if (!content || content.trim().length === 0) {
    return ""
  }

  // 1. 링크 생성 (법령 참조 정규화 후)
  const normalized = baseLawName ? normalizeLawReferences(content, baseLawName) : content
  let text = linkifyRefsB(normalized, baseLawName)

  // 2. HTML escape (링크 태그만 보존)
  text = text.replace(/(<a\s[^>]*>|<\/a>)|(<[^>]*>)|([^<]+)/g, (match, linkTag, otherTag, plainText) => {
    if (linkTag) return linkTag  // <a> 태그 보존
    if (otherTag) return escapeHtml(otherTag)  // <개정> 등은 escape
    if (plainText) return escapeHtml(plainText)  // 일반 텍스트 escape
    return match
  })

  // 3. 개정 마커 스타일링
  text = applyRevisionStyling(text)

  // 4. 줄바꿈 → <br> 변환 (개정 마커 스타일링 후)
  text = text.replace(/\n/g, '<br>')

  // 5. 문단 마커 스타일링 (①②③) - 첫 번째는 건너뜀
  let isFirst = true
  text = text.replace(/([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])/g, (match) => {
    if (isFirst) {
      isFirst = false
      return match
    }
    return '<br><span class="para-marker">' + match + '</span>'
  })

  // 6. 번호 항목 줄바꿈 (1., 2., 3.) - 날짜 제외
  text = text.replace(/(?<!\d\. )(\d+\.)\s+(?!\d+\.)/g, '<br>$1 ')

  // 7. 하위 항목 줄바꿈 (가., 나., 다.)
  text = text.replace(/([가-힣]\.)\s+/g, '<br>&nbsp;&nbsp;$1 ')

  return text
}

/**
 * HTML 특수문자 이스케이프
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

/**
 * 개정 마커 스타일링
 */
function applyRevisionStyling(text: string): string {
  let styled = text

  // <개정>, ＜개정＞ 형식
  styled = styled.replace(
    /&lt;(개정|신설|전문개정|제정|삭제)\s+([0-9., ]+)&gt;/g,
    '<span class="rev-mark">＜$1 $2＞</span>',
  )

  styled = styled.replace(
    /＜(개정|신설|전문개정|제정|삭제)\s+([0-9., ]+)＞/g,
    '<span class="rev-mark">＜$1 $2＞</span>',
  )

  // "삭제<날짜>" 또는 "삭제 <날짜>" 형식
  styled = styled.replace(
    /(삭제)\s*&lt;([0-9., ]+)&gt;/g,
    '<span class="rev-mark">$1 ＜$2＞</span>',
  )

  styled = styled.replace(
    /(삭제)\s*＜([0-9., ]+)＞/g,
    '<span class="rev-mark">$1 ＜$2＞</span>',
  )

  // [본조신설], [종전 ~ 이동], [제X조에서 이동] 형식
  styled = styled.replace(
    /\[(본조신설|본조삭제)[^\]]*\]/g,
    '<span class="rev-mark">$&</span>',
  )

  styled = styled.replace(
    /\[종전[^\]]*\]/g,
    '<span class="rev-mark">$&</span>',
  )

  styled = styled.replace(
    /\[제\d+조[^\]]*에서 이동[^\]]*\]/g,
    '<span class="rev-mark">$&</span>',
  )

  return styled
}
