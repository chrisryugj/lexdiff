import { createClient } from '@libsql/client'

// ⚠️ 이 모듈은 서버 사이드 전용입니다
if (typeof window !== 'undefined') {
  throw new Error(
    '❌ lib/db.ts는 클라이언트에서 사용할 수 없습니다. API 라우트를 사용하세요.\n' +
    '   예: /api/intelligent-search, /api/search-learning'
  )
}

// .env.local 파일 직접 파싱 (Next.js 환경변수 로딩보다 먼저 실행될 수 있음)
// 서버 사이드에서만 동작하도록 조건부 require 사용
if (typeof window === 'undefined') {
  try {
    const fs = require('fs')
    const path = require('path')
    const envPath = path.join(process.cwd(), '.env.local')
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8')
      envContent.split('\n').forEach((line: string) => {
        const trimmed = line.trim()
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=')
          if (key && valueParts.length > 0) {
            const value = valueParts.join('=').trim()
            if (!process.env[key]) {
              process.env[key] = value
            }
          }
        }
      })
    }
  } catch (error) {
    console.warn('⚠️  .env.local 파일 로드 실패 (계속 진행):', error)
  }
}

// Turso 환경변수 체크
const tursoUrl = process.env.TURSO_DATABASE_URL
const tursoToken = process.env.TURSO_AUTH_TOKEN

console.log('🔧 환경변수 상태:')
console.log('   TURSO_DATABASE_URL:', tursoUrl ? `${tursoUrl.substring(0, 30)}...` : '❌ 없음')
console.log('   TURSO_AUTH_TOKEN:', tursoToken ? `${tursoToken.substring(0, 20)}...` : '❌ 없음')

// 환경변수가 없으면 에러
if (!tursoUrl || !tursoToken) {
  throw new Error(
    '❌ Turso 환경변수가 설정되지 않았습니다!\n' +
    '   .env.local 파일에 다음 변수를 설정하세요:\n' +
    '   - TURSO_DATABASE_URL\n' +
    '   - TURSO_AUTH_TOKEN'
  )
}

export const db = createClient({
  url: tursoUrl,
  authToken: tursoToken,
})

console.log('☁️  Using Turso remote database:', tursoUrl.split('.')[0] + '...')

// Auto-run migrations on startup (Phase 6) - 로컬/원격 모두 실행
import('./auto-migrate').then(({ runMigrationsIfNeeded }) => {
  runMigrationsIfNeeded().catch((error) => {
    console.error('⚠️  Auto-migration failed:', error)
  })
})

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
