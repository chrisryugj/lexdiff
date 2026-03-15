/**
 * 조례 상세 조회 API
 * GET /api/ordin-detail?seq=1234567
 * → 법제처에서 HTML 본문 반환
 */

import { NextResponse } from 'next/server'

const OC = process.env.LAW_OC || ''

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const seq = searchParams.get('seq')

  if (!seq) {
    return NextResponse.json({ error: '조례 일련번호(seq)가 필요합니다.' }, { status: 400 })
  }

  try {
    const url = `https://www.law.go.kr/DRF/lawService.do?OC=${OC}&target=ordin&MST=${seq}&type=HTML`
    const res = await fetch(url, { next: { revalidate: 86400 } })

    if (!res.ok) {
      return new NextResponse('조례 본문 조회 실패', { status: res.status })
    }

    const html = await res.text()

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      },
    })
  } catch (error) {
    return new NextResponse('조례 본문 조회 실패', { status: 500 })
  }
}
