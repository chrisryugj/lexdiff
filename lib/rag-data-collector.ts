/**
 * RAG Data Collector
 * AI 의도 분석 결과를 바탕으로 필요한 법령/조례 데이터를 자동 수집
 */

import type { DataTarget } from './intent-analyzer'
import type { LawArticle } from './law-parser'

export interface CollectedSource {
  id: string
  type: 'law' | 'ordinance' | 'decree' | 'rule'
  title: string
  content: string // 전문 텍스트
  articles: LawArticle[]
  metadata: {
    region?: string
    lawId?: string
    ordinSeq?: string
    effectiveDate?: string
    totalArticles: number
    collectedAt: number
  }
}

export interface CollectionProgress {
  current: number
  total: number
  message: string
  sources: CollectedSource[]
}

export type ProgressCallback = (progress: CollectionProgress) => void

/**
 * 여러 데이터 타겟에 대해 순차적으로 데이터 수집
 */
export async function collectData(
  targets: DataTarget[],
  onProgress?: ProgressCallback
): Promise<CollectedSource[]> {
  const sources: CollectedSource[] = []

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i]

    onProgress?.({
      current: i,
      total: targets.length,
      message: `${target.region || target.identifier || target.keywords?.join(' ')} 검색 중...`,
      sources: [...sources],
    })

    try {
      let source: CollectedSource | null = null

      if (target.type === 'ordinance') {
        source = await collectOrdinance(target)
      } else if (target.type === 'law') {
        source = await collectLaw(target)
      }

      if (source) {
        sources.push(source)

        onProgress?.({
          current: i + 1,
          total: targets.length,
          message: `✅ ${source.title} (${source.metadata.totalArticles}개 조문)`,
          sources: [...sources],
        })
      } else {
        onProgress?.({
          current: i + 1,
          total: targets.length,
          message: `⚠️ 수집 실패 - 관련 자료 없음`,
          sources: [...sources],
        })
      }
    } catch (error) {
      console.error(`Failed to collect data for target:`, target, error)

      onProgress?.({
        current: i + 1,
        total: targets.length,
        message: `❌ 수집 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
        sources: [...sources],
      })
    }
  }

  return sources
}

/**
 * 조례 데이터 수집
 */
async function collectOrdinance(target: DataTarget): Promise<CollectedSource> {
  // 1. 검색어 생성 - 점진적으로 키워드를 줄여가며 시도
  const keywords = target.keywords || []
  const searchQueries = [
    // 첫 시도: 지역 + 핵심 키워드 1개 (가장 중요한 것만)
    [target.region, keywords[0]].filter(Boolean).join(' '),
    // 두 번째 시도: 지역 + 핵심 키워드 2개
    [target.region, keywords.slice(0, 2).join(' ')].filter(Boolean).join(' '),
    // 세 번째 시도: 지역명만
    target.region,
  ].filter((q) => q && q.trim().length > 0)

  let searchResults: any = null

  // 키워드를 줄여가며 재시도
  for (const searchQuery of searchQueries) {
    console.log(`🔍 [Ordinance Search] Trying query: "${searchQuery}"`)

    const searchResponse = await fetch(`/api/ordin-search?query=${encodeURIComponent(searchQuery)}`)

    if (!searchResponse.ok) {
      console.warn(`Search failed for "${searchQuery}": ${searchResponse.statusText}`)
      continue
    }

    const results = await searchResponse.json()

    if (results.list && results.list.length > 0) {
      console.log(`✅ [Ordinance Search] Found ${results.list.length} results with query: "${searchQuery}"`)
      searchResults = results
      break
    } else {
      console.warn(`No results for query: "${searchQuery}", trying next...`)
    }
  }

  if (!searchResults || !searchResults.list || searchResults.list.length === 0) {
    throw new Error(`No ordinance found for region: ${target.region}`)
  }

  console.log(`✅ [Ordinance Search] Found ${searchResults.list.length} results`)

  // 3. 가장 관련성 높은 조례 선택
  const bestMatch = await selectBestOrdinance(searchResults.list, target.keywords || [])

  console.log(`🎯 [Best Match] Selected: ${bestMatch.ordinNm}`)

  // 4. 조례 전문 다운로드
  const contentResponse = await fetch(`/api/ordin?ordinSeq=${bestMatch.ordinSeq}`)

  if (!contentResponse.ok) {
    throw new Error(`Failed to fetch ordinance content: ${contentResponse.statusText}`)
  }

  const fullContent = await contentResponse.json()

  // 5. 파싱
  const articles = parseOrdinanceArticles(fullContent)
  const contentText = articles.map((a) => `${a.joNum}\n${a.content}`).join('\n\n')

  const source: CollectedSource = {
    id: `source_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: 'ordinance',
    title: fullContent.meta?.lawTitle || bestMatch.ordinNm,
    content: contentText,
    articles,
    metadata: {
      region: target.region,
      ordinSeq: bestMatch.ordinSeq,
      totalArticles: articles.length,
      collectedAt: Date.now(),
    },
  }

  console.log(`✅ [Collected] ${source.title}: ${source.metadata.totalArticles} articles`)

  return source
}

/**
 * 법령 데이터 수집
 */
async function collectLaw(target: DataTarget): Promise<CollectedSource> {
  // 1. 검색어 생성
  const searchQuery = target.identifier || (target.keywords || []).join(' ')

  console.log(`🔍 [Law Search] Query: "${searchQuery}"`)

  // 2. 법령 검색
  const searchResponse = await fetch(`/api/law-search?query=${encodeURIComponent(searchQuery)}`)

  if (!searchResponse.ok) {
    throw new Error(`Law search failed: ${searchResponse.statusText}`)
  }

  const searchResults = await searchResponse.json()

  if (!searchResults.list || searchResults.list.length === 0) {
    throw new Error(`No law found for: ${searchQuery}`)
  }

  console.log(`✅ [Law Search] Found ${searchResults.list.length} results`)

  // 3. 가장 관련성 높은 법령 선택
  const bestMatch = searchResults.list[0] // 첫 번째 결과 사용 (law-search는 이미 정렬됨)

  console.log(`🎯 [Best Match] Selected: ${bestMatch.lawName}`)

  // 4. 법령 전문 다운로드
  const contentResponse = await fetch(`/api/eflaw?MST=${bestMatch.lawId}`)

  if (!contentResponse.ok) {
    throw new Error(`Failed to fetch law content: ${contentResponse.statusText}`)
  }

  const fullContent = await contentResponse.json()

  // 5. 파싱
  const articles = parseLawArticles(fullContent)
  const contentText = articles.map((a) => `${a.joNum}\n${a.content}`).join('\n\n')

  const source: CollectedSource = {
    id: `source_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: 'law',
    title: fullContent.meta?.lawTitle || bestMatch.lawName,
    content: contentText,
    articles,
    metadata: {
      lawId: bestMatch.lawId,
      effectiveDate: fullContent.meta?.effectiveDate,
      totalArticles: articles.length,
      collectedAt: Date.now(),
    },
  }

  console.log(`✅ [Collected] ${source.title}: ${source.metadata.totalArticles} articles`)

  return source
}

/**
 * 여러 조례 후보 중 가장 관련성 높은 것을 선택
 * 간단한 키워드 매칭 사용 (나중에 AI로 개선 가능)
 */
async function selectBestOrdinance(candidates: any[], keywords: string[]): Promise<any> {
  if (candidates.length === 1) return candidates[0]

  // 키워드가 없으면 첫 번째 결과 반환
  if (keywords.length === 0) return candidates[0]

  // 키워드 매칭 점수 계산
  const scored = candidates.map((candidate) => {
    const title = candidate.ordinNm.toLowerCase()
    const matchScore = keywords.reduce((score, keyword) => {
      return title.includes(keyword.toLowerCase()) ? score + 1 : score
    }, 0)

    return { candidate, score: matchScore }
  })

  // 점수 높은 순으로 정렬
  scored.sort((a, b) => b.score - a.score)

  return scored[0].candidate
}

/**
 * 조례 전문을 파싱하여 조문 목록 생성
 */
function parseOrdinanceArticles(content: any): LawArticle[] {
  // eflaw API 응답과 동일한 형식이라고 가정
  if (content.articles && Array.isArray(content.articles)) {
    return content.articles
  }

  // articles가 없으면 빈 배열 반환
  return []
}

/**
 * 법령 전문을 파싱하여 조문 목록 생성
 */
function parseLawArticles(content: any): LawArticle[] {
  // eflaw API 응답 형식
  if (content.articles && Array.isArray(content.articles)) {
    return content.articles
  }

  // articles가 없으면 빈 배열 반환
  return []
}
