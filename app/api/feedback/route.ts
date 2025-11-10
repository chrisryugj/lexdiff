import { NextRequest, NextResponse } from 'next/server'
import { recordUserFeedback } from '@/lib/search-feedback-db'
import { getSessionId } from '@/lib/search-learning'
import { debugLogger } from '@/lib/debug-logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      searchQueryId,
      searchResultId,
      lawId,
      lawTitle,
      articleNumber,
      feedback,
    } = body

    if (!feedback || !['positive', 'negative'].includes(feedback)) {
      return NextResponse.json(
        { error: '유효하지 않은 피드백 타입입니다' },
        { status: 400 }
      )
    }

    debugLogger.info('피드백 저장 API 호출', {
      searchResultId,
      feedback,
      lawTitle,
      articleNumber,
    })

    // searchResultId가 없으면 에러
    if (!searchResultId) {
      return NextResponse.json(
        { error: 'searchResultId가 필요합니다' },
        { status: 400 }
      )
    }

    // 임시 ID (음수)인 경우: DB 저장 건너뛰고 클라이언트에서만 처리
    if (searchResultId < 0) {
      debugLogger.warning('⚠️ 임시 ID 피드백 (DB 저장 생략)', {
        searchResultId,
        feedback,
        lawTitle,
        articleNumber,
        message: '학습 실패로 인한 임시 ID - 클라이언트에서만 저장됨'
      })

      return NextResponse.json({
        success: true,
        message: '피드백이 로컬에 저장되었습니다',
        isTemporary: true,
      })
    }

    const sessionId = getSessionId()

    // 정상 ID: DB에 피드백 저장 및 품질 점수 자동 업데이트
    await recordUserFeedback({
      searchResultId,
      feedbackType: feedback,
      feedbackDetail: `${lawTitle} ${articleNumber || ''}`.trim(),
      sessionId,
    })

    debugLogger.success('✅ 피드백 DB 저장 완료', { searchResultId, feedback })

    return NextResponse.json({
      success: true,
      message: '피드백이 저장되었습니다',
    })
  } catch (error: any) {
    debugLogger.error('피드백 저장 API 실패', error)

    return NextResponse.json(
      {
        success: false,
        error: error.message || '피드백 저장 중 오류가 발생했습니다',
      },
      { status: 500 }
    )
  }
}
