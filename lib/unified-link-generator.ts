/**
 * 통합 링크 생성 시스템
 *
 * 목표:
 * 1. 모든 컴포넌트에서 동일한 링크 생성 규칙 사용
 * 2. 중복 처리 및 충돌 방지
 * 3. 테스트 가능한 구조
 */

export interface LinkConfig {
  mode: 'safe' | 'aggressive'  // safe: 「」 있는 것만, aggressive: 모든 패턴
  enableSameRef?: boolean       // "같은 법" 패턴 활성화
  enableAdminRules?: boolean    // 행정규칙 링크 활성화
  currentLawName?: string       // 현재 보고 있는 법령명 (시행령에서 상위법 추론용)
}

interface LinkMatch {
  start: number
  end: number
  type: 'law-quoted' | 'law-article' | 'law-name' | 'article' | 'decree' | 'rule' | 'same-law'
  lawName?: string
  article?: string
  displayText: string
  html: string
}

/**
 * 통합 링크 생성 함수
 */
export function generateLinks(text: string, config: LinkConfig = { mode: 'safe' }): string {
  const matches: LinkMatch[] = []

  // 1단계: 모든 매칭 수집
  if (config.enableSameRef) {
    collectSameLawMatches(text, matches, config.currentLawName)
  }

  collectQuotedLawMatches(text, matches)

  if (config.mode === 'aggressive') {
    collectUnquotedLawMatches(text, matches)
  }

  collectDecreeMatches(text, matches)
  collectRuleMatches(text, matches)

  if (config.enableAdminRules) {
    collectAdminRuleMatches(text, matches)
  }

  // 2단계: 충돌 해결 (위치 기반 중복 제거)
  const resolvedMatches = resolveConflicts(matches)

  // 3단계: HTML 생성
  return buildHtml(text, resolvedMatches)
}

/**
 * "같은 법" 패턴 수집
 */
function collectSameLawMatches(text: string, matches: LinkMatch[], currentLawName?: string): void {
  // 패턴 1: "같은 법 제X조"
  const sameLawRegex = /같은\s*법\s*제\s*(\d+)\s*조(의\s*(\d+))?(제\s*(\d+)\s*항)?(제\s*(\d+)\s*호)?/g
  let match: RegExpExecArray | null

  while ((match = sameLawRegex.exec(text)) !== null) {
    const offset = match.index
    const fullText = match[0]

    // Find the last 「법령명」 before this position
    const textBefore = text.substring(0, offset)
    const lawMatches = Array.from(textBefore.matchAll(/「\s*([^」]+)\s*」/g))

    if (lawMatches.length > 0) {
      const lastLaw = lawMatches[lawMatches.length - 1]
      const lawName = lastLaw[1].trim()
      const joLabel = `제${match[1]}조${match[3] ? '의' + match[3] : ''}`
      const fullLabel = joLabel + (match[5] ? `제${match[5]}항` : '') + (match[7] ? `제${match[7]}호` : '')

      matches.push({
        start: offset,
        end: offset + fullText.length,
        type: 'same-law',
        lawName,
        article: joLabel,
        displayText: fullText,
        html: `<a href="#" class="law-ref" data-ref="law-article" data-law="${lawName}" data-article="${joLabel}">같은 법 ${fullLabel}</a>`
      })
    }
  }

  // 패턴 2: "법 제X조", "시행령 제X조", "규칙 제X조" (상위법 참조)
  const shortRefRegex = /(법|시행령|규칙)\s+제\s*(\d+)\s*조(의\s*(\d+))?(제\s*(\d+)\s*항)?(제\s*(\d+)\s*호)?/g

  while ((match = shortRefRegex.exec(text)) !== null) {
    const offset = match.index
    const fullText = match[0]
    const refType = match[1] // "법", "시행령", "규칙"

    // Find the last 「법령명」 before this position
    const textBefore = text.substring(0, offset)
    const lawMatches = Array.from(textBefore.matchAll(/「\s*([^」]+)\s*」/g))

    let targetLawName: string | undefined

    if (lawMatches.length > 0) {
      // 「법령명」이 있는 경우
      const lastLaw = lawMatches[lawMatches.length - 1]
      let baseLawName = lastLaw[1].trim()

      // 법령명 변환: "법" → 기본, "시행령" → "법 시행령", "규칙" → "법 시행규칙"
      targetLawName = baseLawName
      if (refType === '시행령') {
        targetLawName = baseLawName.replace(/\s*(시행령|시행규칙)$/, '') + ' 시행령'
      } else if (refType === '규칙') {
        targetLawName = baseLawName.replace(/\s*(시행령|시행규칙)$/, '') + ' 시행규칙'
      }
    } else if (currentLawName) {
      // 「법령명」이 없지만 현재 법령명이 있는 경우 (시행령 → 상위법 추론)
      if (refType === '법') {
        // 현재 법령이 시행령/시행규칙이면 상위법으로 변환
        targetLawName = currentLawName.replace(/\s*(시행령|시행규칙)$/, '')
      } else if (refType === '시행령') {
        targetLawName = currentLawName.includes('시행령') ? currentLawName : currentLawName + ' 시행령'
      } else if (refType === '규칙') {
        targetLawName = currentLawName.replace(/\s*(시행령|시행규칙)$/, '') + ' 시행규칙'
      }
    }

    if (targetLawName) {
      const joLabel = `제${match[2]}조${match[4] ? '의' + match[4] : ''}`
      const fullLabel = joLabel + (match[6] ? `제${match[6]}항` : '') + (match[8] ? `제${match[8]}호` : '')

      matches.push({
        start: offset,
        end: offset + fullText.length,
        type: 'same-law',
        lawName: targetLawName,
        article: joLabel,
        displayText: fullText,
        html: `<a href="#" class="law-ref" data-ref="law-article" data-law="${targetLawName}" data-article="${joLabel}">${refType} ${fullLabel}</a>`
      })
    }
  }
}

/**
 * 「법령명」 패턴 수집 (가장 안전)
 */
function collectQuotedLawMatches(text: string, matches: LinkMatch[]): void {
  // 「법령명」 제X조 패턴
  const articleRegex = /「\s*([^」]+)\s*」\s*제\s*(\d+)\s*조(의\s*(\d+))?(제\s*(\d+)\s*항)?(제\s*(\d+)\s*호)?/g
  let match: RegExpExecArray | null

  while ((match = articleRegex.exec(text)) !== null) {
    const lawName = match[1].trim()
    const joLabel = `제${match[2]}조${match[4] ? '의' + match[4] : ''}`
    const fullLabel = joLabel + (match[6] ? `제${match[6]}항` : '') + (match[8] ? `제${match[8]}호` : '')

    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      type: 'law-quoted',
      lawName,
      article: joLabel,
      displayText: match[0],
      html: `<a href="#" class="law-ref" data-ref="law-article" data-law="${lawName}" data-article="${joLabel}">「${lawName}」 ${fullLabel}</a>`
    })
  }

  // 「법령명」 단독 패턴
  const nameRegex = /「\s*([^」]+)\s*」(?!\s*제\s*\d+\s*조)/g

  while ((match = nameRegex.exec(text)) !== null) {
    const lawName = match[1].trim()

    // 이미 처리된 영역인지 확인
    const isOverlap = matches.some(m =>
      m.start <= match.index && match.index < m.end
    )

    if (!isOverlap) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        type: 'law-quoted',
        lawName,
        displayText: match[0],
        html: `<a href="#" class="law-ref" data-ref="law" data-law="${lawName}">${match[0]}</a>`
      })
    }
  }
}

/**
 * 「」 없는 법령명 패턴 수집 (aggressive 모드)
 * 단순 법령명 + 시행령/시행규칙 패턴 처리
 */
function collectUnquotedLawMatches(text: string, matches: LinkMatch[]): void {
  // 법령명 패턴: 기본 법령명 + 선택적 시행령/시행규칙
  // "관세법 제38조", "도로법 시행령 제55조" 등
  const simpleRegex = /(?<!「)([가-힣a-zA-Z0-9·]{2,20}(?:법|령|규칙|조례)(?:\s+시행령|\s+시행규칙)?)\s+제\s*(\d+)\s*조(의\s*(\d+))?(제\s*(\d+)\s*항)?(제\s*(\d+)\s*호)?/g
  let match: RegExpExecArray | null

  while ((match = simpleRegex.exec(text)) !== null) {
    // 이미 「」로 처리된 영역 제외
    const isInQuoted = matches.some(m =>
      m.type === 'law-quoted' &&
      match.index >= m.start &&
      match.index < m.end
    )

    if (!isInQuoted) {
      const lawName = match[1].trim()
      const joLabel = `제${match[2]}조${match[4] ? '의' + match[4] : ''}`
      const fullText = match[0]

      matches.push({
        start: match.index,
        end: match.index + fullText.length,
        type: 'law-article',
        lawName,
        article: joLabel,
        displayText: fullText,
        html: `<a href="#" class="law-ref" data-ref="law-article" data-law="${lawName}" data-article="${joLabel}">${fullText}</a>`
      })
    }
  }
}

/**
 * 대통령령/시행령 패턴 수집
 */
function collectDecreeMatches(text: string, matches: LinkMatch[]): void {
  // 패턴: "대통령령으로 정하는"
  const decreeRegex = /(대통령령)(?:으로|로)\s*정하는/g
  let match: RegExpExecArray | null

  while ((match = decreeRegex.exec(text)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      type: 'decree',
      displayText: match[0],
      html: `<a href="#" class="law-ref" data-ref="related" data-kind="decree">${match[0]}</a>`
    })
  }
}

/**
 * 부령/시행규칙 패턴 수집
 */
function collectRuleMatches(text: string, matches: LinkMatch[]): void {
  // 패턴: "XXX부령으로 정하는"
  const ruleRegex = /([가-힣]+부령)(?:으로|로)\s*정하는/g
  let match: RegExpExecArray | null

  while ((match = ruleRegex.exec(text)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      type: 'rule',
      displayText: match[0],
      html: `<a href="#" class="law-ref" data-ref="related" data-kind="rule">${match[0]}</a>`
    })
  }
}

/**
 * 행정규칙 패턴 수집
 */
function collectAdminRuleMatches(text: string, matches: LinkMatch[]): void {
  // 패턴: "관세청장이 정하는"
  const adminRegex = /([가-힣]+(?:청장|장관|부장관|차관|위원장|원장|이사장))(?:이|가)\s*정하는/g
  let match: RegExpExecArray | null

  while ((match = adminRegex.exec(text)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      type: 'rule',
      displayText: match[0],
      html: `<a href="#" class="law-ref" data-ref="regulation" data-kind="administrative">${match[0]}</a>`
    })
  }
}

/**
 * 충돌 해결 (겹치는 매칭 제거)
 */
function resolveConflicts(matches: LinkMatch[]): LinkMatch[] {
  // 시작 위치로 정렬
  matches.sort((a, b) => a.start - b.start)

  const resolved: LinkMatch[] = []
  let lastEnd = 0

  for (const match of matches) {
    // 이전 매칭과 겹치지 않는 경우만 추가
    if (match.start >= lastEnd) {
      resolved.push(match)
      lastEnd = match.end
    } else {
      // 겹치는 경우 우선순위 판단
      const lastMatch = resolved[resolved.length - 1]

      // 우선순위: law-quoted > law-article > others
      const priority: Record<string, number> = {
        'law-quoted': 100,
        'same-law': 90,
        'law-article': 80,
        'law-name': 70,
        'article': 60,
        'decree': 50,
        'rule': 40
      }

      if (priority[match.type] > priority[lastMatch.type]) {
        // 새 매칭이 우선순위가 높으면 교체
        resolved[resolved.length - 1] = match
        lastEnd = match.end
      }
    }
  }

  return resolved
}

/**
 * 최종 HTML 생성
 */
function buildHtml(text: string, matches: LinkMatch[]): string {
  if (matches.length === 0) {
    return text
  }

  let result = ''
  let lastPos = 0

  for (const match of matches) {
    // 매칭 이전 텍스트
    result += text.slice(lastPos, match.start)
    // 링크 HTML
    result += match.html
    lastPos = match.end
  }

  // 마지막 텍스트
  result += text.slice(lastPos)

  return result
}

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

  // 3. HTML 태그는 보존하고 텍스트만 재이스케이프
  return linked.replace(/(<[^>]+>)|([^<]+)/g, (match, tag, text) => {
    if (tag) return tag // 모든 HTML 태그 보존
    if (text) {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
    }
    return match
  })
}