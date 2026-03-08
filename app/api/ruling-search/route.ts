/**
 * 재결례 검색 API
 * 법제처 Open API (target=ttSpecialDecc) 사용
 *
 * useUnifiedSearch의 handleRulingSearch에서 호출.
 * 내부적으로 조세심판원 재결례 API를 사용.
 */

import { NextRequest, NextResponse } from "next/server"

interface RulingSearchResult {
  id: string
  name: string
  claimNumber: string
  decisionDate: string
  tribunal: string
  decisionType: string
  link: string
}

function parseRulingXML(xml: string): {
  totalCount: number
  rulings: RulingSearchResult[]
} {
  const rulings: RulingSearchResult[] = []

  const totalCntMatch = xml.match(/<totalCnt>([^<]*)<\/totalCnt>/)
  const totalCount = totalCntMatch ? parseInt(totalCntMatch[1], 10) : 0

  const deccMatches = xml.matchAll(/<decc[^>]*>([\s\S]*?)<\/decc>/g)

  for (const match of deccMatches) {
    const content = match[1]

    const extract = (tag: string): string => {
      const cdataRegex = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`)
      const cdataMatch = content.match(cdataRegex)
      if (cdataMatch) return cdataMatch[1].trim()

      const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`)
      const tagMatch = content.match(regex)
      return tagMatch ? tagMatch[1].trim() : ""
    }

    rulings.push({
      id: extract("특별행정심판재결례일련번호"),
      name: extract("사건명"),
      claimNumber: extract("청구번호"),
      decisionDate: extract("의결일자"),
      tribunal: extract("재결청"),
      decisionType: extract("재결구분명"),
      link: extract("행정심판재결례상세링크"),
    })
  }

  return { totalCount, rulings }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get("query")
  const display = searchParams.get("display") || "20"
  const page = searchParams.get("page") || "1"

  if (!query) {
    return NextResponse.json(
      { error: "query 파라미터가 필요합니다" },
      { status: 400 }
    )
  }

  const apiKey = process.env.LAW_OC
  if (!apiKey) {
    return NextResponse.json(
      { error: "LAW_OC 환경변수가 설정되지 않았습니다" },
      { status: 500 }
    )
  }

  try {
    const params = new URLSearchParams({
      OC: apiKey,
      target: "ttSpecialDecc",
      type: "XML",
      query,
      display,
      page,
    })

    const url = `https://www.law.go.kr/DRF/lawSearch.do?${params.toString()}`
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`API 오류: ${response.status}`)
    }

    const xmlText = await response.text()

    if (xmlText.includes("<!DOCTYPE html") || xmlText.includes("<html>")) {
      throw new Error("법제처 API가 에러 페이지를 반환했습니다")
    }

    const { totalCount, rulings } = parseRulingXML(xmlText)

    return NextResponse.json({
      totalCount,
      rulings,
      page: parseInt(page, 10),
      display: parseInt(display, 10),
    })
  } catch (error) {
    console.error("[ruling-search] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "재결례 검색 중 오류 발생" },
      { status: 500 }
    )
  }
}
