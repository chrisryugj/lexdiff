/**
 * 특화 링크 생성 함수 모음
 *
 * - linkifyRefsB: 법령 뷰어용 (safe 모드)
 * - linkifyRefsAI: AI 답변용 (aggressive 모드)
 * - linkifyMarkdownLegalRefs: Markdown용 법령 참조 링크 변환
 * - collectPrecedentMatches: 판례 패턴 수집
 */

import { escapeHtml } from './law-data-utils'
import type { LinkMatch } from './unified-link-generator'
import { generateLinks, getAriaLabel } from './unified-link-generator'

/**
 * 호환성을 위한 기존 함수명 제공
 */
export function linkifyRefsB(text: string, currentLawName?: string): string {
  return generateLinks(text, {
    mode: 'safe',
    enableSameRef: true,
    enableAdminRules: true,
    currentLawName
  })
}

/**
 * AI 답변용 (aggressive 모드)
 * 이스케이프된 HTML 텍스트를 처리
 */
export function linkifyRefsAI(escapedText: string): string {
  // 1. HTML 디코드
  const text = escapedText
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')

  // 2. 링크 생성
  const linked = generateLinks(text, {
    mode: 'aggressive',
    enableSameRef: false,
    enableAdminRules: false
  })

  // 3. <a> 태그만 보존하고 텍스트만 재이스케이프 (XSS 방지: <a> 외 태그 이스케이프)
  return linked.replace(/(<a\s[^>]*>|<\/a>)|(<[^>]+>)|([^<]+)/g, (match, aTag, otherTag, plainText) => {
    if (aTag) return aTag // <a> 태그만 보존
    if (otherTag) {
      // <a> 외 태그는 이스케이프
      return otherTag.replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }
    if (plainText) {
      return plainText
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
    }
    return match
  })
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 판례 링크 수집
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 【원심판결】 섹션 내 판례 링크 제거용 헬퍼
 * "【원심판결】 부산고법 2025. 4. 25. 선고 2024누22242 판결" 같은 줄은 링크 안 걸기
 */
function isInOriginalJudgmentSection(text: string, position: number): boolean {
  // 현재 위치에서 앞으로 최대 100자 탐색해서 【원심판결】 태그 찾기
  const searchStart = Math.max(0, position - 100)
  const beforeText = text.substring(searchStart, position)

  // 【원심판결】이 같은 줄에 있는지 확인
  const lastLineBreak = beforeText.lastIndexOf('\n')
  const currentLine = lastLineBreak === -1 ? beforeText : beforeText.substring(lastLineBreak + 1)

  return /【\s*원심\s*판결\s*】/.test(currentLine)
}

/**
 * 판례 패턴 수집
 * 예: "대법원 2004. 5. 28. 선고 2003두7392 판결", "91누13670 판결"
 * ⚠️ 【원심판결】 섹션 내 판례는 링크 제외
 */
export function collectPrecedentMatches(text: string, matches: LinkMatch[]): void {
  let match: RegExpExecArray | null

  // 패턴 1: 완전한 형식 (대법원/고등법원 2024. 1. 2. 선고 2023다12345 판결)
  const fullPattern = /(대법원|고등법원|지방법원|[가-힣]+법원)\s*(\d{4})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})\s*\.?\s*선고\s*(\d{2,4})(다|가|나|라|마|바|사|아|자|차|카|타|파|하|고|노|도|로|모|보|소|오|조|초|코|토|포|호|두|누|부|구|추|머|거|러|스|느|허|헌가|헌나|헌다|헌라|헌마|헌바|헌사|헌아)(\d+)\s*(판결|결정)/g

  while ((match = fullPattern.exec(text)) !== null) {
    const court = match[1]
    const year = match[2]
    const month = match[3]
    const day = match[4]
    const caseYear = match[5]
    const caseType = match[6]
    const caseNum = match[7]

    const caseNumber = `${caseYear}${caseType}${caseNum}`
    const fullText = match[0]

    // 이미 처리된 영역인지 확인
    const isOverlap = matches.some(m =>
      match!.index >= m.start && match!.index < m.end
    )

    // ✅ 【원심판결】 섹션 내 판례는 링크 제외
    const isOriginalJudgment = isInOriginalJudgmentSection(text, match.index)

    if (!isOverlap && !isOriginalJudgment) {
      matches.push({
        start: match.index,
        end: match.index + fullText.length,
        type: 'precedent',
        caseNumber,
        displayText: fullText,
        html: `<a href="#" class="law-ref precedent-ref" data-ref="precedent" data-case-number="${escapeHtml(caseNumber)}" data-court="${escapeHtml(court)}" data-date="${escapeHtml(`${year}.${month}.${day}`)}" aria-label="${escapeHtml(getAriaLabel('precedent', undefined, undefined, undefined, caseNumber))}">${escapeHtml(fullText)}</a>`
      })
    }
  }

  // 패턴 2: 간단 패턴 - 사건번호만 (예: "91누13670 판결", "2023두12345")
  const simpleCasePattern = /(?<!\d)(\d{2,4})(다|가|나|라|마|바|사|아|자|차|카|타|파|하|고|노|도|로|모|보|소|오|조|초|코|토|포|호|두|누|부|구|추|머|거|러|스|느|허|헌가|헌나|헌다|헌라|헌마|헌바|헌사|헌아)(\d+)(?:\s*(판결|결정))?/g

  while ((match = simpleCasePattern.exec(text)) !== null) {
    const caseYear = match[1]
    const caseType = match[2]
    const caseNum = match[3]

    const caseNumber = `${caseYear}${caseType}${caseNum}`
    const fullText = match[0]

    // 이미 처리된 영역인지 확인
    const isOverlap = matches.some(m =>
      (match!.index >= m.start && match!.index < m.end) ||
      (m.start >= match!.index && m.start < match!.index + fullText.length)
    )

    // ✅ 【원심판결】 섹션 내 판례는 링크 제외
    const isOriginalJudgment = isInOriginalJudgmentSection(text, match.index)

    if (!isOverlap && !isOriginalJudgment) {
      matches.push({
        start: match.index,
        end: match.index + fullText.length,
        type: 'precedent',
        caseNumber,
        displayText: fullText,
        html: `<a href="#" class="law-ref precedent-ref" data-ref="precedent" data-case-number="${escapeHtml(caseNumber)}" aria-label="${escapeHtml(getAriaLabel('precedent', undefined, undefined, undefined, caseNumber))}">${escapeHtml(fullText)}</a>`
      })
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Markdown용 링크 생성 함수 (react-markdown 지원)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Markdown 텍스트 내의 법령 참조를 Markdown 링크로 변환
 * 「법령명」 제N조 → [「법령명」 제N조](law://법령명/제N조)
 * 「법령명」 별표 1 → [별표 1](annex://법령명/1)
 * 「법령명」 별지 제2호서식 → [별지 제2호서식](annex://법령명/별지제2호서식)
 *
 * react-markdown에서 사용하기 위한 전처리 함수
 */
export function linkifyMarkdownLegalRefs(markdown: string): string {
  if (!markdown) return ''

  let result = markdown

  // 패턴 1: 「법령명」 제N조, 제M조 또는 제N조 및 제M조 (쉼표/및/과/와로 연결된 복수 조문)
  // 예: 「민법」 제390조, 제393조 → 각각 개별 링크
  // 예: 「조례」 제3조 및 제6조 → 각각 개별 링크
  result = result.replace(
    /(?<!\[)「([^」]+)」\s*(제\s*\d+\s*조(?:의\s*\d+)?)((?:\s*(?:,|및|과|와)\s*제\s*\d+\s*조(?:의\s*\d+)?)*)/g,
    (match, lawName, firstArticle, restArticles) => {
      const encodedLaw = encodeURIComponent(lawName.trim())

      // leading zero 제거 헬퍼: "제0014조의02" → "제14조의2"
      const normalizeArticle = (art: string) =>
        art.replace(/제0*(\d+)/g, (_, n) => `제${parseInt(n, 10)}`)
           .replace(/의0*(\d+)/g, (_, n) => `의${parseInt(n, 10)}`)
           .replace(/\s+/g, '')

      // 첫 번째 조문 링크 (조 단위만 링크, 항/호는 링크 밖)
      const displayFirst = normalizeArticle(firstArticle)
      let result = `[「${lawName}」 ${displayFirst}](law://${encodedLaw}/${encodeURIComponent(displayFirst)})`

      // 나머지 조문들 (쉼표/및/과/와로 구분)
      if (restArticles) {
        const pairRegex = /\s*(,|및|과|와)\s*(제\s*\d+\s*조(?:의\s*\d+)?)/g
        let pair: RegExpExecArray | null
        while ((pair = pairRegex.exec(restArticles)) !== null) {
          const connector = pair[1]
          const article = pair[2]
          const displayArticle = normalizeArticle(article)
          const sep = connector === ',' ? ',' : ` ${connector}`
          result += `${sep} [${displayArticle}](law://${encodedLaw}/${encodeURIComponent(displayArticle)})`
        }
      }

      return result
    }
  )

  // 패턴 2a: 「법령명」 [별표] 또는 「법령명」 [별표 N] (대괄호 포함, 숫자 선택적)
  // 예: 「여권법 시행령」 제39조 [별표] → [별표](annex://여권법 시행령/1)
  //     「관세법」 [별표 2] → [별표 2](annex://관세법/2)
  result = result.replace(
    /「([^」]+)」(?:[^「」\n]{0,30})\[별표\s*(\d+)?(?:의(\d+))?\]/g,
    (match, lawName, num1, num2) => {
      const encodedLaw = encodeURIComponent(lawName.trim())
      let annexId: string
      let displayText: string

      if (num1) {
        annexId = num2 ? `${num1}의${num2}` : num1
        displayText = num2 ? `별표 ${num1}의${num2}` : `별표 ${num1}`
      } else {
        annexId = '1'
        displayText = '별표'
      }

      return `[${displayText}](annex://${encodedLaw}/${encodeURIComponent(annexId)})`
    }
  )

  // 패턴 2b: 「법령명」 별표/별지 (명시적 법령명, 대괄호 없음)
  // 예: 「도로법 시행령」 별표3 → [별표3](annex://도로법 시행령/3)
  //     「조례」 별표 1 → [별표 1](annex://조례/1)
  //     「규칙」 별지 제2호서식 → [별지 제2호서식](annex://규칙/별지제2호서식)
  result = result.replace(
    /(?<!\[)「([^」]+)」\s+(별표|별지)\s*(\d+)?(?:의(\d+))?\s*(?:제\s*(\d+)\s*호\s*서식)?/g,
    (match, lawName, type, num1, num2, formNum) => {
      const encodedLaw = encodeURIComponent(lawName.trim())

      let annexId: string
      let displayText: string

      if (type === '별표') {
        // 별표: "별표 1", "별표 2의3", 숫자 없으면 기본값 "1"
        if (num1) {
          annexId = num2 ? `${num1}의${num2}` : num1
          displayText = num2 ? `별표 ${num1}의${num2}` : `별표 ${num1}`
        } else {
          annexId = '1'
          displayText = '별표'
        }
      } else {
        // 별지: "별지 제2호서식"
        if (formNum) {
          annexId = `별지제${formNum}호서식`
          displayText = `별지 제${formNum}호서식`
        } else {
          annexId = num2 ? `별지${num1}의${num2}` : `별지${num1}`
          displayText = num2 ? `별지 ${num1}의${num2}` : `별지 ${num1}`
        }
      }

      return `[${displayText}](annex://${encodedLaw}/${encodeURIComponent(annexId)})`
    }
  )

  // 패턴 3a: [별표] 또는 [별표 N] 단독 (대괄호 포함, 문맥 추론)
  // 가장 가까운 「법령명」을 찾아서 링크 생성
  result = result.replace(
    /\[(별표)\s*(\d+)?(?:의(\d+))?\]/g,
    (match, _type, num1, num2, offset: number, fullString: string) => {
      // 이미 링크로 변환된 부분 제외
      const beforeText = fullString.substring(Math.max(0, offset - 500), offset)
      if (beforeText.includes('](annex://')) return match

      const lawNamePattern = /「([^」]+)」/g
      let lawName: string | undefined
      let lastMatch: RegExpExecArray | null = null
      while ((lastMatch = lawNamePattern.exec(beforeText)) !== null) {
        lawName = lastMatch[1]
      }
      if (!lawName) return match

      const encodedLaw = encodeURIComponent(lawName.trim())
      let annexId: string
      let displayText: string
      if (num1) {
        annexId = num2 ? `${num1}의${num2}` : num1
        displayText = num2 ? `별표 ${num1}의${num2}` : `별표 ${num1}`
      } else {
        annexId = '1'
        displayText = '별표'
      }
      return `[${displayText}](annex://${encodedLaw}/${encodeURIComponent(annexId)})`
    }
  )

  // 패턴 3b: 별표/별지 단독 (대괄호 없음, 문맥 추론)
  // "조례 별표1", "별표 1에 따르며", "별지 제2호서식", "별표와 같다" → 가장 가까운 「법령명」 찾기
  // ✅ 수정: "별지 제X호서식" 순서 지원 + 숫자 선택적 (별표와 같다)
  result = result.replace(
    /(?<!\[)(별표|별지)(?:\s*제\s*(\d+)\s*호\s*서식|\s*(\d+)(?:의(\d+))?)?(?:\s*(?:에|을|를|과|와|의|이|가)\s*(?:따르|정하는|같다|해당|따른))?/g,
    (match, type, formNum, num1, num2, offset, fullString) => {
      // 이미 링크로 변환된 부분 제외 (「법령명」 패턴)
      const beforeText = fullString.substring(Math.max(0, offset - 150), offset)
      if (beforeText.includes('](annex://')) return match

      // 가장 가까운 「법령명」 찾기 (뒤에서부터 검색)
      const lawNamePattern = /「([^」]+)」/g
      let lawName: string | undefined
      let lastMatch: RegExpExecArray | null = null

      while ((lastMatch = lawNamePattern.exec(beforeText)) !== null) {
        lawName = lastMatch[1]
      }

      if (!lawName) return match // 법령명을 찾을 수 없으면 링크 안 걸기

      const encodedLaw = encodeURIComponent(lawName.trim())

      let annexId: string
      let displayText: string

      if (type === '별표') {
        // ✅ 별표: 숫자 없으면 "1" 기본값 (조례에서 별표 하나인 경우)
        if (num1) {
          annexId = num2 ? `${num1}의${num2}` : num1
          displayText = num2 ? `별표 ${num1}의${num2}` : `별표 ${num1}`
        } else {
          annexId = '1'
          displayText = '별표'
        }
      } else {
        // ✅ 별지: "제X호서식" 형태가 우선
        if (formNum) {
          annexId = `별지제${formNum}호서식`
          displayText = `별지 제${formNum}호서식`
        } else if (num1) {
          annexId = num2 ? `별지${num1}의${num2}` : `별지${num1}`
          displayText = num2 ? `별지 ${num1}의${num2}` : `별지 ${num1}`
        } else {
          return match  // 별지는 숫자/서식번호 필수
        }
      }

      return `[${displayText}](annex://${encodedLaw}/${encodeURIComponent(annexId)})`
    }
  )

  // 패턴 3c: "같은 법 (시행령/시행규칙) 제X조" → 앞의 「법령명」 참조
  result = result.replace(
    /같은\s*법\s*(시행령|시행규칙)?\s*제\s*(\d+)\s*조(?:의\s*(\d+))?/g,
    (match, suffix, joNum, subNum, offset: number, fullString: string) => {
      const beforeText = fullString.substring(Math.max(0, offset - 500), offset)
      const lawNamePattern = /「([^」]+)」/g
      let lawName: string | undefined
      let lastMatch: RegExpExecArray | null = null
      while ((lastMatch = lawNamePattern.exec(beforeText)) !== null) {
        lawName = lastMatch[1]
      }
      if (!lawName) return match

      // 「소비자기본법」 ... 같은 법 시행령 제X조 → "소비자기본법 시행령"
      let targetLaw = lawName.trim().replace(/\s*(시행령|시행규칙)$/, '')
      if (suffix) targetLaw += ` ${suffix}`

      const article = `제${joNum}조${subNum ? '의' + subNum : ''}`
      const encodedLaw = encodeURIComponent(targetLaw)
      return `[${match}](law://${encodedLaw}/${encodeURIComponent(article)})`
    }
  )

  // 패턴 4: 「법령명」 단독 (조문 없이 법령명만)
  // 이미 링크로 변환된 부분은 제외
  result = result.replace(
    /(?<!\[)「([^」]+)」(?!\s*(?:제\s*\d|별표|별지))(?!\])/g,
    (match, lawName) => {
      const encodedLaw = encodeURIComponent(lawName.trim())
      return `[「${lawName}」](law://${encodedLaw})`
    }
  )

  return result
}
