import { db, query, queryOne } from './db'

export async function recordSearchQuery(params: {
  rawQuery: string
  normalizedQuery: string
  parsedLawName: string
  parsedArticle?: string
  parsedJo?: string
  searchType: 'law' | 'ordinance'
  sessionId?: string
}): Promise<number> {
  try {
    const result = await query(`
      INSERT INTO search_queries (
        raw_query, normalized_query, parsed_law_name,
        parsed_article, parsed_jo, search_type, user_session_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      params.rawQuery,
      params.normalizedQuery,
      params.parsedLawName,
      params.parsedArticle || null,
      params.parsedJo || null,
      params.searchType,
      params.sessionId || null
    ])

    // BigInt를 Number로 변환 (JSON 직렬화 문제 해결)
    return Number(result.lastInsertRowid)
  } catch (error: any) {
    console.error('❌ DB 에러: recordSearchQuery 실패', {
      error: error.message,
      code: error.code,
      params: {
        rawQuery: params.rawQuery,
        lawName: params.parsedLawName,
      }
    })
    throw error
  }
}

export async function recordSearchResult(params: {
  queryId: number
  lawId?: string
  lawTitle: string
  lawMst?: string
  articleJo?: string
  articleContent?: string
  effectiveDate?: string
  resultType: 'law' | 'ordinance'
}): Promise<number> {
  try {
    const result = await query(`
      INSERT INTO search_results (
        query_id, law_id, law_title, law_mst,
        article_jo, article_content, effective_date, result_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      params.queryId,
      params.lawId || null,
      params.lawTitle,
      params.lawMst || null,
      params.articleJo || null,
      params.articleContent || null,
      params.effectiveDate || null,
      params.resultType
    ])

    // BigInt를 Number로 변환 (JSON 직렬화 문제 해결)
    return Number(result.lastInsertRowid)
  } catch (error: any) {
    console.error('❌ DB 에러: recordSearchResult 실패', {
      error: error.message,
      code: error.code,
      params: {
        queryId: params.queryId,
        lawTitle: params.lawTitle,
      }
    })
    throw error
  }
}

export async function recordApiMapping(params: {
  pattern: string
  lawName: string
  article: string
  jo: string
  apiParams: any
  searchResultId?: number // Phase 5: L3 캐시용
}): Promise<number> {
  try {
    const result = await query(`
      INSERT INTO api_parameter_mappings (
        normalized_pattern, law_name, article_display, article_jo,
        api_params, api_endpoint, search_result_id, success_count, last_success_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
      ON CONFLICT(normalized_pattern) DO UPDATE SET
        search_result_id = excluded.search_result_id,
        success_count = success_count + 1,
        last_success_at = datetime('now')
      RETURNING id
    `, [
      params.pattern,
      params.lawName,
      params.article,
      params.jo,
      JSON.stringify(params.apiParams),
      '/api/eflaw',
      params.searchResultId || null
    ])

    // RETURNING id를 사용하여 정확한 ID 반환
    return Number(result.rows[0].id)
  } catch (error: any) {
    console.error('❌ DB 에러: recordApiMapping 실패', {
      error: error.message,
      code: error.code,
      params: {
        pattern: params.pattern,
        lawName: params.lawName,
      }
    })
    throw error
  }
}

export async function searchDirectMapping(pattern: string) {
  return await queryOne(`
    SELECT *
    FROM api_parameter_mappings
    WHERE normalized_pattern = ? AND is_verified = 1
    ORDER BY quality_score DESC
    LIMIT 1
  `, [pattern])
}

export async function recordUserFeedback(params: {
  searchResultId: number
  feedbackType: 'positive' | 'negative'
  feedbackDetail?: string
  sessionId?: string
}): Promise<void> {
  // 피드백 저장
  await query(`
    INSERT INTO user_feedback (
      search_result_id, feedback_type, feedback_detail, user_session_id
    ) VALUES (?, ?, ?, ?)
  `, [
    params.searchResultId,
    params.feedbackType,
    params.feedbackDetail || null,
    params.sessionId || null
  ])

  // 품질 점수 업데이트
  await updateQualityScore(params.searchResultId)
}

export async function updateQualityScore(searchResultId: number): Promise<void> {
  // 품질 점수 테이블이 없으면 생성
  await query(`
    INSERT OR IGNORE INTO search_quality_scores (search_result_id)
    VALUES (?)
  `, [searchResultId])

  // 피드백 집계
  const feedback = await queryOne(`
    SELECT
      COUNT(CASE WHEN feedback_type = 'positive' THEN 1 END) as positive_count,
      COUNT(CASE WHEN feedback_type = 'negative' THEN 1 END) as negative_count
    FROM user_feedback
    WHERE search_result_id = ?
  `, [searchResultId])

  const positive = feedback?.positive_count || 0
  const negative = feedback?.negative_count || 0

  // 간단한 품질 점수 계산 (Wilson Score Interval의 간소화 버전)
  const total = positive + negative
  let qualityScore = 0
  if (total > 0) {
    qualityScore = (positive + 1.9208) / (total + 3.8416) -
                   1.96 * Math.sqrt((positive * negative) / (total + 3.8416) + 0.9604) /
                   (total + 3.8416)
  }

  // 품질 점수 업데이트
  await query(`
    UPDATE search_quality_scores
    SET positive_count = ?,
        negative_count = ?,
        quality_score = ?,
        last_updated = datetime('now')
    WHERE search_result_id = ?
  `, [positive, negative, qualityScore, searchResultId])
}

export async function recordStrategyLog(params: {
  queryId: number
  strategyUsed: string
  totalTimeMs: number
  cacheLayer?: string
  wasSuccessful?: boolean
  errorMessage?: string
}): Promise<void> {
  await query(`
    INSERT INTO search_strategy_logs (
      query_id, strategy_used, total_time_ms, cache_layer,
      was_successful, error_message
    ) VALUES (?, ?, ?, ?, ?, ?)
  `, [
    params.queryId,
    params.strategyUsed,
    params.totalTimeMs,
    params.cacheLayer || null,
    params.wasSuccessful !== false ? 1 : 0,
    params.errorMessage || null
  ])
}

export async function getSessionSearchHistory(sessionId: string) {
  return await query(`
    SELECT
      sq.id,
      sq.raw_query,
      sq.normalized_query,
      sq.created_at,
      sr.law_title,
      sr.article_jo,
      sqs.quality_score
    FROM search_queries sq
    LEFT JOIN search_results sr ON sq.id = sr.query_id
    LEFT JOIN search_quality_scores sqs ON sr.id = sqs.search_result_id
    WHERE sq.user_session_id = ?
    ORDER BY sq.created_at DESC
    LIMIT 100
  `, [sessionId])
}

// L3: 고품질 캐시 검색 (quality_score > 0.8)
export async function searchHighQualityCache(params: {
  lawName: string
  articleJo?: string
}): Promise<any | null> {
  const result = await query(`
    SELECT
      apm.api_params,
      sqs.quality_score,
      apm.success_count
    FROM api_parameter_mappings apm
    JOIN search_quality_scores sqs ON apm.search_result_id = sqs.search_result_id
    WHERE apm.law_name = ?
      AND (? IS NULL OR apm.article_jo = ?)
      AND sqs.quality_score > 0.8
      AND apm.is_verified = 1
    ORDER BY sqs.quality_score DESC, apm.success_count DESC
    LIMIT 1
  `, [params.lawName, params.articleJo || null, params.articleJo || null])

  if (result.rows.length === 0) {
    return null
  }

  const row = result.rows[0]
  return {
    found: true,
    data: JSON.parse(row.api_params as string),
    qualityScore: row.quality_score,
    successCount: row.success_count,
  }
}