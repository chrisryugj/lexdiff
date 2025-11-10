import { db, query } from '../lib/db'
import { initializeLocalDB } from '../lib/db-local'

async function initAndTest() {
  console.log('🚀 Initializing local SQLite database...')

  try {
    // 로컬 DB 초기화
    await initializeLocalDB()

    // 테이블 확인
    console.log('\n📊 Checking tables...')
    const tables = await query(`
      SELECT name FROM sqlite_master
      WHERE type='table'
      ORDER BY name
    `)

    console.log(`Found ${tables.rows.length} tables:`)
    tables.rows.forEach((table: any) => {
      console.log(`  - ${table.name}`)
    })

    // 테스트 데이터 삽입
    console.log('\n🧪 Testing data operations...')

    const result = await query(`
      INSERT INTO search_queries (
        raw_query, normalized_query, parsed_law_name,
        parsed_article, parsed_jo, search_type
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, [
      '관세법 38조',
      '관세법 제38조',
      '관세법',
      '제38조',
      '003800',
      'law'
    ])

    console.log('✅ Test query inserted, ID:', result.lastInsertRowid)

    // 데이터 조회
    const testQuery = await query(`
      SELECT * FROM search_queries
      WHERE raw_query = '관세법 38조'
      LIMIT 1
    `)

    console.log('✅ Test query retrieved:', testQuery.rows[0])

    // 정리
    await query(`
      DELETE FROM search_queries
      WHERE raw_query = '관세법 38조'
    `)

    console.log('\n✨ Local database ready!')
    console.log('📍 Database location: ./lexdiff-local.db')
    console.log('\n💡 To use Turso later, add to .env.local:')
    console.log('   TURSO_DATABASE_URL=libsql://...')
    console.log('   TURSO_AUTH_TOKEN=eyJ...')

  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

initAndTest()