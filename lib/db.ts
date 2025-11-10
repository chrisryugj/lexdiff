import { createClient } from '@libsql/client'

// ⚠️ 이 모듈은 서버 사이드 전용입니다
if (typeof window !== 'undefined') {
  throw new Error(
    '❌ lib/db.ts는 클라이언트에서 사용할 수 없습니다. API 라우트를 사용하세요.\n' +
    '   예: /api/intelligent-search, /api/search-learning'
  )
}

// .env.local 로드 (서버 사이드에서만)
try {
  require('dotenv').config({ path: '.env.local' })
} catch {
  // dotenv가 설치되지 않았을 수 있음
}

// Turso 환경변수 체크
const tursoUrl = process.env.TURSO_DATABASE_URL
const tursoToken = process.env.TURSO_AUTH_TOKEN

export const db = createClient(
  tursoUrl && tursoToken
    ? {
        // Turso 원격 DB 사용
        url: tursoUrl,
        authToken: tursoToken,
      }
    : {
        // 로컬 SQLite 파일 사용 (개발 전용)
        url: 'file:./lexdiff-local.db'
      }
)

if (tursoUrl && tursoToken) {
  console.log('☁️  Using Turso remote database:', tursoUrl.split('.')[0] + '...')
} else {
  console.log('📦 Using local SQLite database (lexdiff-local.db)')
  console.log('💡 To use Turso, set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in .env.local')
}

export async function query(sql: string, params?: any[]) {
  return db.execute({ sql, args: params || [] })
}

export async function queryOne(sql: string, params?: any[]) {
  const result = await query(sql, params)
  return result.rows[0] || null
}

export async function queryAll(sql: string, params?: any[]) {
  const result = await query(sql, params)
  return result.rows
}