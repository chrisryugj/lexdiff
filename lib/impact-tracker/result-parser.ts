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

/** "관세법 [현행]" / "관세법 ⚠️[연혁-과거버전]" → 상태 라벨 제거 */
function stripStatusLabel(name: string): string {
  return name.replace(/\s*(?:⚠️\s*)?\[[^\]]*\]\s*$/, '').trim()
}

/**
 * executeTool('search_law') 결과에서 법령 정보 추출
 *
 * korean-law-mcp v4.2+ 원본 포맷 (compressSearchResult 는 이 포맷과 미매칭이라 원문 통과):
 * ```
 * 1. 관세법 [현행]
 *    - 법령ID: 001556
 *    - MST: 280363
 *    - 공포일: 20251223 / 시행일: 20260701
 *    - 구분: 법률
 * ```
 * 구 압축 포맷 `1. 건축법 (MST:273437, 법률)` 도 폴백으로 지원.
 * ⚠️[연혁-과거버전] 항목은 제외 — 영향 분석은 현행 법령 기준.
 */
export function parseSearchResult(text: string): ResolvedLaw[] {
  const results: ResolvedLaw[] = []

  const rawRegex = /\d+\.\s+(.+)\n\s*- 법령ID:\s*\S*\n\s*- MST:\s*(\d+)\n\s*- 공포일:[^\n]*\n\s*- 구분:\s*(\S+)/g
  let m
  while ((m = rawRegex.exec(text)) !== null) {
    if (m[1].includes('연혁-과거버전')) continue
    results.push({
      lawName: stripStatusLabel(m[1]),
      lawId: m[2],  // MST를 lawId로 사용
      mst: m[2],
      kind: m[3],
    })
  }
  if (results.length > 0) return results

  // 폴백: 압축 포맷
  const compactRegex = /\d+\.\s+(.+?)\s+\(MST:(\d+),\s*(\S+)\)/g
  while ((m = compactRegex.exec(text)) !== null) {
    if (m[1].includes('연혁-과거버전')) continue
    results.push({
      lawName: stripStatusLabel(m[1]),
      lawId: m[2],
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
 * korean-law-mcp v4.4 포맷:
 * ```
 * 법령명: 관세법
 * 개정구분: 일부개정
 * 신법 공포일: 20251223
 *
 * ---
 * 신구법 대조
 * ---
 *
 * ---
 * 제38조
 * ---
 *
 * [개정 전]
 * 제38조(신고납부) ① ...
 *
 * [개정 후]
 * 제38조(신고납부) ① ...
 * ```
 * 신설/삭제는 `[개정 전] (신설)` / `[개정 후] (삭제)` 로 같은 줄에 표기됨.
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

  // truncateForContext 꼬리 마커 제거 (마지막 블록에 섞여 들어가는 것 방지)
  const body = text.replace(/\n+\.\.\. \(결과가 너무 길어 일부만 표시\)\s*$/, '')

  const pairs: OldNewPair[] = []

  // 구분선(---/━━━)으로 섹션 분리 → "제n조" 라벨 섹션 다음이 본문 블록
  const sections = body.split(/\n(?:-{3,}|━{3,})\n/)
  let lastJoDisplay = ''
  for (let i = 0; i < sections.length - 1; i++) {
    const label = sections[i].trim()
    if (!/^(?:제\d+조(?:의\d+)?|조문\s*\d+)/.test(label)) continue

    const block = sections[i + 1]
    const om = block.match(/\[개정 전\][^\S\n]*(?:\((신설)\))?\n?([\s\S]*?)(?=\n*\[개정 후\]|$)/)
    const nm = block.match(/\[개정 후\][^\S\n]*(?:\((삭제)\))?\n?([\s\S]*)$/)
    if (!om && !nm) continue

    const oldText = om && !om[1] ? om[2].trim() : ''
    const newText = nm && !nm[1] ? nm[2].trim() : ''

    // 항·호 단위 파편은 라벨이 "조문 N" — 직전 조문번호 상속 (동일 조문으로 dedupe됨)
    const joMatch = label.match(/제\d+조(?:의\d+)?/)
    if (joMatch) lastJoDisplay = joMatch[0]
    const joDisplay = joMatch?.[0] || lastJoDisplay || `조문${pairs.length + 1}`

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
 * korean-law-mcp v4.4 포맷:
 * ```
 * ---
 * 제38조 신고납부
 * ---
 *
 * [시행령] 관세법 시행령 제32조 (신고 방식)
 * 위임 내용...
 * [시행규칙] 관세법 시행규칙 제8조 (신고 서식)
 * ```
 */
export function parseThreeTierResult(text: string): Map<string, DownstreamImpact[]> {
  const result = new Map<string, DownstreamImpact[]>()

  // 구분선(---/━━━)으로 섹션 분리 → "제n조 제목" 라벨 섹션 다음이 위임 내용
  const sections = text.split(/\n?(?:-{3,}|━{3,})\n/)

  for (let i = 0; i < sections.length - 1; i++) {
    const headerMatch = sections[i].trim().match(/^(제\d+조(?:의\d+)?)\s*/)
    if (!headerMatch) continue

    const joDisplay = headerMatch[1]
    const impacts: DownstreamImpact[] = []

    // "[시행령] 법령명 제n조 (제목)" 라인 파싱 (제n조/제목은 선택적)
    const lineRegex = /^\[(시행령|시행규칙|행정규칙)\]\s+(.+)$/gm
    let dm
    while ((dm = lineRegex.exec(sections[i + 1])) !== null) {
      const rest = dm[2].trim()
      // 마지막 "제n조" 를 조문번호로 분리 (법령명 자체에 제n조가 포함될 수 있어 greedy)
      const joSplit = rest.match(/^(.+)\s+(제\d+조(?:의\d+)?)(?:\s+\(.*\))?$/)
      impacts.push({
        type: dm[1] as DownstreamImpact['type'],
        lawName: (joSplit ? joSplit[1] : rest.replace(/\s*\([^)]*\)\s*$/, '')).trim(),
        joDisplay: joSplit?.[2],
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
