// .env.local 먼저 로드 (db import 전에!)
import { config } from 'dotenv'
config({ path: '.env.local' })

import { db } from '../lib/db'
import fs from 'fs'
import path from 'path'

// SQL 파일 파싱 함수 (주석 제거 및 문장 분리)
function parseSqlFile(content: string): string[] {
  // 줄별로 주석 제거
  const lines = content.split('\n')
  const cleanedLines = lines
    .filter(line => {
      const trimmed = line.trim()
      return trimmed.length > 0 && !trimmed.startsWith('--')
    })
    .join('\n')

  // 세미콜론으로 분리하되, 빈 문장 제거
  return cleanedLines
    .split(';')
    .map(stmt => stmt.trim())
    .filter(stmt => stmt.length > 0)
}

async function runMigrations() {
  console.log('🚀 Running database migrations...\n')

  try {
    // 001_basic_schema.sql 읽기
    const schema1Path = path.join(process.cwd(), 'db/migrations/001_basic_schema.sql')
    const schema1 = fs.readFileSync(schema1Path, 'utf-8')

    console.log('📝 Running 001_basic_schema.sql...')
    const statements1 = parseSqlFile(schema1)

    for (const stmt of statements1) {
      if (stmt.trim()) {
        await db.execute(stmt)
      }
    }
    console.log('✅ 001_basic_schema.sql completed (5 tables)\n')

    // 002_mapping_schema.sql 읽기
    const schema2Path = path.join(process.cwd(), 'db/migrations/002_mapping_schema.sql')
    const schema2 = fs.readFileSync(schema2Path, 'utf-8')

    console.log('📝 Running 002_mapping_schema.sql...')
    const statements2 = parseSqlFile(schema2)

    for (const stmt of statements2) {
      if (stmt.trim()) {
        await db.execute(stmt)
      }
    }
    console.log('✅ 002_mapping_schema.sql completed (4 tables)\n')

    // 테이블 확인
    console.log('📊 Verifying tables...')
    const result = await db.execute(`
      SELECT name FROM sqlite_master
      WHERE type='table'
      ORDER BY name
    `)

    console.log(`\n✅ Found ${result.rows.length} tables:`)
    result.rows.forEach((row: any) => {
      console.log(`   - ${row.name}`)
    })

    console.log('\n✨ All migrations completed successfully!')

  } catch (error) {
    console.error('\n❌ Migration failed:', error)

    if (error instanceof Error) {
      if (error.message.includes('TURSO_DATABASE_URL')) {
        console.error('\n⚠️  Please set environment variables in .env.local:')
        console.error('   TURSO_DATABASE_URL=libsql://...')
        console.error('   TURSO_AUTH_TOKEN=eyJ...')
      }
    }

    process.exit(1)
  }
}

runMigrations()