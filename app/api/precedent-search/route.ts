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

    // ✅ 법원명 + 연도 조합 처리 (예: "대법원 2025")
    let extractedYear: string | null = null
    let extractedCourt: string | null = court

    if (query && !caseNumber) {
      // 법원명 추출
      const courtMatch = query.match(/(대법원|서울고등법원|서울고법|부산고등법원|부산고법|대구고등법원|대구고법|광주고등법원|광주고법|서울중앙지법|서울동부지법|서울남부지법|서울북부지법|서울서부지법|인천지법|수원지법|부산지법|대구지법|광주지법|대전지법|울산지법|창원지법)/)
      if (courtMatch && !extractedCourt) {
        extractedCourt = courtMatch[0]
      }

      // 연도 추출 (4자리 숫자)
      const yearMatch = query.match(/\b(19\d{2}|20\d{2})\b/)
      if (yearMatch) {
        extractedYear = yearMatch[0]
      }
    }

    // ✅ 법원명으로만 검색 (query 파라미터 사용 안 함)
    if (extractedCourt) {
      params.append("curt", extractedCourt)
    } else if (query && !extractedCourt && !caseNumber) {
      // 법원명 없으면 query로 검색
      params.append("query", query)
    }

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

    // ✅ 연도 필터링 (클라이언트 사이드)
    let filteredPrecedents = precedents
    let filteredCount = totalCount

    if (extractedYear) {
      filteredPrecedents = precedents.filter(prec => {
        // 사건번호나 선고일자에서 연도 추출
        const yearInCaseNumber = prec.caseNumber?.match(/^(\d{4})/)
        const yearInDate = prec.decisionDate?.substring(0, 4)

        return yearInCaseNumber?.[1] === extractedYear || yearInDate === extractedYear
      })
      filteredCount = filteredPrecedents.length
    }

    return NextResponse.json({
      totalCount: filteredCount,
      precedents: filteredPrecedents,
      page: parseInt(page, 10),
      display: parseInt(display, 10),
      yearFilter: extractedYear || undefined,
      courtFilter: extractedCourt || undefined
    })

  } catch (error) {
    console.error("[precedent-search] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "판례 검색 중 오류 발생" },
      { status: 500 }
    )
  }
}
