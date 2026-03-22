/**
 * 링크 패턴 매칭 함수 모음
 *
 * 모든 collectXxxMatches 함수들을 포함.
 * unified-link-generator.ts의 generateLinks()에서 호출됨.
 */

import { escapeHtml } from './law-data-utils'
import type { LinkMatch } from './unified-link-generator'
import { detectLawType, getAriaLabel } from './unified-link-generator'

/**
 * "같은 법" 패턴 수집
 */
export function collectSameLawMatches(text: string, matches: LinkMatch[], currentLawName?: string): void {
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
        html: `<a href="#" class="law-ref" data-ref="law-article" data-law="${escapeHtml(lawName)}" data-article="${escapeHtml(joLabel)}" aria-label="${escapeHtml(getAriaLabel('same-law', lawName, joLabel))}">같은 법 ${fullLabel}</a>`
      })
    }
  }

  // 패턴 2: "법 제X조", "시행령 제X조", "규칙 제X조" (상위법 참조)
  // ⚠️ "상법", "민법", "형법" 등 짧은 법령명은 제외 (별도 법령으로 처리)
  // 부정 후방탐색: 한글 직전에 오는 "법"은 제외
  const shortRefRegex = /(?<![가-힣])(법|시행령|규칙)\s+제\s*(\d+)\s*조(의\s*(\d+))?(제\s*(\d+)\s*항)?(제\s*(\d+)\s*호)?/g

  while ((match = shortRefRegex.exec(text)) !== null) {
    const offset = match.index
    const fullText = match[0]
    const refType = match[1] // "법", "시행령", "규칙"

    // ⚠️ 바로 앞에 "X법" 또는 "X법 "이 붙어있으면 스킵 (simpleRegex가 전체 처리)
    // 예: "상증세법 시행령 제54조"에서 "시행령 제54조"만 매칭되면 스킵
    const textBefore = text.substring(0, offset)
    if (/[가-힣]법\s*$/.test(textBefore)) {
      continue
    }
    const quotedLawMatches = Array.from(textBefore.matchAll(/「\s*([^」]+)\s*」/g))

    let targetLawName: string | undefined

    if (quotedLawMatches.length > 0) {
      // 「법령명」이 있는 경우
      const lastLaw = quotedLawMatches[quotedLawMatches.length - 1]
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
        html: `<a href="#" class="law-ref" data-ref="law-article" data-law="${escapeHtml(targetLawName)}" data-article="${escapeHtml(joLabel)}" aria-label="${escapeHtml(getAriaLabel('same-law', targetLawName, joLabel))}">${refType} ${fullLabel}</a>`
      })
    }
  }
}

/**
 * 「법령명」 패턴 수집 (가장 안전)
 */
export function collectQuotedLawMatches(text: string, matches: LinkMatch[]): void {
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
      html: `<a href="#" class="law-ref" data-ref="law-article" data-law="${escapeHtml(lawName)}" data-article="${escapeHtml(joLabel)}" data-law-type="${escapeHtml(lawType)}" aria-label="${escapeHtml(getAriaLabel('law-article', lawName, joLabel))}">「${lawName}」 ${fullLabel}</a>`
    })
  }

  // 「법령명」 단독 패턴
  const nameRegex = /「\s*([^」]+)\s*」(?!\s*제\s*\d+\s*조)/g

  while ((match = nameRegex.exec(text)) !== null) {
    const lawName = match[1].trim()
    const lawType = detectLawType(lawName)

    // 이미 처리된 영역인지 확인
    const isOverlap = matches.some(m =>
      m.start <= match!.index && match!.index < m.end
    )

    if (!isOverlap) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        type: 'law-quoted',
        lawName,
        displayText: match[0],
        html: `<a href="#" class="law-ref" data-ref="law" data-law="${escapeHtml(lawName)}" data-law-type="${escapeHtml(lawType)}" aria-label="${escapeHtml(getAriaLabel('law-quoted', lawName))}">${match[0]}</a>`
      })
    }
  }
}

/**
 * 「」 없는 법령명 패턴 수집 (aggressive 모드)
 * 단순 법령명 + 시행령/시행규칙 패턴 처리
 */
export function collectUnquotedLawMatches(text: string, matches: LinkMatch[]): void {
  // ✅ 1단계: "구 법령명(날짜...)" 패턴에서 efYd 추출하여 매핑 생성
  // 예: "구 지방세법(2018. 12. 31. 법률 제16194호로 개정되기 전의 것, 이하 같다)"
  // → 이후 "구 지방세법 제11조" 같은 참조에도 같은 efYd 적용
  const oldLawEfYdMap = new Map<string, string>()

  const defPattern = /구\s+([가-힣a-zA-Z0-9·]+\s*(?:및\s+)?[가-힣a-zA-Z0-9·]*(?:법|령|규칙|조례)(?:\s+시행령|\s+시행규칙)?)\s*\(([^)]+)\)/g
  let defMatch: RegExpExecArray | null

  while ((defMatch = defPattern.exec(text)) !== null) {
    const lawName = defMatch[1].trim()
    const parenContent = defMatch[2]

    const dateMatch = parenContent.match(/(\d{4})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})/)
    if (dateMatch) {
      const year = dateMatch[1]
      const month = dateMatch[2].padStart(2, '0')
      const day = dateMatch[3].padStart(2, '0')

      let efYd: string
      if (parenContent.includes('개정되기 전') || parenContent.includes('개정 전')) {
        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day) - 1)
        efYd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
      } else {
        efYd = `${year}${month}${day}`
      }

      // 첫 번째 정의만 저장
      if (!oldLawEfYdMap.has(lawName)) {
        oldLawEfYdMap.set(lawName, efYd)
      }
    }
  }

  // 패턴 0: "구 법령명(상세설명) 제X조" 패턴 (판례에서 자주 사용)
  // 예: "구 지방세법(2018. 12. 31. 법률 제16194호로 개정되기 전의 것, 이하 같다) 제11조"
  // 예: "구 상속세 및 증여세법(2015. 12. 15. 법률 제13557호로 개정되기 전의 것) 제63조"
  // 괄호 안에서 날짜 추출하여 efYd로 사용 (과거 시점 법령 조회)
  // ⚠️ "구 "가 반드시 있어야 함 (구 없이 괄호 있는 경우는 일반 패턴에서 처리)
  const oldLawPattern = /(?<!「)구\s+([가-힣a-zA-Z0-9·]+\s*(?:및\s+)?[가-힣a-zA-Z0-9·]*(?:법|령|규칙|조례)(?:\s+시행령|\s+시행규칙)?)\s*\(([^)]+)\)\s*제\s*(\d+)\s*조(의\s*(\d+))?(제\s*(\d+)\s*항)?(제\s*(\d+)\s*호)?/g
  let match: RegExpExecArray | null

  while ((match = oldLawPattern.exec(text)) !== null) {
    const isInQuoted = matches.some(m =>
      m.type === 'law-quoted' &&
      match!.index >= m.start &&
      match!.index < m.end
    )

    if (!isInQuoted) {
      // "구 "가 반드시 포함됨 (정규식에서 필수)
      const lawName = match[1].trim()
      const parenContent = match[2] // 괄호 안 내용
      const joLabel = `제${match[3]}조${match[5] ? '의' + match[5] : ''}`
      const fullText = match[0]

      // 괄호 안에서 날짜 추출: "2018. 12. 31." 또는 "2018.12.31" 형식
      // "개정되기 전"이면 해당 날짜 하루 전으로 조회
      const dateMatch = parenContent.match(/(\d{4})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})/)
      let efYd: string | undefined

      if (dateMatch) {
        const year = dateMatch[1]
        const month = dateMatch[2].padStart(2, '0')
        const day = dateMatch[3].padStart(2, '0')

        // "개정되기 전" 문구가 있으면 하루 전 날짜로 조회
        if (parenContent.includes('개정되기 전') || parenContent.includes('개정 전')) {
          const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day) - 1)
          efYd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
        } else {
          efYd = `${year}${month}${day}`
        }
      }

      const efYdAttr = efYd ? ` data-efyd="${escapeHtml(efYd)}"` : ''

      // 이 범위 내의 기존 짧은 매칭 제거 (예: "제11조"만 잡힌 경우)
      const newStart = match.index
      const newEnd = match.index + fullText.length
      for (let i = matches.length - 1; i >= 0; i--) {
        const m = matches[i]
        if (m.start >= newStart && m.end <= newEnd) {
          matches.splice(i, 1)
        }
      }

      matches.push({
        start: newStart,
        end: newEnd,
        type: 'law-article',
        lawName: lawName, // "구" 제외한 법령명으로 검색
        article: joLabel,
        displayText: fullText,
        html: `<a href="#" class="law-ref" data-ref="law-article" data-law="${escapeHtml(lawName)}" data-article="${escapeHtml(joLabel)}"${efYdAttr} data-old-law="true" aria-label="${escapeHtml('구 ' + lawName + ' ' + joLabel)}">${fullText}</a>`
      })
    }
  }

  // 패턴 0-1: "구 법령명 제X조" 패턴 (괄호 없이 "구"만 있는 경우)
  // 예: "구 지방세법 제11조", "구 상속세 및 증여세법 제63조"
  // ✅ 앞서 정의된 efYd가 있으면 적용 (이하 같다 패턴)
  const simpleOldLawPattern = /(?<!「)구\s+([가-힣a-zA-Z0-9·]+\s*(?:및\s+)?[가-힣a-zA-Z0-9·]*(?:법|령|규칙|조례)(?:\s+시행령|\s+시행규칙)?)\s+제\s*(\d+)\s*조(의\s*(\d+))?(제\s*(\d+)\s*항)?(제\s*(\d+)\s*호)?(?!\s*\()/g

  while ((match = simpleOldLawPattern.exec(text)) !== null) {
    // 괄호 있는 패턴 0과 중복 방지만 체크 (패턴 0이 먼저 실행됨)
    const isOverlapWithPattern0 = matches.some(m =>
      m.type === 'law-article' &&
      match!.index >= m.start && match!.index < m.end
    )

    if (!isOverlapWithPattern0) {
      const lawName = match[1].trim()
      const joLabel = `제${match[2]}조${match[4] ? '의' + match[4] : ''}`
      const fullText = match[0]

      // ✅ 앞서 정의된 efYd 참조 (이하 같다 패턴)
      const inheritedEfYd = oldLawEfYdMap.get(lawName)
      const efYdAttr = inheritedEfYd ? ` data-efyd="${escapeHtml(inheritedEfYd)}"` : ''

      // 이 범위 내의 기존 짧은 매칭 제거 (예: "제11조"만 잡힌 경우)
      const newStart = match.index
      const newEnd = match.index + fullText.length
      for (let i = matches.length - 1; i >= 0; i--) {
        const m = matches[i]
        if (m.start >= newStart && m.end <= newEnd) {
          matches.splice(i, 1)
        }
      }

      matches.push({
        start: newStart,
        end: newEnd,
        type: 'law-article',
        lawName: lawName,
        article: joLabel,
        displayText: fullText,
        html: `<a href="#" class="law-ref" data-ref="law-article" data-law="${escapeHtml(lawName)}" data-article="${escapeHtml(joLabel)}"${efYdAttr} data-old-law="true" aria-label="${escapeHtml('구 ' + lawName + ' ' + joLabel)}">${fullText}</a>`
      })
    }
  }

  // 패턴 1: "및"이 포함된 법령명 (우선 매칭)
  // 예: "상속세 및 증여세법 제63조", "소득세법 및 법인세법 제10조"
  const andLawRegex = /(?<!「)([가-힣a-zA-Z0-9·]+\s+및\s+[가-힣a-zA-Z0-9·]+(?:법|령|규칙|조례)(?:\s+시행령|\s+시행규칙)?)\s+제\s*(\d+)\s*조(의\s*(\d+))?(제\s*(\d+)\s*항)?(제\s*(\d+)\s*호)?/g

  while ((match = andLawRegex.exec(text)) !== null) {
    const isInQuoted = matches.some(m =>
      m.type === 'law-quoted' &&
      match!.index >= m.start &&
      match!.index < m.end
    )

    if (!isInQuoted) {
      const lawName = match[1].trim()
      const joLabel = `제${match[2]}조${match[4] ? '의' + match[4] : ''}`
      const fullText = match[0]
      const newStart = match.index
      const newEnd = match.index + fullText.length

      // 이 범위 내의 기존 짧은 매칭 제거 (예: "제2조"만 잡힌 경우)
      for (let i = matches.length - 1; i >= 0; i--) {
        const m = matches[i]
        if (m.start >= newStart && m.end <= newEnd) {
          matches.splice(i, 1)
        }
      }

      matches.push({
        start: newStart,
        end: newEnd,
        type: 'law-article',
        lawName,
        article: joLabel,
        displayText: fullText,
        html: `<a href="#" class="law-ref" data-ref="law-article" data-law="${escapeHtml(lawName)}" data-article="${escapeHtml(joLabel)}" aria-label="${escapeHtml(getAriaLabel('law-article', lawName, joLabel))}">${fullText}</a>`
      })
    }
  }

  // 패턴 2: 짧은 법령명 (상법, 민법, 형법 등 1-2글자 + 법)
  // 예: "상법 제38조", "민법 제390조", "형법 제10조"
  const shortLawRegex = /(?<!「)(?<![가-힣])(상법|민법|형법|상증세법|소득세법|부가세법|관세법|국세기본법)\s+제\s*(\d+)\s*조(의\s*(\d+))?(제\s*(\d+)\s*항)?(제\s*(\d+)\s*호)?/g

  while ((match = shortLawRegex.exec(text)) !== null) {
    const isInQuoted = matches.some(m =>
      m.type === 'law-quoted' &&
      match!.index >= m.start &&
      match!.index < m.end
    )

    if (!isInQuoted) {
      const lawName = match[1].trim()
      const joLabel = `제${match[2]}조${match[4] ? '의' + match[4] : ''}`
      const fullText = match[0]
      const newStart = match.index
      const newEnd = match.index + fullText.length

      // 이 범위 내의 기존 짧은 매칭 제거
      for (let i = matches.length - 1; i >= 0; i--) {
        const m = matches[i]
        if (m.start >= newStart && m.end <= newEnd) {
          matches.splice(i, 1)
        }
      }

      matches.push({
        start: newStart,
        end: newEnd,
        type: 'law-article',
        lawName,
        article: joLabel,
        displayText: fullText,
        html: `<a href="#" class="law-ref" data-ref="law-article" data-law="${escapeHtml(lawName)}" data-article="${escapeHtml(joLabel)}" aria-label="${escapeHtml(getAriaLabel('law-article', lawName, joLabel))}">${fullText}</a>`
      })
    }
  }

  // 패턴 3: 일반 법령명 (2글자 이상 + 법/령/규칙/조례)
  // "관세법 제38조", "도로법 시행령 제55조" 등
  // ⚠️ "구 "로 시작하는 경우는 패턴 0-1에서 처리됨
  const simpleRegex = /(?<!「)([가-힣a-zA-Z0-9·]{2,20}(?:법|령|규칙|조례)(?:\s+시행령|\s+시행규칙)?)\s+제\s*(\d+)\s*조(의\s*(\d+))?(제\s*(\d+)\s*항)?(제\s*(\d+)\s*호)?/g

  while ((match = simpleRegex.exec(text)) !== null) {
    const isInQuoted = matches.some(m =>
      m.type === 'law-quoted' &&
      match!.index >= m.start &&
      match!.index < m.end
    )

    // ✅ "구 법령명" 패턴은 패턴 0-1에서 처리 - 스킵
    const textBefore = text.substring(Math.max(0, match.index - 3), match.index)
    const isOldLawPattern = /구\s*$/.test(textBefore)

    if (!isInQuoted && !isOldLawPattern) {
      const lawName = match[1].trim()
      const joLabel = `제${match[2]}조${match[4] ? '의' + match[4] : ''}`
      const fullText = match[0]
      const newStart = match.index
      const newEnd = match.index + fullText.length

      // 이 범위 내의 기존 짧은 매칭 제거 (예: "제2조"만 잡힌 경우 → "주택법 제2조"로 대체)
      for (let i = matches.length - 1; i >= 0; i--) {
        const m = matches[i]
        if (m.start >= newStart && m.end <= newEnd) {
          matches.splice(i, 1)
        }
      }

      matches.push({
        start: newStart,
        end: newEnd,
        type: 'law-article',
        lawName,
        article: joLabel,
        displayText: fullText,
        html: `<a href="#" class="law-ref" data-ref="law-article" data-law="${escapeHtml(lawName)}" data-article="${escapeHtml(joLabel)}" aria-label="${escapeHtml(getAriaLabel('law-article', lawName, joLabel))}">${fullText}</a>`
      })
    }
  }
}

/**
 * 내부 조문 참조 패턴 수집
 * 예: "제5조", "제10조의2", "제5조제2항", "(제39조에"
 */
export function collectInternalArticleMatches(text: string, matches: LinkMatch[]): void {
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

    // ⚠️ 개정 태그 패턴 제외: [제N조에서 이동 <날짜>], [제N조로 이동 <날짜>] 등
    // 예: "[제24조에서 이동 <2023.6.16.>]", "[종전 제5조에서 이동, <2020.1.1.>]"
    // 예: "[종전 제10조는 제12조로 이동 <2020.3.1.>]"
    const beforeText10 = text.substring(Math.max(0, match.index - 10), match.index)
    const afterText = text.substring(match.index + match[0].length, match.index + match[0].length + 30)

    // 패턴 1: [제N조에서 이동, [제N조로 이동
    const isDirectAmendment = beforeText10.endsWith('[') && /^에서\s*이동|^로\s*이동|^는\s*제/.test(afterText)
    // 패턴 2: [종전 제N조는 제M조로 이동 - 대괄호 안에 있고 뒤에 <날짜>] 패턴
    const isInBracket = beforeText10.includes('[') && !beforeText10.includes(']') && /<\d{4}\.\d{1,2}\.\d{1,2}\.?>.*?\]/.test(afterText)

    if (isDirectAmendment || isInBracket) {
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
      html: `<a href="#" class="law-ref" data-ref="article" data-article="${escapeHtml(joLabel)}" aria-label="${escapeHtml(getAriaLabel('article', undefined, joLabel))}">${fullLabel}</a>`
    })
  }
}

/**
 * 대통령령/시행령 패턴 수집
 */
export function collectDecreeMatches(text: string, matches: LinkMatch[]): void {
  // 패턴: "대통령령으로 정하는" 또는 "대통령령으로 정한다"
  const decreeRegex = /(대통령령)(?:으로|로)\s*정(?:하는|한다)/g
  let match: RegExpExecArray | null

  while ((match = decreeRegex.exec(text)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      type: 'decree',
      displayText: match[0],
      html: `<a href="#" class="law-ref" data-ref="related" data-kind="decree" aria-label="${escapeHtml(getAriaLabel('decree'))}">${match[0]}</a>`
    })
  }
}

/**
 * 부령/시행규칙 패턴 수집
 */
export function collectRuleMatches(text: string, matches: LinkMatch[]): void {
  // 패턴: "XXX부령으로 정하는" 또는 "XXX부령으로 정한다"
  const ruleRegex = /([가-힣]+부령)(?:으로|로)\s*정(?:하는|한다)/g
  let match: RegExpExecArray | null

  while ((match = ruleRegex.exec(text)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      type: 'rule',
      displayText: match[0],
      html: `<a href="#" class="law-ref" data-ref="related" data-kind="rule" aria-label="${escapeHtml(getAriaLabel('rule'))}">${match[0]}</a>`
    })
  }
}

/**
 * 행정규칙 패턴 수집
 */
export function collectAdminRuleMatches(text: string, matches: LinkMatch[]): void {
  // 패턴: "관세청장이 정하는"
  const adminRegex = /([가-힣]+(?:청장|장관|부장관|차관|위원장|원장|이사장))(?:이|가)\s*정하는/g
  let match: RegExpExecArray | null

  while ((match = adminRegex.exec(text)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      type: 'rule',
      displayText: match[0],
      html: `<a href="#" class="law-ref" data-ref="regulation" data-kind="administrative" aria-label="${escapeHtml(getAriaLabel('regulation'))}">${match[0]}</a>`
    })
  }
}

/**
 * 별표 앞에서 법령명 추출
 * 「법령명」 별표 1 → "법령명" 반환
 * 별표 1 (법령명 없음) → undefined 반환
 */
function extractLawNameBeforeAnnex(text: string, annexIndex: number): string | undefined {
  // 별표 앞 200자 내에서 「법령명」 패턴 검색
  // (50자로는 AI 답변에서 법령명과 별표 사이 설명이 길 때 못 찾음)
  const searchStart = Math.max(0, annexIndex - 200)
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
export function collectAnnexMatches(text: string, matches: LinkMatch[]): void {
  // 패턴 1: [별표 X] 또는 [별표 X의Y] 또는 [별표] (대괄호 포함, 숫자 선택적)
  const bracketPattern = /\[별표\s*(\d+)?(?:의(\d+))?\]/g
  let match: RegExpExecArray | null

  while ((match = bracketPattern.exec(text)) !== null) {
    const annexNum = match[1]
      ? (match[2] ? `${match[1]}의${match[2]}` : match[1])
      : '1' // [별표] 숫자 없으면 기본값 1
    const lawName = extractLawNameBeforeAnnex(text, match.index)

    // 이미 처리된 영역인지 확인
    const isOverlap = matches.some(m =>
      match!.index >= m.start && match!.index < m.end
    )

    if (!isOverlap) {
      const dataLawAttr = lawName ? ` data-law="${escapeHtml(lawName)}"` : ''
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        type: 'annex',
        lawName,
        annexNumber: annexNum,
        displayText: match[0],
        html: `<a href="#" class="law-ref annex-ref" data-ref="annex" data-annex="${escapeHtml(annexNum)}"${dataLawAttr} aria-label="${escapeHtml(getAriaLabel('annex', lawName, undefined, annexNum))}">${match[0]}</a>`
      })
    }
  }

  // 패턴 2: 별표 X (대괄호 없이, 문맥 포함)
  // "별표 1과 같다", "별표 1에 따른", "별표 1에서 정하는" 등
  // ✅ 숫자 선택적: "별표와 같다" (숫자 없음) 케이스 지원
  const plainPattern = /(?<!\[)별표(?:\s*(\d+)(?:의(\d+))?)?(?:\s*(?:과|와|에|을|를|의|이|가)\s*(?:같다|따른|따르는|따라|정하는|정한|따름|해당))?/g

  while ((match = plainPattern.exec(text)) !== null) {
    // 숫자가 없으면 "1" 기본값 (조례에서 별표가 하나인 경우)
    const annexNum = match[1]
      ? (match[2] ? `${match[1]}의${match[2]}` : match[1])
      : '1'
    const lawName = extractLawNameBeforeAnnex(text, match.index)

    // 이미 처리된 영역인지 확인 (대괄호 패턴과 중복 방지)
    const isOverlap = matches.some(m =>
      (match!.index >= m.start && match!.index < m.end) ||
      (m.start >= match!.index && m.start < match!.index + match![0].length)
    )

    if (!isOverlap) {
      const dataLawAttr = lawName ? ` data-law="${escapeHtml(lawName)}"` : ''
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        type: 'annex',
        lawName,
        annexNumber: annexNum,
        displayText: match[0],
        html: `<a href="#" class="law-ref annex-ref" data-ref="annex" data-annex="${escapeHtml(annexNum)}"${dataLawAttr} aria-label="${escapeHtml(getAriaLabel('annex', lawName, undefined, annexNum))}">${match[0]}</a>`
      })
    }
  }
}
