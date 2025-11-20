import { createClient } from '@libsql/client'
import dotenv from 'dotenv'

// .env.local 명시적 로드
dotenv.config({ path: '.env.local' })

const tursoUrl = process.env.TURSO_DATABASE_URL
const tursoToken = process.env.TURSO_AUTH_TOKEN

console.log('🔑 환경변수 확인:')
console.log('   TURSO_DATABASE_URL:', tursoUrl ? `${tursoUrl.split('.')[0]}...` : '❌ 없음')
console.log('   TURSO_AUTH_TOKEN:', tursoToken ? `${tursoToken.substring(0, 20)}...` : '❌ 없음')
console.log('   VOYAGE_API_KEY:', process.env.VOYAGE_API_KEY ? '✅ 설정됨' : '❌ 없음')

const db = createClient(
  tursoUrl && tursoToken
    ? {
        url: tursoUrl,
        authToken: tursoToken,
      }
    : {
        url: 'file:./lexdiff-local.db'
      }
)

console.log('\n🔍 데이터베이스 연결:', tursoUrl ? `Turso (${tursoUrl.split('.')[0]}...)` : 'Local SQLite')

try {
  // 1. 테이블 존재 확인
  console.log('\n📋 벡터 관련 테이블 확인...')
  const tables = await db.execute(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name LIKE '%embedding%'
  `)

  if (tables.rows.length === 0) {
    console.log('❌ 벡터 테이블이 없습니다!')
    console.log('   서버를 재시작하여 자동 마이그레이션이 실행되도록 하세요.')
  } else {
    console.log('✅ 벡터 테이블:', tables.rows.map(r => r.name).join(', '))

    // 2. 각 테이블의 데이터 개수 확인
    for (const row of tables.rows) {
      const tableName = row.name
      if (!tableName.includes('shadow')) {
        const count = await db.execute(`SELECT COUNT(*) as cnt FROM ${tableName}`)
        console.log(`   - ${tableName}: ${count.rows[0].cnt}개 레코드`)
      }
    }
  }

  // 3. search_query_embeddings 샘플 데이터 확인
  console.log('\n🔍 검색어 임베딩 샘플 (최근 5개):')
  try {
    const samples = await db.execute(`
      SELECT query_text, search_count, mapping_id, mapped_pattern, created_at
      FROM search_query_embeddings
      ORDER BY created_at DESC
      LIMIT 5
    `)

    if (samples.rows.length === 0) {
      console.log('   (데이터 없음)')
    } else {
      samples.rows.forEach((r, i) => {
        console.log(`   ${i+1}. "${r.query_text}" (검색 ${r.search_count}회)`)
        console.log(`       mapping_id: ${r.mapping_id || '❌ 없음'}, pattern: ${r.mapped_pattern || '없음'}`)
      })
    }
  } catch (e) {
    console.log('   ⚠️ 테이블이 존재하지 않거나 조회 실패')
  }

  // 4. api_parameter_mappings 확인
  console.log('\n📊 API 매핑 테이블 확인:')
  try {
    const mappingCount = await db.execute(`SELECT COUNT(*) as cnt FROM api_parameter_mappings`)
    console.log(`   - api_parameter_mappings: ${mappingCount.rows[0].cnt}개 레코드`)

    const mappingSamples = await db.execute(`
      SELECT id, normalized_pattern, law_name, article_jo, success_count
      FROM api_parameter_mappings
      ORDER BY last_success_at DESC
      LIMIT 5
    `)

    if (mappingSamples.rows.length > 0) {
      console.log('   최근 매핑 (상위 5개):')
      mappingSamples.rows.forEach((r, i) => {
        console.log(`   ${i+1}. [ID:${r.id}] ${r.law_name} ${r.article_jo} (성공 ${r.success_count}회)`)
        console.log(`       pattern: ${r.normalized_pattern}`)
      })
    }
  } catch (e) {
    console.log('   ⚠️ 테이블 조회 실패:', e.message)
  }

  console.log('\n✅ 확인 완료')
  console.log('\n💡 서버 재시작 시 다음 로그를 확인하세요:')
  console.log('   - "🚀 Running Phase 6 vector schema migration..." 또는')
  console.log('   - "✓ Vector search tables already exist"')
} catch (error) {
  console.error('❌ 오류:', error.message)
} finally {
  db.close()
}
