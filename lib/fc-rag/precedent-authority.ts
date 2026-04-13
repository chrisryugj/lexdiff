/**
 * M7: 판례 authority scoring
 *
 * 법률 RAG 관점에서 "어떤 판례가 더 권위 있는가"를 수치화.
 * 세계급 법률 RAG 표준:
 *  - 법원 계층 (Supreme > Appellate > District)
 *  - 전원합의체 boost (일반 선례 뒤집는 판결)
 *  - 연도 decay (최신일수록 가중)
 *  - 선례 인용 수 (현 시스템은 데이터 부재 — 미사용)
 *
 * 최소 구현: 계층 + 전원합의체 + 연도 decay.
 * 각 factor는 0~1 범위에 정규화, 최종 authority ∈ [0, 1.2].
 */

export interface PrecedentMeta {
  court?: string             // "대법원", "서울고등법원", ...
  caseNumber?: string        // "2020다12345"
  date?: string              // "2020-05-10" or "20200510"
  judgmentType?: string      // "전원합의체", "판결", ...
  isEnBanc?: boolean         // 전원합의체 여부 (파싱 후 설정)
}

// 법원 계층 가중치
const COURT_TIER: Array<{ pattern: RegExp; weight: number; label: string }> = [
  { pattern: /대법원|Supreme/i, weight: 1.0, label: 'supreme' },
  { pattern: /고등|Appellate|고법/, weight: 0.8, label: 'appellate' },
  { pattern: /지방법원|지법|District/, weight: 0.6, label: 'district' },
  { pattern: /행정법원/, weight: 0.65, label: 'administrative' },
  { pattern: /가정법원/, weight: 0.6, label: 'family' },
  { pattern: /특허법원/, weight: 0.8, label: 'patent' },
  { pattern: /헌법재판소/, weight: 1.0, label: 'constitutional' },
]

export function courtTierWeight(court: string | undefined | null): number {
  if (!court) return 0.4
  for (const t of COURT_TIER) {
    if (t.pattern.test(court)) return t.weight
  }
  return 0.4
}

export function parseYear(date: string | undefined | null): number | null {
  if (!date) return null
  // "2020-05-10", "20200510", "2020.05.10", "2020.5.10"
  const match = date.match(/^(\d{4})/)
  if (!match) return null
  const y = Number(match[1])
  if (!Number.isFinite(y) || y < 1900 || y > 2100) return null
  return y
}

/**
 * 연도 decay: 최근일수록 1에 가까움.
 * 반감기 15년 → 30년 전 판례는 약 0.25.
 */
export function yearDecayWeight(year: number | null, nowYear = new Date().getFullYear()): number {
  if (year === null) return 0.5
  const age = Math.max(0, nowYear - year)
  const halfLife = 15
  return Math.pow(0.5, age / halfLife)
}

export function isEnBancJudgment(meta: PrecedentMeta): boolean {
  if (meta.isEnBanc === true) return true
  return /전원합의체|full bench|en\s*banc/i.test(meta.judgmentType || '')
}

/**
 * 최종 authority score ∈ [0, 1.2].
 *  base = courtTier * (0.5 + 0.5 * decay)   — 최신 프리미엄
 *  enBanc 보정: × 1.2
 */
export function scorePrecedent(meta: PrecedentMeta): number {
  const court = courtTierWeight(meta.court)
  const year = parseYear(meta.date)
  const decay = yearDecayWeight(year)
  let score = court * (0.5 + 0.5 * decay)
  if (isEnBancJudgment(meta)) score *= 1.2
  return Math.max(0, Math.min(1.2, score))
}

/** 판례 배열을 authority 내림차순으로 재정렬 (안정적) */
export function rankPrecedents<T extends PrecedentMeta>(list: T[]): T[] {
  return [...list]
    .map((p, i) => ({ p, s: scorePrecedent(p), i }))
    .sort((a, b) => (b.s - a.s) || (a.i - b.i))
    .map(x => x.p)
}
