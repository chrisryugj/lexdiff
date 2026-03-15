/**
 * 조례 상세 조회 API
 * GET /api/ordin-detail?seq=1234567
 * → 법제처 JSON에서 조문 파싱 → HTML로 변환 반환
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
    // JSON으로 조문 데이터 직접 조회
    const url = `https://www.law.go.kr/DRF/lawService.do?OC=${OC}&target=ordin&ID=${seq}&type=JSON`
    const res = await fetch(url, { next: { revalidate: 86400 } })

    if (!res.ok) {
      return new NextResponse('조례 본문 조회 실패', { status: res.status })
    }

    const data = await res.json()

    // 조례 기본 정보
    const info = data?.자치법규 || data?.조례 || {}
    const basicInfo = info?.기본정보 || {}
    const lawName = basicInfo?.자치법규명 || ''
    const orgName = basicInfo?.지자체기관명 || ''
    const promDate = basicInfo?.공포일자 || ''
    const effDate = basicInfo?.시행일자 || ''
    const revType = basicInfo?.제개정구분명 || ''

    // 조문 데이터
    const articles = info?.조문?.조문단위 || data?.조례?.조문?.조문단위 || []
    const articleList = Array.isArray(articles) ? articles : [articles]

    // HTML 생성
    let html = `<div style="font-family: 'Pretendard', sans-serif; padding: 16px; line-height: 1.8;">`

    // 헤더
    html += `<div style="margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #e5e7eb;">`
    html += `<h2 style="font-size: 18px; font-weight: 700; margin: 0 0 8px 0;">${lawName}</h2>`
    html += `<div style="font-size: 13px; color: #6b7280;">`
    if (orgName) html += `<span>${orgName}</span>`
    if (revType) html += ` · <span>${revType}</span>`
    if (effDate) html += ` · <span>시행 ${effDate.replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3')}</span>`
    html += `</div></div>`

    // 조문
    if (articleList.length === 0) {
      html += `<p style="color: #9ca3af; text-align: center; padding: 40px 0;">조문 데이터가 없습니다.</p>`
    } else {
      for (const article of articleList) {
        const joNum = article?.조문번호 || ''
        const title = article?.조문제목 || ''
        const content = article?.조문내용 || ''
        const hang = article?.항 || []
        const hangList = Array.isArray(hang) ? hang : hang ? [hang] : []

        html += `<div style="margin-bottom: 16px;">`
        html += `<p style="margin: 0; font-weight: 600;">제${joNum}조${title ? `(${title})` : ''}</p>`

        if (content) {
          html += `<p style="margin: 4px 0 0 0; white-space: pre-wrap;">${content}</p>`
        }

        for (const h of hangList) {
          const hangContent = typeof h === 'string' ? h : h?.항내용 || ''
          if (hangContent) {
            html += `<p style="margin: 2px 0 0 16px; white-space: pre-wrap;">${hangContent}</p>`
          }
          const ho = typeof h === 'object' ? (h?.호 || []) : []
          const hoList = Array.isArray(ho) ? ho : ho ? [ho] : []
          for (const hoItem of hoList) {
            const hoContent = typeof hoItem === 'string' ? hoItem : hoItem?.호내용 || ''
            if (hoContent) {
              html += `<p style="margin: 2px 0 0 32px; white-space: pre-wrap;">${hoContent}</p>`
            }
          }
        }

        html += `</div>`
      }
    }

    html += `</div>`

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      },
    })
  } catch (error) {
    return new NextResponse('<p style="text-align:center;color:#9ca3af;padding:40px;">조례 본문 조회 실패</p>', { status: 500 })
  }
}
