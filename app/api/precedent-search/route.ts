/**
 * 판례 검색 API
 * 법제처 Open API (target=prec) 사용
 */

import { NextRequest, NextResponse } from "next/server"
import { debugLogger } from "@/lib/debug-logger"
import { safeErrorResponse } from "@/lib/api-error"
import { parsePrecedentSearchXML } from "@/lib/precedent-parser"
import { extractRelationsFromPrecedents } from "@/lib/relation-graph/extractors/precedent-extractor"
import { fetchWithTimeout } from "@/lib/fetch-with-timeout"
import { storeRelationsAsync } from "@/lib/relation-graph/relation-db"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const rawQuery = searchParams.get("query")
  // 카테고리/조사 제거 — "관세 관련 판례" → "관세"
  const query = rawQuery
    ? (rawQuery.replace(/\s*(판례|판결|에\s*관한|에\s*대한|에\s*대해|관련된|관련|관한|대한)\s*/g, ' ').replace(/\s+/g, ' ').trim() || rawQuery.trim())
    : null
  const court = searchParams.get("court")
  const caseNumber = searchParams.get("caseNumber")
  const display = String(Math.min(Math.max(parseInt(searchParams.get("display") || "20") || 20, 1), 100))
  const page = String(Math.min(Math.max(parseInt(searchParams.get("page") || "1") || 1, 1), 1000))
  const sort = searchParams.get("sort")
  // 관계 그래프 적재용 (옵셔널)
  const lawId = searchParams.get("lawId")
  const lawTitle = searchParams.get("lawTitle")
  const article = searchParams.get("article")

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

    // ✅ 법원명+연도 조합: curt 파라미터 사용 (query보다 훨씬 많은 결과)
    if (extractedCourt) {
      // 법원명은 curt 파라미터로, 나머지 키워드는 query로
      params.append("curt", extractedCourt)
      // 법원명과 연도를 제외한 나머지 키워드가 있으면 query에 추가
      const remainingQuery = query!
        .replace(new RegExp(extractedCourt, 'g'), '')
        .replace(/\b(19\d{2}|20\d{2})\b/g, '')
        .trim()
      if (remainingQuery) {
        params.append("query", remainingQuery)
      }
    } else if (query) {
      params.append("query", query)
    }
    if (court) params.append("curt", court)
    if (caseNumber) params.append("nb", caseNumber)
    if (sort) params.append("sort", sort)

    // ✅ 연도 필터 - 서버 사이드 (API 파라미터로 전달)
    // 법제처 API는 연도 파라미터를 직접 지원하지 않으므로,
    // 검색어에 사건번호 형식 "(연도)"을 추가하여 간접 필터링
    if (extractedYear && !params.has("nb")) {
      // 사건번호 없는 경우에만 연도 기반 필터링 활성화
      // 예: "대법원 2025" → curt=대법원 + 사건번호에 2025 포함
      // params.append("nb", extractedYear) // 이건 정확한 사건번호 매칭이라 안 됨
      // 대신 연도를 query로 추가하여 사건명/사건번호 내 검색되도록 유도
      const currentQuery = params.get("query") || ""
      if (!currentQuery.includes(extractedYear)) {
        params.set("query", currentQuery ? `${currentQuery} ${extractedYear}` : extractedYear)
      }
    }

    const url = `https://www.law.go.kr/DRF/lawSearch.do?${params.toString()}`
    const response = await fetchWithTimeout(url)

    if (!response.ok) {
      throw new Error(`API 오류: ${response.status}`)
    }

    const xmlText = await response.text()

    // HTML 에러 페이지 감지
    if (xmlText.includes("<!DOCTYPE html") || xmlText.includes("<html>")) {
      throw new Error("법제처 API가 에러 페이지를 반환했습니다")
    }

    const { totalCount, precedents } = parsePrecedentSearchXML(xmlText)

    debugLogger.debug(`[precedent-search] API 응답: totalCount=${totalCount}, precedents.length=${precedents.length}, display=${display}, extractedYear=${extractedYear}, extractedCourt=${extractedCourt}`)

    // ✅ 연도 필터링 제거 - 서버 사이드로 이동 (API query에 연도 포함)
    // 이제 API가 직접 연도로 필터링하므로 클라이언트 필터링 불필요

    // 관계 그래프 적재 (fire-and-forget)
    if (lawId && lawTitle && article && precedents.length > 0) {
      const relations = extractRelationsFromPrecedents(lawId, lawTitle, article, precedents)
      storeRelationsAsync(relations)
    }

    return NextResponse.json({
      totalCount,
      precedents,
      page: parseInt(page, 10),
      display: parseInt(display, 10),
      yearFilter: extractedYear || undefined,
      courtFilter: extractedCourt || undefined
    })

  } catch (error) {
    return safeErrorResponse(error, "판례 검색 중 오류 발생")
  }
}
