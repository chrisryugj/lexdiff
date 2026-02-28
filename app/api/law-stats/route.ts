/**
 * 법령 통계 API
 * 법제처 API에서 카테고리별 총 건수를 조회 (display=1로 최소 데이터)
 * 결과는 Cache-Control로 24시간 캐시
 */

import { NextResponse } from "next/server"

async function fetchTotalCount(
  target: string,
  query: string,
  apiKey: string
): Promise<number> {
  try {
    const params = new URLSearchParams({
      OC: apiKey,
      target,
      type: "XML",
      query,
      display: "1",
    })

    const response = await fetch(
      `https://www.law.go.kr/DRF/lawSearch.do?${params}`,
      { next: { revalidate: 86400 } } // 24시간 ISR 캐시
    )
    if (!response.ok) return 0

    const xml = await response.text()
    if (xml.includes("<!DOCTYPE html")) return 0

    const match = xml.match(/<totalCnt>([^<]*)<\/totalCnt>/)
    return match ? parseInt(match[1], 10) : 0
  } catch {
    return 0
  }
}

async function fetchPrecedentCount(apiKey: string): Promise<number> {
  try {
    const params = new URLSearchParams({
      OC: apiKey,
      target: "prec",
      type: "XML",
      query: "판결",
      display: "1",
    })

    const response = await fetch(
      `https://www.law.go.kr/DRF/lawSearch.do?${params}`,
      { next: { revalidate: 86400 } }
    )
    if (!response.ok) return 0

    const xml = await response.text()
    if (xml.includes("<!DOCTYPE html")) return 0

    const match = xml.match(/<totalCnt>([^<]*)<\/totalCnt>/)
    return match ? parseInt(match[1], 10) : 0
  } catch {
    return 0
  }
}

export async function GET() {
  const apiKey = process.env.LAW_OC
  if (!apiKey) {
    return NextResponse.json(
      { error: "LAW_OC 환경변수가 설정되지 않았습니다" },
      { status: 500 }
    )
  }

  const [laws, adminRules, ordinances, precedents] = await Promise.all([
    fetchTotalCount("law", "법", apiKey),
    fetchTotalCount("admrul", "규", apiKey),
    fetchTotalCount("ordin", "조례", apiKey),
    fetchPrecedentCount(apiKey),
  ])

  return NextResponse.json(
    { laws, adminRules, ordinances, precedents },
    {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
      },
    }
  )
}
