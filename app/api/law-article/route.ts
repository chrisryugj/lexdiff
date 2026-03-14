/**
 * 법령 조문 단건 조회 API
 *
 * 영향 추적기 카드의 "조문 보기" → 레퍼런스 모달용
 * search_law → get_law_text(jo) 파이프라인
 */

import { NextRequest, NextResponse } from 'next/server'
import { executeTool } from '@/lib/fc-rag/tool-adapter'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const lawName = searchParams.get('lawName')
  const jo = searchParams.get('jo') // JO 코드: "003800"
  const joDisplay = searchParams.get('joDisplay') // "제38조"

  if (!lawName) {
    return NextResponse.json({ error: 'lawName is required' }, { status: 400 })
  }

  try {
    // 1) search_law로 MST 확보
    const searchResult = await executeTool('search_law', { query: lawName })
    if (searchResult.isError) {
      return NextResponse.json({ html: `<p>${lawName}을(를) 찾을 수 없습니다.</p>` })
    }

    // MST 추출 (search_law 결과에서)
    const mstMatch = searchResult.result.match(/MST:\s*(\d+)/)
    if (!mstMatch) {
      return NextResponse.json({ html: `<p>${lawName} MST를 확인할 수 없습니다.</p>` })
    }

    const mst = mstMatch[1]

    // 2) get_law_text로 특정 조문 조회
    const lawResult = await executeTool('get_law_text', {
      mst,
      jo: joDisplay || undefined,
    })

    if (lawResult.isError) {
      return NextResponse.json({ html: `<p>조문을 불러올 수 없습니다.</p>` })
    }

    // 텍스트 → HTML 변환 (간단한 줄바꿈 처리)
    const text = lawResult.result
    const html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br/>')

    return NextResponse.json({ html: `<div style="white-space:pre-wrap">${html}</div>` })
  } catch (error) {
    console.error('[law-article] Error:', error)
    return NextResponse.json({
      html: `<p>조문 조회 중 오류가 발생했습니다.</p>`,
    })
  }
}
