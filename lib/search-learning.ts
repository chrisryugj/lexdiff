import { recordSearchQuery, recordSearchResult, recordApiMapping } from './search-feedback-db'
import { normalizeSearchQuery } from './search-normalizer'
import { parseSearchQuery } from './law-parser'
import { generateEmbedding, storeSearchQueryEmbedding } from './embedding'

// 검색 패턴 생성 (정규화된 쿼리 → 고유 식별자)
export function createSearchPattern(normalizedQuery: string): string {
  return normalizedQuery
    .replace(/\s+/g, '_')
    .replace(/[^가-힣a-zA-Z0-9_]/g, '')
    .toLowerCase()
}

// 성공한 API 호출 학습
export async function learnFromSuccessfulSearch(params: {
  rawQuery: string
  normalizedQuery: string
  pattern: string
  parsed: ReturnType<typeof parseSearchQuery>
  apiResult: any
  sessionId?: string
}): Promise<{ queryId: number; resultId: number }> {
  const { rawQuery, normalizedQuery, pattern, parsed, apiResult, sessionId } = params

  try {
    // 1. 검색 쿼리 기록
    const queryId = await recordSearchQuery({
      rawQuery,
      normalizedQuery,
      parsedLawName: parsed.lawName,
      parsedArticle: parsed.article || '',
      parsedJo: parsed.jo || '',
      searchType: apiResult.isOrdinance ? 'ordinance' : 'law',
      sessionId,
    })

    // 2. 검색 결과 저장
    const resultId = await recordSearchResult({
      queryId,
      lawId: apiResult.lawId,
      lawTitle: apiResult.lawTitle,
      lawMst: apiResult.mst,
      articleJo: parsed.jo,
      articleContent: apiResult.articleContent || '',
      effectiveDate: apiResult.effectiveDate,
      resultType: apiResult.isOrdinance ? 'ordinance' : 'law',
    })

    // 3. API 파라미터 매핑 저장 (중요!)
    const mappingId = await recordApiMapping({
      pattern,
      lawName: parsed.lawName,
      article: parsed.article || '',
      jo: parsed.jo || '',
      apiParams: {
        lawId: apiResult.lawId,
        mst: apiResult.mst,
        effectiveDate: apiResult.effectiveDate,
        lawTitle: apiResult.lawTitle,
      },
    })

    // 4. 벡터 임베딩 생성 및 저장 (Phase 6)
    try {
      const embeddingResult = await generateEmbedding(rawQuery)
      await storeSearchQueryEmbedding(rawQuery, embeddingResult.embedding, {
        normalizedText: normalizedQuery,
        mappedPattern: pattern,
        mappingId: mappingId,
      })
      console.log(`✅ Embedding stored for: "${rawQuery}" (${embeddingResult.tokens} tokens)`)
    } catch (error) {
      console.error('⚠️ Failed to store embedding (non-critical):', error)
      // Non-critical: continue even if embedding storage fails
    }

    return { queryId, resultId }
  } catch (error) {
    console.error('❌ Failed to learn from search:', error)
    throw error
  }
}

// 세션 ID 생성 (브라우저 세션)
export function getSessionId(): string {
  if (typeof window === 'undefined') return ''

  let sessionId = sessionStorage.getItem('lexdiff_session_id')
  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    sessionStorage.setItem('lexdiff_session_id', sessionId)
  }
  return sessionId
}

// 검색 패턴으로 캐시된 결과 찾기
export async function findCachedResult(rawQuery: string) {
  const normalized = normalizeSearchQuery(rawQuery)
  const pattern = createSearchPattern(normalized)

  const { searchDirectMapping } = await import('./search-feedback-db')
  const mapping = await searchDirectMapping(pattern)

  if (mapping) {
    return {
      found: true,
      source: 'L1_direct_mapping',
      data: JSON.parse(mapping.api_params as string),
      pattern,
    }
  }

  return { found: false, pattern }
}