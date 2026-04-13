import type { LawArticle, ThreeTierArticle, DelegationItem } from "@/lib/law-types"
import { extractDelegationMatches } from "./patterns"
import type {
  DelegationClause,
  DelegationGapResult,
  DelegationGapAnalysis,
  DelegationGapStatus,
  DelegationTargetType,
} from "./types"
import { getDelegationGapCacheKey, DELEGATION_GAP_CACHE_TTL } from "./types"
import { buildJO } from "@/lib/law-parser"

// ── 캐싱 ──────────────────────────────────────────────────
interface CachedAnalysis {
  data: DelegationGapAnalysis
  expiresAt: number
}

export function getCachedAnalysis(mst: string): DelegationGapAnalysis | null {
  try {
    const key = getDelegationGapCacheKey(mst)
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const cached: CachedAnalysis = JSON.parse(raw)
    if (Date.now() > cached.expiresAt) {
      localStorage.removeItem(key)
      return null
    }
    return cached.data
  } catch {
    return null
  }
}

function setCachedAnalysis(mst: string, data: DelegationGapAnalysis): void {
  try {
    const key = getDelegationGapCacheKey(mst)
    const cached: CachedAnalysis = {
      data,
      expiresAt: Date.now() + DELEGATION_GAP_CACHE_TTL,
    }
    localStorage.setItem(key, JSON.stringify(cached))
  } catch {
    // localStorage full — 무시
  }
}

// ── 조문에서 위임 조항 추출 ──────────────────────────────────
export function extractClauses(articles: LawArticle[]): DelegationClause[] {
  const clauses: DelegationClause[] = []

  for (const article of articles) {
    if (!article.content) continue

    const matches = extractDelegationMatches(article.content)
    for (const match of matches) {
      clauses.push({
        jo: article.jo,
        joDisplay: article.joNum || `제${article.jo}조`,
        paragraph: match.paragraph,
        targetType: match.targetType,
        rawText: match.rawText.length > 120
          ? match.rawText.slice(0, 117) + '...'
          : match.rawText,
      })
    }
  }

  return clauses
}

// ── 크로스체크: 위임 조항 vs 3단 비교 데이터 ──────────────────
function matchTargetType(
  clauseTarget: DelegationTargetType,
  delegationType: DelegationItem['type']
): boolean {
  if (clauseTarget === '시행령' && delegationType === '시행령') return true
  if (clauseTarget === '시행규칙' && delegationType === '시행규칙') return true
  if (clauseTarget === '고시등' && delegationType === '행정규칙') return true
  return false
}

export function crossCheck(
  clauses: DelegationClause[],
  threeTierArticles: ThreeTierArticle[],
): DelegationGapResult[] {
  // 3단 데이터를 jo → delegations 맵으로 변환
  const delegationMap = new Map<string, DelegationItem[]>()
  for (const art of threeTierArticles) {
    if (art.delegations.length > 0) {
      delegationMap.set(art.jo, art.delegations)
    }
  }

  return clauses.map(clause => {
    const delegations = delegationMap.get(clause.jo) || []

    // 해당 타입의 위임이 있는지 확인
    const matched = delegations.filter(d => matchTargetType(clause.targetType, d.type))
    // 다른 타입의 위임이 있는지 (부분 미비 판정용)
    const otherType = delegations.filter(d => !matchTargetType(clause.targetType, d.type))

    let status: DelegationGapStatus
    let note: string | undefined

    if (matched.length > 0) {
      status = 'fulfilled'
    } else if (otherType.length > 0) {
      // 위임 대상과 다른 타입의 하위법령만 존재
      status = 'partial'
      note = `위임 대상: ${clause.targetType}, 실제: ${[...new Set(otherType.map(d => d.type))].join(', ')}`
    } else {
      status = 'missing'
    }

    return {
      clause,
      status,
      matchedDelegations: matched,
      note,
    }
  })
}

// ── 전체 분석 실행 ──────────────────────────────────────────
export function buildAnalysis(
  lawTitle: string,
  lawId: string,
  mst: string,
  results: DelegationGapResult[],
): DelegationGapAnalysis {
  const analysis: DelegationGapAnalysis = {
    lawTitle,
    lawId: lawId || '',
    mst,
    totalClauses: results.length,
    missingCount: results.filter(r => r.status === 'missing').length,
    partialCount: results.filter(r => r.status === 'partial').length,
    fulfilledCount: results.filter(r => r.status === 'fulfilled').length,
    results: sortResults(results),
    analyzedAt: new Date().toISOString(),
  }

  // 캐싱 — 빈 결과는 저장하지 않음 (첫 시도 실패 시 재시도 가능하도록)
  if (mst && results.length > 0) {
    setCachedAnalysis(mst, analysis)
  }

  return analysis
}

/** 미비 → 부분 미비 → 정상 순서로 정렬 */
function sortResults(results: DelegationGapResult[]): DelegationGapResult[] {
  const order: Record<DelegationGapStatus, number> = {
    missing: 0,
    partial: 1,
    fulfilled: 2,
  }
  return [...results].sort((a, b) => order[a.status] - order[b.status])
}

// Re-export for convenience
export { getCachedAnalysis as getCache }
