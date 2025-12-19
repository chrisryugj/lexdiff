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

/**
 * 법령명에서 타입 감지
 */
function detectLawType(lawName: string): 'decree' | 'rule' | 'law' {
  if (/시행령/.test(lawName)) return 'decree'
  if (/시행규칙/.test(lawName)) return 'rule'
  return 'law'
}

/**
 * 접근성: 링크 타입별 aria-label 생성
 */
function getAriaLabel(type: string, lawName?: string, article?: string, annexNumber?: string): string {
  const labels: Record<string, string> = {
    'law-quoted': '법령 참조',
    'law-article': '법령 조문 참조',
    'law-name': '법령 참조',
    'article': '조문 이동',
    'same-law': '같은 법 조문 참조',
    'decree': '시행령 참조',
    'rule': '시행규칙 참조',
    'regulation': '행정규칙 참조',
    'annex': '별표 보기',
  }
  const baseLabel = labels[type] || '법령 참조'
  if (annexNumber) return `별표 ${annexNumber} ${baseLabel}`
  if (lawName && article) return `${lawName} ${article} ${baseLabel}`
  if (lawName) return `${lawName} ${baseLabel}`
  if (article) return `${article} ${baseLabel}`
  return baseLabel
}

interface LinkMatch {
  start: number
  end: number
  type: 'law-quoted' | 'law-article' | 'law-name' | 'article' | 'decree' | 'rule' | 'same-law' | 'annex'
  lawName?: string
  article?: string
  annexNumber?: string  // 별표 번호 (예: "1", "2의3")
  displayText: string
  html: string
}

/**
 * 통합 링크 생성 함수
 */
export function generateLinks(text: string, config: LinkConfig = { mode: 'safe' }): string {
  const matches: LinkMatch[] = []

  // 1단계: 모든 매칭 수집
  // CRITICAL: 내부 조문 참조를 가장 먼저 수집 (우선권)
  collectInternalArticleMatches(text, matches)

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

  // 별표 패턴 수집 (항상 활성화)
  collectAnnexMatches(text, matches)

  // DEBUG: 매칭 결과 로깅
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
        html: `<a href="javascript:void(0)" class="law-ref" data-ref="law-article" data-law="${lawName}" data-article="${joLabel}" aria-label="${getAriaLabel('same-law', lawName, joLabel)}">같은 법 ${fullLabel}</a>`
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
        html: `<a href="javascript:void(0)" class="law-ref" data-ref="law-article" data-law="${targetLawName}" data-article="${joLabel}" aria-label="${getAriaLabel('same-law', targetLawName, joLabel)}">${refType} ${fullLabel}</a>`
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
    const lawType = detectLawType(lawName)
    const joLabel = `제${match[2]}조${match[4] ? '의' + match[4] : ''}`
    const fullLabel = joLabel + (match[6] ? `제${match[6]}항` : '') + (match[8] ? `제${match[8]}호` : '')

    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      type: 'law-quoted',
      lawName,
      article: joLabel,
      displayText: match[0],
      html: `<a href="javascript:void(0)" class="law-ref" data-ref="law-article" data-law="${lawName}" data-article="${joLabel}" data-law-type="${lawType}" aria-label="${getAriaLabel('law-article', lawName, joLabel)}">「${lawName}」 ${fullLabel}</a>`
    })
  }

  // 「법령명」 단독 패턴
  const nameRegex = /「\s*([^」]+)\s*」(?!\s*제\s*\d+\s*조)/g

  while ((match = nameRegex.exec(text)) !== null) {
    const lawName = match[1].trim()
    const lawType = detectLawType(lawName)

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
        html: `<a href="javascript:void(0)" class="law-ref" data-ref="law" data-law="${lawName}" data-law-type="${lawType}" aria-label="${getAriaLabel('law-quoted', lawName)}">${match[0]}</a>`
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
        html: `<a href="javascript:void(0)" class="law-ref" data-ref="law-article" data-law="${lawName}" data-article="${joLabel}" aria-label="${getAriaLabel('law-article', lawName, joLabel)}">${fullText}</a>`
      })
    }
  }
}

/**
 * 내부 조문 참조 패턴 수집
 * 예: "제5조", "제10조의2", "제5조제2항", "(제39조에"
 */
function collectInternalArticleMatches(text: string, matches: LinkMatch[]): void {
  // 패턴: 제X조 (독립적으로 나타나는 경우)
  // 부정 후방탐색: 「법령명」 패턴 제외
  // 전방 허용: 괄호(, 공백, 문장 시작
  // 후방 허용: 한글 조사 "에", "의", "을", "를", 괄호) 등
  // ⚠️ "제3조의 4차산업" 버그 수정: "의" 뒤에 숫자만 허용 (공백 후 한글이 오면 제외)
  // ⚠️ "제10조의2" 버그 수정: "조\s*" → "조"로 변경 (공백이 의를 먹어버리는 문제)
  //    그룹: (1)전체, (2)조번호, (3)의X전체, (4)X, (5)항, (6)호
  const articleRegex = /(?<!「[^」]*)(제\s*(\d+)\s*조(의(\d+))?)(?:제\s*(\d+)\s*항)?(?:제\s*(\d+)\s*호)?(?![」])/g
  let match: RegExpExecArray | null
  let foundCount = 0

  while ((match = articleRegex.exec(text)) !== null) {
    foundCount++

    // 이미 처리된 영역인지 확인
    const isOverlap = matches.some(m =>
      match!.index >= m.start && match!.index < m.end
    )

    if (isOverlap) {
      continue
    }

    // 그룹: (1)전체, (2)조번호, (3)의X전체, (4)X, (5)항, (6)호
    const joLabel = `제${match[2]}조${match[4] ? '의' + match[4] : ''}`
    const fullLabel = match[1] + (match[5] ? `제${match[5]}항` : '') + (match[6] ? `제${match[6]}호` : '')

    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      type: 'article',
      article: joLabel,
      displayText: match[0],
      html: `<a href="javascript:void(0)" class="law-ref" data-ref="article" data-article="${joLabel}" aria-label="${getAriaLabel('article', undefined, joLabel)}">${fullLabel}</a>`
    })
  }
}

/**
 * 대통령령/시행령 패턴 수집
 */
function collectDecreeMatches(text: string, matches: LinkMatch[]): void {
  // 패턴: "대통령령으로 정하는" 또는 "대통령령으로 정한다"
  const decreeRegex = /(대통령령)(?:으로|로)\s*정(?:하는|한다)/g
  let match: RegExpExecArray | null

  while ((match = decreeRegex.exec(text)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      type: 'decree',
      displayText: match[0],
      html: `<a href="javascript:void(0)" class="law-ref" data-ref="related" data-kind="decree" aria-label="${getAriaLabel('decree')}">${match[0]}</a>`
    })
  }
}

/**
 * 부령/시행규칙 패턴 수집
 */
function collectRuleMatches(text: string, matches: LinkMatch[]): void {
  // 패턴: "XXX부령으로 정하는" 또는 "XXX부령으로 정한다"
  const ruleRegex = /([가-힣]+부령)(?:으로|로)\s*정(?:하는|한다)/g
  let match: RegExpExecArray | null

  while ((match = ruleRegex.exec(text)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      type: 'rule',
      displayText: match[0],
      html: `<a href="javascript:void(0)" class="law-ref" data-ref="related" data-kind="rule" aria-label="${getAriaLabel('rule')}">${match[0]}</a>`
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
      html: `<a href="javascript:void(0)" class="law-ref" data-ref="regulation" data-kind="administrative" aria-label="${getAriaLabel('regulation')}">${match[0]}</a>`
    })
  }
}

/**
 * 별표 앞에서 법령명 추출
 * 「법령명」 별표 1 → "법령명" 반환
 * 별표 1 (법령명 없음) → undefined 반환
 */
function extractLawNameBeforeAnnex(text: string, annexIndex: number): string | undefined {
  // 별표 앞 50자 내에서 「법령명」 패턴 검색
  const searchStart = Math.max(0, annexIndex - 50)
  const beforeText = text.substring(searchStart, annexIndex)

  // 가장 가까운 「법령명」 찾기 (마지막 매칭)
  const lawNamePattern = /「([^」]+)」/g
  let lastMatch: RegExpExecArray | null = null
  let match: RegExpExecArray | null

  while ((match = lawNamePattern.exec(beforeText)) !== null) {
    lastMatch = match
  }

  if (lastMatch) {
    // 「법령명」과 별표 사이에 다른 법령명이 없는지 확인
    const between = beforeText.substring(lastMatch.index + lastMatch[0].length)
    // 중간에 다른 「」가 없어야 함
    if (!between.includes('「')) {
      return lastMatch[1]
    }
  }

  return undefined
}

/**
 * 별표(附表) 패턴 수집
 * 패턴:
 * - [별표 1], [별표 2의3] (대괄호 포함)
 * - 별표 1, 별표 2의3 (대괄호 없음)
 * - 별표 1과 같다, 별표 1에 따른 (문맥)
 *
 * AI 답변 등에서 법령명 컨텍스트 없이 호출될 수 있으므로
 * 앞에 「법령명」이 있으면 data-law 속성 추가
 */
function collectAnnexMatches(text: string, matches: LinkMatch[]): void {
  // 패턴 1: [별표 X] 또는 [별표 X의Y] (대괄호 포함)
  const bracketPattern = /\[별표\s*(\d+)(?:의(\d+))?\]/g
  let match: RegExpExecArray | null

  while ((match = bracketPattern.exec(text)) !== null) {
    const annexNum = match[2] ? `${match[1]}의${match[2]}` : match[1]
    const lawName = extractLawNameBeforeAnnex(text, match.index)

    // 이미 처리된 영역인지 확인
    const isOverlap = matches.some(m =>
      match!.index >= m.start && match!.index < m.end
    )

    if (!isOverlap) {
      const dataLawAttr = lawName ? ` data-law="${lawName}"` : ''
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        type: 'annex',
        lawName,
        annexNumber: annexNum,
        displayText: match[0],
        html: `<a href="javascript:void(0)" class="law-ref annex-ref" data-ref="annex" data-annex="${annexNum}"${dataLawAttr} aria-label="${getAriaLabel('annex', lawName, undefined, annexNum)}">${match[0]}</a>`
      })
    }
  }

  // 패턴 2: 별표 X (대괄호 없이, 문맥 포함)
  // "별표 1과 같다", "별표 1에 따른", "별표 1에서 정하는" 등
  const plainPattern = /(?<!\[)별표\s*(\d+)(?:의(\d+))?(?:\s*(?:과|와|에|을|를|의|이|가)\s*(?:같다|따른|따르는|따라|정하는|정한|따름|해당))?/g

  while ((match = plainPattern.exec(text)) !== null) {
    const annexNum = match[2] ? `${match[1]}의${match[2]}` : match[1]
    const lawName = extractLawNameBeforeAnnex(text, match.index)

    // 이미 처리된 영역인지 확인 (대괄호 패턴과 중복 방지)
    const isOverlap = matches.some(m =>
      (match!.index >= m.start && match!.index < m.end) ||
      (m.start >= match!.index && m.start < match!.index + match![0].length)
    )

    if (!isOverlap) {
      const dataLawAttr = lawName ? ` data-law="${lawName}"` : ''
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        type: 'annex',
        lawName,
        annexNumber: annexNum,
        displayText: match[0],
        html: `<a href="javascript:void(0)" class="law-ref annex-ref" data-ref="annex" data-annex="${annexNum}"${dataLawAttr} aria-label="${getAriaLabel('annex', lawName, undefined, annexNum)}">${match[0]}</a>`
      })
    }
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
        'annex': 65,
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

  // 패턴 1: 「법령명」 제N조, 제M조 (쉼표로 연결된 복수 조문)
  // 예: 「민법」 제390조, 제393조 → 각각 개별 링크
  result = result.replace(
    /(?<!\[)「([^」]+)」\s*(제\s*\d+\s*조(?:의\s*\d+)?(?:\s*제\s*\d+\s*항)?(?:\s*제\s*\d+\s*호)?)((?:\s*,\s*제\s*\d+\s*조(?:의\s*\d+)?(?:\s*제\s*\d+\s*항)?(?:\s*제\s*\d+\s*호)?)*)/g,
    (match, lawName, firstArticle, restArticles) => {
      const encodedLaw = encodeURIComponent(lawName.trim())

      // 첫 번째 조문 링크
      const normalizedFirst = firstArticle.replace(/\s+/g, '')
      let result = `[「${lawName}」 ${firstArticle}](law://${encodedLaw}/${encodeURIComponent(normalizedFirst)})`

      // 나머지 조문들 (쉼표로 구분)
      if (restArticles) {
        const additionalArticles = restArticles.match(/제\s*\d+\s*조(?:의\s*\d+)?(?:\s*제\s*\d+\s*항)?(?:\s*제\s*\d+\s*호)?/g)
        if (additionalArticles) {
          for (const article of additionalArticles) {
            const normalizedArticle = article.replace(/\s+/g, '')
            result += `, [${article}](law://${encodedLaw}/${encodeURIComponent(normalizedArticle)})`
          }
        }
      }

      return result
    }
  )

  // 패턴 2: 「법령명」 별표/별지 (명시적 법령명)
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
        // 별표: "별표 1", "별표 2의3"
        annexId = num2 ? `${num1}의${num2}` : num1
        displayText = num2 ? `별표 ${num1}의${num2}` : `별표 ${num1}`
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

  // 패턴 3: 별표/별지 단독 (문맥 추론)
  // "조례 별표1", "별표 1에 따르며" → 가장 가까운 「법령명」 찾기
  result = result.replace(
    /(?<!\[)(별표|별지)\s*(\d+)(?:의(\d+))?\s*(?:제\s*(\d+)\s*호\s*서식)?(?:\s*(?:에|을|를|과|와|의|이|가)\s*(?:따르|정하는|같다|해당|따른))?/g,
    (match, type, num1, num2, formNum, offset, fullString) => {
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
        annexId = num2 ? `${num1}의${num2}` : num1
        displayText = num2 ? `별표 ${num1}의${num2}` : `별표 ${num1}`
      } else {
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