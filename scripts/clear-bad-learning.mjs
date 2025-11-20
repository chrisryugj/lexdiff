/**
 * 잘못된 학습 데이터 정리 스크립트
 * "형법" 검색 시 "군에서의 형의 집행..." 법령으로 잘못 연결된 학습 데이터 제거
 */

import { createClient } from '@libsql/client'
import { config } from 'dotenv'

// .env.local 로드
config({ path: '.env.local' })

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

async function main() {
  console.log('🔍 잘못된 학습 데이터 확인 중...\n')

  // 1. "형법" 관련 모든 검색 쿼리 조회
  const queries = await turso.execute(`
    SELECT id, raw_query, normalized_query, created_at
    FROM search_queries
    WHERE raw_query LIKE '%형법%' OR normalized_query LIKE '%형법%'
    ORDER BY created_at DESC
    LIMIT 20
  `)

  console.log(`📊 "형법" 관련 검색어: ${queries.rows.length}개\n`)

  if (queries.rows.length === 0) {
    console.log('✅ "형법" 관련 검색 기록 없음\n')
    return
  }

  for (const row of queries.rows) {
    console.log(`\n쿼리 ID ${row.id}: "${row.raw_query}"`)
    console.log(`  정규화: "${row.normalized_query}"`)
    console.log(`  생성: ${row.created_at}`)

    // 해당 쿼리의 검색 결과 조회
    const results = await turso.execute({
      sql: `
        SELECT id, law_title, law_id, result_type, api_source, created_at
        FROM search_results
        WHERE query_id = ?
        ORDER BY created_at DESC
      `,
      args: [row.id],
    })

    if (results.rows.length === 0) {
      console.log(`  ❌ 검색 결과 없음`)
      continue
    }

    for (const result of results.rows) {
      const marker =
        result.law_title && result.law_title.includes('군에서의') && result.law_title.includes('형의 집행')
          ? '⚠️ 잘못된 결과!'
          : '  '

      console.log(
        `  ${marker} "${result.law_title}" (lawId: ${result.law_id}, type: ${result.result_type}, source: ${result.api_source})`,
      )
    }
  }

  console.log('\n\n🔥 잘못된 학습 데이터 삭제 시작...\n')

  // 2. "군에서의 형의 집행..." 법령 결과 삭제
  const deleteResults = await turso.execute(`
    DELETE FROM search_results
    WHERE law_title LIKE '%군에서의%형의 집행%'
  `)

  console.log(`✅ 삭제된 검색 결과: ${deleteResults.rowsAffected}개\n`)

  // 3. 검색 결과가 없어진 쿼리도 삭제 (orphan cleanup)
  const deleteOrphanQueries = await turso.execute(`
    DELETE FROM search_queries
    WHERE id NOT IN (SELECT DISTINCT query_id FROM search_results WHERE query_id IS NOT NULL)
    AND (raw_query LIKE '%형법%' OR normalized_query LIKE '%형법%')
  `)

  console.log(`✅ 정리된 검색 쿼리: ${deleteOrphanQueries.rowsAffected}개\n`)

  // 4. 삭제 후 상태 확인
  console.log('📊 삭제 후 "형법" 관련 데이터:\n')

  const afterQueries = await turso.execute(`
    SELECT id, raw_query, normalized_query
    FROM search_queries
    WHERE raw_query LIKE '%형법%' OR normalized_query LIKE '%형법%'
    ORDER BY created_at DESC
    LIMIT 10
  `)

  if (afterQueries.rows.length === 0) {
    console.log('✅ "형법" 관련 데이터 없음 (완전히 정리됨)\n')
  } else {
    for (const row of afterQueries.rows) {
      const results = await turso.execute({
        sql: `
          SELECT law_title, result_type
          FROM search_results
          WHERE query_id = ?
        `,
        args: [row.id],
      })

      console.log(`쿼리: "${row.raw_query}"`)
      if (results.rows.length === 0) {
        console.log(`  ✅ 검색 결과 없음 (깨끗함)\n`)
      } else {
        for (const result of results.rows) {
          console.log(`  - "${result.law_title}" (${result.result_type})`)
        }
        console.log()
      }
    }
  }

  console.log('✅ 작업 완료!\n')
  console.log('💡 다음 단계:')
  console.log('   1. 브라우저에서 "형법 22조" 검색')
  console.log('   2. 정확한 "형법" 법령이 표시되는지 확인')
  console.log('   3. 제22조 (살인) 내용이 나오는지 확인\n')
}

main().catch((error) => {
  console.error('❌ 오류 발생:', error)
  process.exit(1)
})
