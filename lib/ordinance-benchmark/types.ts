/** 조례 벤치마킹 검색 결과 */
export interface BenchmarkOrdinanceResult {
  orgCode: string
  orgName: string          // 지자체명
  orgShortName: string
  ordinanceName: string
  ordinanceSeq?: string
  effectiveDate?: string
  revisionType?: string    // 일부개정, 전부개정 등
}

/** 벤치마킹 검색 요청 */
export interface BenchmarkSearchRequest {
  keyword: string
  ordinanceKind?: string   // 30001=조례, 30002=규칙
}

/** 벤치마킹 전체 결과 */
export interface BenchmarkResult {
  keyword: string
  totalMunicipalities: number
  matchedCount: number
  failedCount: number
  results: Map<string, BenchmarkOrdinanceResult[]>  // orgCode → results
  searchedAt: string
}

/** 캐시 키/TTL */
export function getBenchmarkCacheKey(keyword: string): string {
  return `benchmark:${keyword}`
}
export const BENCHMARK_CACHE_TTL = 24 * 60 * 60 * 1000
