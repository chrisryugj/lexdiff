/**
 * 조세심판원 재결례 검색 API
 * 법제처 Open API (target=ttSpecialDecc) 사용
 */

import { NextRequest, NextResponse } from "next/server"

export interface TaxTribunalSearchResult {
  id: string           // 특별행정심판재결례일련번호
  name: string         // 사건명
  claimNumber: string  // 청구번호
  decisionDate: string // 의결일자
  dispositionDate: string // 처분일자
  tribunal: string     // 재결청
  decisionType: string // 재결구분명
  link: string         // 상세링크
}

function parseXML(xml: string): {
  totalCount: number
  decisions: TaxTribunalSearchResult[]
} {
  const decisions: TaxTribunalSearchResult[] = []

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

    decisions.push({
      id: extract("특별행정심판재결례일련번호"),
      name: extract("사건명"),
      claimNumber: extract("청구번호"),
      decisionDate: extract("의결일자"),
      dispositionDate: extract("처분일자"),
      tribunal: extract("재결청"),
      decisionType: extract("재결구분명"),
      link: extract("행정심판재결례상세링크")
    })
  }

  return { totalCount, decisions }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get("query")
  const display = searchParams.get("display") || "20"
  const page = searchParams.get("page") || "1"
  const cls = searchParams.get("cls")
  const dpaYd = searchParams.get("dpaYd")
  const rslYd = searchParams.get("rslYd")
  const sort = searchParams.get("sort")

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
      display,
      page,
    })

    if (query) params.append("query", query)
    if (cls) params.append("cls", cls)
    if (dpaYd) params.append("dpaYd", dpaYd)
    if (rslYd) params.append("rslYd", rslYd)
    if (sort) params.append("sort", sort)

    const url = `https://www.law.go.kr/DRF/lawSearch.do?${params.toString()}`
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`API 오류: ${response.status}`)
    }

    const xmlText = await response.text()

    if (xmlText.includes("<!DOCTYPE html") || xmlText.includes("<html>")) {
      throw new Error("법제처 API가 에러 페이지를 반환했습니다")
    }

    const { totalCount, decisions } = parseXML(xmlText)

    return NextResponse.json({
      totalCount,
      decisions,
      page: parseInt(page, 10),
      display: parseInt(display, 10)
    })

  } catch (error) {
    console.error("[tax-tribunal-search] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "조세심판원 검색 중 오류 발생" },
      { status: 500 }
    )
  }
}
