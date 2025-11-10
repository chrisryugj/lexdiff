// .env.local 먼저 로드
import { config } from 'dotenv'
config({ path: '.env.local' })

import { db, query } from '../lib/db'

async function checkTables() {
  console.log('🔍 Checking Turso database tables...\n')

  try {
    // 테이블 목록 조회
    const tables = await query(`
      SELECT name, sql
      FROM sqlite_master
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `)

    console.log(`Found ${tables.rows.length} tables:\n`)

    tables.rows.forEach((table: any, index: number) => {
      console.log(`${index + 1}. ${table.name}`)
    })

    console.log('\n' + '='.repeat(50))
    console.log('Expected 9 tables:')
    console.log('1. search_queries')
    console.log('2. search_results')
    console.log('3. delegation_connections')
    console.log('4. user_feedback')
    console.log('5. search_quality_scores')
    console.log('6. api_parameter_mappings')
    console.log('7. similar_query_groups')
    console.log('8. query_variants')
    console.log('9. search_strategy_logs')
    console.log('='.repeat(50))

    // 인덱스 개수 확인
    const indexes = await query(`
      SELECT COUNT(*) as count
      FROM sqlite_master
      WHERE type='index' AND name NOT LIKE 'sqlite_%'
    `)

    console.log(`\n📊 Total indexes: ${indexes.rows[0]?.count || 0}`)
    console.log('Expected indexes: 28')

  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }

  process.exit(0)
}

checkTables()
