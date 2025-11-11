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

          console.log('🔍 [L0 Vector] 반환 IDs:', {
            queryId: learningResult?.queryId,
            resultId: learningResult?.resultId,
            hasIds: !!(learningResult?.queryId && learningResult?.resultId),
          })

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

      console.log('🔍 [L1 Direct] 반환 IDs:', {
        queryId: learningResult?.queryId,
        resultId: learningResult?.resultId,
        hasIds: !!(learningResult?.queryId && learningResult?.resultId),
      })

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

      console.log('🔍 [L2 Variant Table] 반환 IDs:', {
        queryId: learningResult?.queryId,
        resultId: learningResult?.resultId,
        hasIds: !!(learningResult?.queryId && learningResult?.resultId),
      })

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

      console.log('🔍 [L2 Similar] 반환 IDs:', {
        queryId: learningResult?.queryId,
        resultId: learningResult?.resultId,
        hasIds: !!(learningResult?.queryId && learningResult?.resultId),
      })

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

      console.log('🔍 [L3 Quality] 반환 IDs:', {
        queryId: learningResult?.queryId,
        resultId: learningResult?.resultId,
        hasIds: !!(learningResult?.queryId && learningResult?.resultId),
      })

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

      console.log('🔍 [L4 API] 반환 IDs:', {
        queryId: learningResult?.queryId,
        resultId: learningResult?.resultId,
        hasIds: !!(learningResult?.queryId && learningResult?.resultId),
      })

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
    // 법령 검색 - 외부 API 직접 호출
    const LAW_OC = process.env.LAW_OC || 'ryuseungin'
    const searchUrl = `https://www.law.go.kr/DRF/lawSearch.do?OC=${LAW_OC}&type=XML&target=law&query=${encodeURIComponent(lawName)}`

    debugLogger.debug('법령 검색 API 호출', { searchUrl })
    const searchRes = await fetch(searchUrl)

    if (!searchRes.ok) {
      throw new Error('법령 검색 실패')
    }

    const searchXML = await searchRes.text()

    debugLogger.debug('법령 검색 API 응답', {
      length: searchXML.length,
      preview: searchXML.substring(0, 500)
    })

    // XML 파싱 (정규식 사용 - 간단한 추출)
    const lawIdMatch = searchXML.match(/<법령ID>(\d+)<\/법령ID>/)
    const mstMatch = searchXML.match(/<법령일련번호>(\d+)<\/법령일련번호>/)
    const lawTitleMatch = searchXML.match(/<법령명한글><!\[CDATA\[(.*?)\]\]><\/법령명한글>/)

    const lawId = lawIdMatch?.[1]
    const mst = mstMatch?.[1]
    const lawTitle = lawTitleMatch?.[1]

    // 법령을 찾지 못한 경우 → 벡터 검색으로 유사 검색어 제안
    if (!lawId) {
      debugLogger.warning('법령 ID 추출 실패, 벡터 검색으로 유사 검색어 찾는 중...', {
        lawName,
        xmlLength: searchXML.length,
      })

      // 벡터 검색으로 유사 검색어 찾기
      try {
        const { searchSimilarQueries } = await import('./vector-search')
        const similarQueries = await searchSimilarQueries(lawName, {
          topK: 3,
          threshold: 0.75, // 75% 유사도
          excludeSelf: true,
        })

        if (similarQueries.length > 0) {
          const suggestions = similarQueries.map(q => q.queryText).join(', ')
          debugLogger.info(`💡 유사 검색어 제안: ${suggestions}`)

          throw new Error(`법령을 찾을 수 없습니다.\n\n혹시 이것을 찾으셨나요?\n• ${similarQueries.map(q => q.queryText).join('\n• ')}`)
        }
      } catch (vectorError) {
        debugLogger.warning('벡터 검색 실패 (계속 진행)', vectorError)
      }

      throw new Error(`법령을 찾을 수 없습니다: ${lawName}`)
    }

    // 법령 내용 가져오기 - 외부 API 직접 호출
    const lawUrl = `https://www.law.go.kr/DRF/lawService.do?target=eflaw&OC=${LAW_OC}&type=JSON&ID=${lawId}`

    debugLogger.debug('법령 내용 API 호출', { lawUrl })
    const lawRes = await fetch(lawUrl)

    if (!lawRes.ok) {
      throw new Error('법령 조회 실패')
    }

    const lawData = await lawRes.json()

    return {
      lawId,
      mst,
      lawTitle: lawData.법령?.기본정보?.법령명_한글 || lawTitle,
      effectiveDate: lawData.법령?.기본정보?.시행일자,
      articleContent: '',
      articles: [],
      isOrdinance: false,
      ...lawData,
    }
  } catch (error) {
    debugLogger.error('API 호출 실패', error)
    throw error
  }
}