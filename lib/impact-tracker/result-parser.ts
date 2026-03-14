/**
 * korean-law-mcp 도구 결과(텍스트)를 영향 추적기 타입으로 파싱
 */

import type { ArticleChange, DownstreamImpact } from './types'

// ── search_law 원본(비압축) 결과 파싱 ──

export interface ResolvedLaw {
  lawName: string
  lawId: string
  mst: string
  kind: string  // 법률, 대통령령, 총리령·부령
}

/**
 * executeTool('search_law') 압축 결과에서 법령 정보 추출
 *
 * 포맷: `1. 건축법 (MST:273437, 법률)`
 */
export function parseSearchResult(text: string): ResolvedLaw[] {
  const results: ResolvedLaw[] = []
  const regex = /\d+\.\s+(.+?)\s+\(MST:(\d+),\s*(\S+)\)/g
  let m
  while ((m = regex.exec(text)) !== null) {
    results.push({
      lawName: m[1].trim(),
      lawId: m[2],  // MST를 lawId로 사용
      mst: m[2],
      kind: m[3],
    })
  }
  return results
}

/**
 * executeTool('search_ordinance') 결과에서 조례 정보 추출
 *
 * 포맷: `[2098841] 서울특별시 광진구 도시계획 조례`
 */
export function parseOrdinanceSearchResult(text: string): ResolvedLaw[] {
  const results: ResolvedLaw[] = []
  const regex = /\[(\d+)\]\s+(.+)/g
  let m
  while ((m = regex.exec(text)) !== null) {
    results.push({
      lawName: m[2].trim(),
      lawId: m[1],
      mst: m[1],
      kind: '조례',
    })
  }
  return results
}

// ── compare_old_new 결과 파싱 ──

export interface OldNewPair {
  joDisplay: string  // "제38조" (텍스트에서 추출)
  oldText: string
  newText: string
}

/**
 * compare_old_new 텍스트에서 조문별 신구법 텍스트 추출
 *
 * 포맷:
 * ```
 * ━━━━━━━━━━━━━━━━━━━━━━
 * 조문 1
 * ━━━━━━━━━━━━━━━━━━━━━━
 *
 * [개정 전]
 * 제38조(신고납부) ① ...
 *
 * [개정 후]
 * 제38조(신고납부) ① ...
 * ```
 */
export function parseCompareOldNew(text: string): {
  lawName: string
  revisionType: string
  pairs: OldNewPair[]
} {
  // 헤더 파싱
  const lawNameMatch = text.match(/법령명:\s*(.+)/)
  const revTypeMatch = text.match(/개정구분:\s*(.+)/)
  const lawName = lawNameMatch?.[1]?.trim() ?? ''
  const revisionType = revTypeMatch?.[1]?.trim() ?? '일부개정'

  const pairs: OldNewPair[] = []

  // [개정 전] / [개정 후] 블록 쌍 추출
  const blockRegex = /\[개정 전\]\n([\s\S]*?)\n\n\[개정 후\]\n([\s\S]*?)(?=\n━|$)/g
  let bm
  let lastJoDisplay = ''
  while ((bm = blockRegex.exec(text)) !== null) {
    const oldText = bm[1].trim()
    const newText = bm[2].trim()

    // 조문번호를 텍스트 첫 줄에서 추출 → 없으면 직전 조문 상속
    const joMatch = (newText || oldText).match(/^(?:<[^>]+>\s*)*?(제\d+조(?:의\d+)?)/)
    if (joMatch) {
      lastJoDisplay = joMatch[1]
    }
    const joDisplay = lastJoDisplay || `조문${pairs.length + 1}`

    pairs.push({ joDisplay, oldText, newText })
  }

  return { lawName, revisionType, pairs }
}

/**
 * compare_old_new 결과로부터 ArticleChange 배열 생성
 */
export function buildChangesFromOldNew(
  parsed: ReturnType<typeof parseCompareOldNew>,
  lawId: string,
  mst: string,
  revisionDate: string,
): ArticleChange[] {
  return parsed.pairs.map(pair => {
    // 개정유형 추론
    let revType = parsed.revisionType
    if (!pair.oldText || pair.oldText === '(신설)') revType = '신설'
    else if (!pair.newText || pair.newText === '(삭제)') revType = '삭제'

    return {
      lawId,
      lawName: parsed.lawName,
      mst,
      jo: joDisplayToCode(pair.joDisplay),
      joDisplay: pair.joDisplay,
      revisionType: revType,
      revisionDate,
    }
  })
}

// ── get_three_tier 결과 파싱 ──

/**
 * get_three_tier 텍스트에서 조문별 하위법령 의존성 추출
 *
 * 포맷:
 * ```
 * ━━━━━━━━━━━━━━━━━━━━━━
 * 제38조 신고납부
 * ━━━━━━━━━━━━━━━━━━━━━━
 *
 * 📜 시행령 관세법시행령 제52조 (신고 방식)
 * 📋 시행규칙 관세법시행규칙 제71조 (신고 서식)
 * ```
 */
export function parseThreeTierResult(text: string): Map<string, DownstreamImpact[]> {
  const result = new Map<string, DownstreamImpact[]>()

  // 조문 블록 분리: ━━ 구분선 → 조문번호 → 내용
  const sections = text.split(/━{10,}/)

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i].trim()
    if (!section) continue

    // 조문 헤더: "제38조 신고납부" 또는 "제38조"
    const headerMatch = section.match(/^(제\d+조(?:의\d+)?)\s*/)
    if (!headerMatch) continue

    const joDisplay = headerMatch[1]
    const impacts: DownstreamImpact[] = []

    // 다음 섹션에서 위임법령 파싱
    const contentSection = sections[i + 1] || ''

    // 📜 시행령, 📋 시행규칙 파싱
    const delegationRegex = /(📜|📋|📑)\s*(시행령|시행규칙|행정규칙)\s+(\S+)\s+(제\d+조(?:의\d+)?)?/g
    let dm
    while ((dm = delegationRegex.exec(contentSection)) !== null) {
      const typeMap: Record<string, DownstreamImpact['type']> = {
        '시행령': '시행령',
        '시행규칙': '시행규칙',
        '행정규칙': '행정규칙',
      }
      impacts.push({
        type: typeMap[dm[2]] || '시행령',
        lawName: dm[3],
        joDisplay: dm[4] || undefined,
      })
    }

    if (impacts.length > 0) {
      result.set(joDisplay, impacts)
    }
  }

  return result
}

// ── 유틸 ──

/**
 * "제38조" → "003800", "제38조의2" → "003802"
 */
function joDisplayToCode(joDisplay: string): string {
  const m = joDisplay.match(/제(\d+)조(?:의(\d+))?/)
  if (!m) return '000000'
  const num = parseInt(m[1], 10)
  const sub = m[2] ? parseInt(m[2], 10) : 0
  return String(num).padStart(4, '0') + String(sub).padStart(2, '0')
}
