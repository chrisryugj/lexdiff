import { query } from './db'
import { generateVariants } from './variant-generator'
import { createSearchPattern } from './search-learning'

// 유사 검색어로 매핑 찾기
export async function searchSimilarVariants(rawQuery: string, pattern: string) {
  // 1. 현재 쿼리의 변형 생성
  const variants = generateVariants(rawQuery)

  if (variants.length === 0) return null

  // 2. 각 변형에 대해 DB 검색
  for (const variant of variants) {
    const variantPattern = createSearchPattern(variant.variant)

    const result = await query(`
      SELECT *
      FROM api_parameter_mappings
      WHERE normalized_pattern = ? AND is_verified = 1
      ORDER BY quality_score DESC
      LIMIT 1
    `, [variantPattern])

    if (result.rows.length > 0) {
      const mapping = result.rows[0]
      return {
        found: true,
        source: 'L2_variant',
        variantUsed: variant.variant,
        variantType: variant.type,
        confidence: variant.confidence,
        data: JSON.parse(mapping.api_params as string),
      }
    }
  }

  return null
}

// 검색어 변형 DB에 저장 (나중에 빠른 조회용)
export async function saveVariantsToDatabase(canonicalQuery: string, mappingId: number) {
  const variants = generateVariants(canonicalQuery)

  if (variants.length === 0) return

  const canonicalPattern = createSearchPattern(canonicalQuery)

  // 1. 유사 검색어 그룹 생성
  const groupResult = await query(`
    INSERT INTO similar_query_groups (
      canonical_query, canonical_pattern, mapping_id, variant_count
    ) VALUES (?, ?, ?, ?)
    ON CONFLICT(canonical_pattern) DO UPDATE SET
      variant_count = ?,
      updated_at = datetime('now')
  `, [
    canonicalQuery,
    canonicalPattern,
    mappingId,
    variants.length,
    variants.length,
  ])

  const groupId = groupResult.lastInsertRowid

  // 2. 각 변형 저장
  for (const variant of variants) {
    const normalizedVariant = createSearchPattern(variant.variant)

    await query(`
      INSERT INTO query_variants (
        group_id, variant_query, normalized_variant,
        variant_type, confidence_score
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(variant_query) DO UPDATE SET
        search_count = search_count + 1,
        last_searched_at = datetime('now')
    `, [
      groupId,
      variant.variant,
      normalizedVariant,
      variant.type,
      variant.confidence,
    ])
  }
}

// L2 전략: 변형 테이블에서 직접 찾기 (더 빠름)
export async function searchVariantTable(rawQuery: string) {
  const pattern = createSearchPattern(rawQuery)

  // query_variants 테이블에서 검색
  const result = await query(`
    SELECT
      qv.*,
      sqg.mapping_id,
      apm.api_params
    FROM query_variants qv
    JOIN similar_query_groups sqg ON qv.group_id = sqg.id
    JOIN api_parameter_mappings apm ON sqg.mapping_id = apm.id
    WHERE qv.normalized_variant = ?
    ORDER BY qv.confidence_score DESC, apm.quality_score DESC
    LIMIT 1
  `, [pattern])

  if (result.rows.length > 0) {
    const row = result.rows[0]
    return {
      found: true,
      source: 'L2_variant_table',
      data: JSON.parse(row.api_params as string),
    }
  }

  return null
}