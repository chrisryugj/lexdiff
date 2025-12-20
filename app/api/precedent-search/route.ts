/**
 * 판례 검색 API
 * 법제처 Open API (target=prec) 사용
 */

import { NextRequest, NextResponse } from "next/server"
import { parsePrecedentSearchXML, type PrecedentSearchResult } from "@/lib/precedent-parser"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get("query")
  const court = searchParams.get("court")
  const caseNumber = searchParams.get("caseNumber")
  const display = searchParams.get("display") || "20"
  const page = searchParams.get("page") || "1"
  const sort = searchParams.get("sort")

  if (!query && !caseNumber) {
    return NextResponse.json(
      { error: "query 또는 caseNumber 파라미터가 필요합니다" },
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
      target: "prec",
      type: "XML",
      display,
      page,
    })

    if (query) params.append("query", query)
    if (court) params.append("curt", court)
    if (caseNumber) params.append("nb", caseNumber)
    if (sort) params.append("sort", sort)

    const url = `https://www.law.go.kr/DRF/lawSearch.do?${params.toString()}`
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`API 오류: ${response.status}`)
    }

    const xmlText = await response.text()

    // HTML 에러 페이지 감지
    if (xmlText.includes("<!DOCTYPE html") || xmlText.includes("<html>")) {
      throw new Error("법제처 API가 에러 페이지를 반환했습니다")
    }

    const { totalCount, precedents } = parsePrecedentSearchXML(xmlText)

    return NextResponse.json({
      totalCount,
      precedents,
      page: parseInt(page, 10),
      display: parseInt(display, 10)
    })

  } catch (error) {
    console.error("[precedent-search] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "판례 검색 중 오류 발생" },
      { status: 500 }
    )
  }
}
