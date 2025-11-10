// .env.local 먼저 로드
import { config } from 'dotenv'
config({ path: '.env.local' })

import { db, query, queryAll } from '../lib/db'

async function testConnection() {
  console.log('🚀 Testing Turso DB connection...')

  try {
    // Test 1: 연결 테스트
    console.log('\n1. Testing connection...')
    await query('SELECT 1 as test')
    console.log('✅ Connection successful!')

    // Test 2: 테이블 목록 확인
    console.log('\n2. Checking tables...')
    const tables = await queryAll(`
      SELECT name, sql
      FROM sqlite_master
      WHERE type='table'
      ORDER BY name
    `)

    if (tables.length === 0) {
      console.log('⚠️  No tables found. Please run migrations first:')
      console.log('   turso db shell lexdiff-feedback < db/migrations/001_basic_schema.sql')
      console.log('   turso db shell lexdiff-feedback < db/migrations/002_mapping_schema.sql')
    } else {
      console.log(`✅ Found ${tables.length} tables:`)
      tables.forEach((table: any) => {
        console.log(`   - ${table.name}`)
      })
    }

    // Test 3: 인덱스 확인
    console.log('\n3. Checking indexes...')
    const indexes = await queryAll(`
      SELECT name, tbl_name
      FROM sqlite_master
      WHERE type='index'
      ORDER BY name
    `)
    console.log(`✅ Found ${indexes.length} indexes`)

    // Test 4: 테스트 데이터 삽입 (테이블이 있는 경우)
    if (tables.length > 0) {
      console.log('\n4. Testing data insertion...')

      // 검색 쿼리 삽입
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

      console.log('✅ Test data inserted, ID:', result.lastInsertRowid)

      // 데이터 조회
      console.log('\n5. Testing data retrieval...')
      const queries = await queryAll(`
        SELECT * FROM search_queries
        WHERE raw_query = '관세법 38조'
        LIMIT 1
      `)

      if (queries.length > 0) {
        console.log('✅ Data retrieved successfully:', queries[0])
      }

      // 테스트 데이터 정리
      await query(`
        DELETE FROM search_queries
        WHERE raw_query = '관세법 38조'
      `)
      console.log('✅ Test data cleaned up')
    }

    console.log('\n✨ All tests passed! Database is ready.')

  } catch (error) {
    console.error('\n❌ Error during testing:', error)

    if (error instanceof Error) {
      if (error.message.includes('TURSO_DATABASE_URL')) {
        console.error('\n⚠️  Missing environment variables!')
        console.error('Please add to .env.local:')
        console.error('  TURSO_DATABASE_URL=libsql://...')
        console.error('  TURSO_AUTH_TOKEN=eyJ...')
      } else if (error.message.includes('no such table')) {
        console.error('\n⚠️  Tables not found!')
        console.error('Please run migrations:')
        console.error('  turso db shell lexdiff-feedback < db/migrations/001_basic_schema.sql')
        console.error('  turso db shell lexdiff-feedback < db/migrations/002_mapping_schema.sql')
      }
    }

    process.exit(1)
  }

  process.exit(0)
}

// Run the test
testConnection()