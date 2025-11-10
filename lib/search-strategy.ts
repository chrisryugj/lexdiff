import { parseSearchQuery } from './law-parser'
import { normalizeSearchQuery } from './search-normalizer'
import { findCachedResult, createSearchPattern, learnFromSuccessfulSearch, getSessionId } from './search-learning'
import { searchSimilarVariants, searchVariantTable } from './variant-matcher'
import { searchHighQualityCache } from './search-feedback-db'
import { debugLogger } from './debug-logger'
import { l0VectorSearch } from './vector-search'

export interface SearchResult {
  source: 'L0_vector' | 'L1_direct_mapping' | 'L2_variant' | 'L2_variant_table' | 'L3_quality_cache' | 'L4_api'
  data: any
  time: number
  pattern?: string
  variantUsed?: string
  vectorSimilarity?: number
  searchQueryId?: number
  searchResultId?: number
}

// 통합 검색 전략 (5단계 폭포수)
export async function intelligentSearch(rawQuery: string): Promise<SearchResult> {
  const startTime = Date.now()

  try {
    debugLogger.info('🔍 검색 시작', { rawQuery })

    // 정규화
    const normalized = normalizeSearchQuery(rawQuery)
    const pattern = createSearchPattern(normalized)
    const parsed = parseSearchQuery(normalized)

    debugLogger.debug('검색 정규화', { normalized, pattern, parsed })

    // L0: 벡터 유사도 검색 (5ms, 95% 정확도)
    // 오타, 유사어 자동 처리
    try {
      const l0Result = await l0VectorSearch(rawQuery)
      if (l0Result.found && l0Result.mappingId) {
        const time = Date.now() - startTime
        debugLogger.success('🎯 L0 벡터 검색 HIT', {
          time,
          similarQuery: l0Result.similarQuery,
          similarity: l0Result.similarityScore?.toFixed(3),
        })

        // 매핑 정보를 사용하여 캐시된 결과 가져오기
        const cachedData = await findCachedResult(l0Result.similarQuery || '')
        if (cachedData.found) {
          // 캐시 히트 시에도 학습 (queryId, resultId 생성)
          let learningResult: { queryId: number; resultId: number } | null = null
          try {
            const sessionId = getSessionId()
            learningResult = await learnFromSuccessfulSearch({
              rawQuery,
              normalizedQuery: normalized,
              pattern,
              parsed,
              apiResult: {
                ...cachedData.data,
                lawTitle: cachedData.data.lawTitle || parsed.lawName,
                articleContent: '',
                isOrdinance: false,
              },
              sessionId,
            })
          } catch (error) {
            debugLogger.warning('L0 캐시 히트 학습 실패 (계속 진행)', error)
          }

          return {
            source: 'L0_vector',
            data: cachedData.data,
            time,
            pattern: l0Result.mappedPattern || undefined,
            variantUsed: l0Result.similarQuery || undefined,
            vectorSimilarity: l0Result.similarityScore || undefined,
            searchQueryId: learningResult?.queryId,
            searchResultId: learningResult?.resultId,
          }
        }
      }
    } catch (error) {
      debugLogger.warning('L0 벡터 검색 실패 (fallback to L1)', error)
      // Continue to L1 if L0 fails
    }

    // L1: 직접 매핑 (5ms)
    const l1Result = await findCachedResult(rawQuery)
    if (l1Result.found) {
      const time = Date.now() - startTime
      debugLogger.success('✨ L1 직접 매핑 HIT', { time, pattern })

      // 캐시 히트 시에도 학습 (queryId, resultId 생성)
      let learningResult: { queryId: number; resultId: number } | null = null
      try {
        const sessionId = getSessionId()
        learningResult = await learnFromSuccessfulSearch({
          rawQuery,
          normalizedQuery: normalized,
          pattern,
          parsed,
          apiResult: {
            ...l1Result.data,
            lawTitle: l1Result.data.lawTitle || parsed.lawName,
            articleContent: '',
            isOrdinance: false,
          },
          sessionId,
        })
      } catch (error) {
        debugLogger.warning('L1 캐시 히트 학습 실패 (계속 진행)', error)
      }

      return {
        source: 'L1_direct_mapping',
        data: l1Result.data,
        time,
        pattern: l1Result.pattern,
        searchQueryId: learningResult?.queryId,
        searchResultId: learningResult?.resultId,
      }
    }

    // L2: 변형 테이블 검색 (5-10ms, 더 빠름)
    const l2TableResult = await searchVariantTable(rawQuery)
    if (l2TableResult?.found) {
      const time = Date.now() - startTime
      debugLogger.success('🔄 L2 변형 테이블 HIT', { time })

      // 캐시 히트 시에도 학습
      let learningResult: { queryId: number; resultId: number } | null = null
      try {
        const sessionId = getSessionId()
        learningResult = await learnFromSuccessfulSearch({
          rawQuery,
          normalizedQuery: normalized,
          pattern,
          parsed,
          apiResult: {
            ...l2TableResult.data,
            lawTitle: l2TableResult.data.lawTitle || parsed.lawName,
            articleContent: '',
            isOrdinance: false,
          },
          sessionId,
        })
      } catch (error) {
        debugLogger.warning('L2 변형 테이블 학습 실패 (계속 진행)', error)
      }

      return {
        source: 'L2_variant_table',
        data: l2TableResult.data,
        time,
        searchQueryId: learningResult?.queryId,
        searchResultId: learningResult?.resultId,
      }
    }

    // L2: 유사 검색어 생성 및 검색 (10ms)
    const l2Result = await searchSimilarVariants(rawQuery, pattern)
    if (l2Result) {
      const time = Date.now() - startTime
      debugLogger.success('🔄 L2 유사 검색어 HIT', {
        time,
        variantUsed: l2Result.variantUsed,
        variantType: l2Result.variantType
      })

      // 캐시 히트 시에도 학습
      let learningResult: { queryId: number; resultId: number } | null = null
      try {
        const sessionId = getSessionId()
        learningResult = await learnFromSuccessfulSearch({
          rawQuery,
          normalizedQuery: normalized,
          pattern,
          parsed,
          apiResult: {
            ...l2Result.data,
            lawTitle: l2Result.data.lawTitle || parsed.lawName,
            articleContent: '',
            isOrdinance: false,
          },
          sessionId,
        })
      } catch (error) {
        debugLogger.warning('L2 유사 검색어 학습 실패 (계속 진행)', error)
      }

      return {
        source: 'L2_variant',
        data: l2Result.data,
        time,
        variantUsed: l2Result.variantUsed,
        searchQueryId: learningResult?.queryId,
        searchResultId: learningResult?.resultId,
      }
    }

    // L3: 고품질 캐시 (30ms) - Phase 5: quality_score > 0.8인 결과만
    const l3Result = await searchHighQualityCache({
      lawName: parsed.lawName,
      articleJo: parsed.jo,
    })

    if (l3Result?.found) {
      const time = Date.now() - startTime
      debugLogger.success('⭐ L3 고품질 캐시 HIT', {
        time,
        qualityScore: l3Result.qualityScore,
        successCount: l3Result.successCount,
      })

      // 캐시 히트 시에도 학습
      let learningResult: { queryId: number; resultId: number } | null = null
      try {
        const sessionId = getSessionId()
        learningResult = await learnFromSuccessfulSearch({
          rawQuery,
          normalizedQuery: normalized,
          pattern,
          parsed,
          apiResult: {
            ...l3Result.data,
            lawTitle: l3Result.data.lawTitle || parsed.lawName,
            articleContent: '',
            isOrdinance: false,
          },
          sessionId,
        })
      } catch (error) {
        debugLogger.warning('L3 고품질 캐시 학습 실패 (계속 진행)', error)
      }

      return {
        source: 'L3_quality_cache',
        data: l3Result.data,
        time,
        searchQueryId: learningResult?.queryId,
        searchResultId: learningResult?.resultId,
      }
    }

    // L4: API 호출 (500-2000ms)
    debugLogger.warning('⏳ L4 API 호출 필요')
    const apiResult = await fetchFromAPI(parsed)

    if (apiResult) {
      const time = Date.now() - startTime

      // 자동 학습
      let learningResult: { queryId: number; resultId: number } | null = null
      try {
        const sessionId = getSessionId()
        learningResult = await learnFromSuccessfulSearch({
          rawQuery,
          normalizedQuery: normalized,
          pattern,
          parsed,
          apiResult,
          sessionId,
        })
        debugLogger.success('📚 학습 완료', { pattern, queryId: learningResult.queryId, resultId: learningResult.resultId })
      } catch (error) {
        debugLogger.error('학습 실패', error)
      }

      return {
        source: 'L4_api',
        data: apiResult,
        time,
        searchQueryId: learningResult?.queryId,
        searchResultId: learningResult?.resultId,
      }
    }

    throw new Error('검색 결과를 찾을 수 없습니다')
  } catch (error) {
    debugLogger.error('검색 실패', error)
    throw error
  }
}

// API 호출 (기존 로직)
async function fetchFromAPI(parsed: ReturnType<typeof parseSearchQuery>) {
  const { lawName, article } = parsed

  if (!lawName) {
    throw new Error('법령명을 입력해주세요')
  }

  try {
    // 법령 검색
    const searchUrl = `/api/law-search?query=${encodeURIComponent(lawName)}`
    const searchRes = await fetch(searchUrl)

    if (!searchRes.ok) {
      throw new Error('법령 검색 실패')
    }

    const searchData = await searchRes.json()

    if (!searchData.lawId) {
      throw new Error('법령을 찾을 수 없습니다')
    }

    // 법령 내용 가져오기
    const lawUrl = `/api/eflaw?lawId=${searchData.lawId}`
    const lawRes = await fetch(lawUrl)

    if (!lawRes.ok) {
      throw new Error('법령 조회 실패')
    }

    const lawData = await lawRes.json()

    return {
      lawId: searchData.lawId,
      mst: searchData.mst,
      lawTitle: lawData.lawTitle || searchData.lawTitle,
      effectiveDate: lawData.effectiveDate,
      articleContent: lawData.articles?.[0]?.content || '',
      articles: lawData.articles || [],
      isOrdinance: false,
      ...lawData,
    }
  } catch (error) {
    debugLogger.error('API 호출 실패', error)
    throw error
  }
}