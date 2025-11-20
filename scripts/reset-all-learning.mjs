/**
 * 모든 학습 데이터 완전 초기화
 * Phase 2/5/6 학습 시스템 전체 리셋
 */

import { createClient } from '@libsql/client'
import { config } from 'dotenv'

config({ path: '.env.local' })

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

async function main() {
  console.log('🔥 모든 학습 데이터 초기화 시작...\n')

  // 1. search_results 테이블 전체 삭제
  const deleteResults = await turso.execute('DELETE FROM search_results')
  console.log(`✅ search_results: ${deleteResults.rowsAffected}개 삭제`)

  // 2. search_queries 테이블 전체 삭제
  const deleteQueries = await turso.execute('DELETE FROM search_queries')
  console.log(`✅ search_queries: ${deleteQueries.rowsAffected}개 삭제`)

  // 3. search_query_embeddings 테이블 전체 삭제 (Phase 6 벡터)
  try {
    const deleteEmbeddings = await turso.execute('DELETE FROM search_query_embeddings')
    console.log(`✅ search_query_embeddings: ${deleteEmbeddings.rowsAffected}개 삭제`)
  } catch (error) {
    console.log(`⚠️ search_query_embeddings 테이블 없음 (건너뜀)`)
  }

  console.log('\n✅ 모든 학습 데이터 초기화 완료!\n')
  console.log('💡 다음 단계:')
  console.log('   1. 브라우저 IndexedDB 삭제 (Phase 7 캐시)')
  console.log('   2. 서버 재시작')
  console.log('   3. 완전히 깨끗한 상태에서 테스트\n')
}

main().catch((error) => {
  console.error('❌ 오류 발생:', error)
  process.exit(1)
})
