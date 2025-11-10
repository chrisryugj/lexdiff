import { NextRequest, NextResponse } from 'next/server'
import { learnFromSuccessfulSearch, getSessionId, createSearchPattern } from '@/lib/search-learning'
import { normalizeSearchQuery } from '@/lib/search-normalizer'
import { parseSearchQuery } from '@/lib/law-parser'
import { debugLogger } from '@/lib/debug-logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { rawQuery, apiResult } = body

    if (!rawQuery || typeof rawQuery !== 'string') {
      return NextResponse.json(
        { error: '검색어를 입력해주세요' },
        { status: 400 }
      )
    }

    if (!apiResult) {
      return NextResponse.json(
        { error: 'API 결과가 필요합니다' },
        { status: 400 }
      )
    }

    debugLogger.info('📚 검색 학습 API 호출', {
      rawQuery,
      lawTitle: apiResult.lawTitle,
      hasLawId: !!apiResult.lawId,
    })

    // DB 연결 상태 체크
    try {
      const { db } = await import('@/lib/db')
      const dbTest = await db.execute('SELECT 1 as test')
      debugLogger.success('✅ Turso DB 연결 성공', {
        testResult: dbTest.rows[0],
        dbType: process.env.TURSO_DATABASE_URL ? 'Turso 원격 DB' : '로컬 SQLite'
      })
    } catch (dbError: any) {
      debugLogger.error('❌ Turso DB 연결 실패', {
        error: dbError.message,
        code: dbError.code,
        cause: dbError.cause?.message,
        dbUrl: process.env.TURSO_DATABASE_URL?.slice(0, 50) + '...',
      })
      throw new Error(`DB 연결 실패: ${dbError.message}`)
    }

    const normalized = normalizeSearchQuery(rawQuery)
    const pattern = createSearchPattern(normalized)
    const parsed = parseSearchQuery(normalized)

    debugLogger.info('🔄 검색 학습 시작', {
      normalized,
      pattern,
      lawName: parsed.lawName,
      article: parsed.article,
    })

    const result = await learnFromSuccessfulSearch({
      rawQuery,
      normalizedQuery: normalized,
      pattern,
      parsed,
      apiResult,
      sessionId: getSessionId(),
    })

    debugLogger.success('✅ 검색 학습 완료', {
      pattern,
      queryId: result.queryId,
      resultId: result.resultId,
      피드백버튼표시: '예',
    })

    return NextResponse.json({
      success: true,
      queryId: result.queryId,
      resultId: result.resultId,
      pattern,
    })
  } catch (error: any) {
    debugLogger.error('❌ 검색 학습 API 실패', {
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join('\n'),
      code: error.code,
      cause: error.cause?.message,
    })

    return NextResponse.json(
      {
        success: false,
        error: error.message || '학습 중 오류가 발생했습니다',
        details: {
          code: error.code,
          cause: error.cause?.message,
        }
      },
      { status: 500 }
    )
  }
}
