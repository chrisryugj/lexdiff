/**
 * 법령해석례 검색 API
 * 법제처 Open API (target=expc) 사용
 */

import { NextRequest, NextResponse } from "next/server"
import { debugLogger } from "@/lib/debug-logger"
import { safeErrorResponse } from "@/lib/api-error"
import { fetchWithTimeout } from "@/lib/fetch-with-timeout"

export interface InterpretationSearchResult {
  id: string           // 법령해석례일련번호
  name: string         // 안건명
  number: string       // 안건번호
  date: string         // 회신일자
  agency: string       // 해석기관명
  link: string         // 상세링크
}

function parseInterpretationSearchXML(xml: string): {
  totalCount: number
  interpretations: InterpretationSearchResult[]
} {
  const interpretations: InterpretationSearchResult[] = []

  const totalCntMatch = xml.match(/<totalCnt>([^<]*)<\/totalCnt>/)
  const totalCount = totalCntMatch ? parseInt(totalCntMatch[1], 10) : 0

  const expcMatches = xml.matchAll(/<expc[^>]*>([\s\S]*?)<\/expc>/g)

  for (const match of expcMatches) {
    const expcContent = match[1]

    const extractTag = (tag: string): string => {
      const cdataRegex = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`)
      const cdataMatch = expcContent.match(cdataRegex)
      if (cdataMatch) return cdataMatch[1].trim()

      const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`)
      const tagMatch = expcContent.match(regex)
      return tagMatch ? tagMatch[1].trim() : ""
    }

    const id = extractTag("법령해석례일련번호")
    interpretations.push({
      id,
      name: extractTag("안건명"),
      number: extractTag("안건번호"),
      date: extractTag("회신일자"),
      agency: extractTag("회신기관명"),
      // 법제처 Open API의 원본 링크는 /DRF/lawService.do?OC=...&target=expc 형식(API 키 노출 + raw HTML)이므로
      // 사람이 보는 공개 상세 페이지(expcInfoP.do)로 재구성
      link: id ? `https://www.law.go.kr/expcInfoP.do?expcSeq=${id}` : extractTag("법령해석례상세링크")
    })
  }

  return { totalCount, interpretations }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const rawQuery = searchParams.get("query")
  // 카테고리 키워드 제거 — "공무원 법령해석례" → "공무원"
  // (법제처 API가 "법령해석례" 문자열 자체를 검색해 0건 반환하는 문제)
  const query = rawQuery
    ? (rawQuery.replace(/\s*(법령\s*해석례|법령\s*해석|해석례|에\s*관한|에\s*대한|에\s*대해|관련된|관련|관한|대한)\s*/g, ' ').replace(/\s+/g, ' ').trim() || rawQuery.trim())
    : null
  const display = String(Math.min(Math.max(parseInt(searchParams.get("display") || "20") || 20, 1), 100))
  const page = String(Math.min(Math.max(parseInt(searchParams.get("page") || "1") || 1, 1), 1000))
  const sort = searchParams.get("sort")

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
      target: "expc",
      type: "XML",
      query,
      display,
      page,
    })

    if (sort) params.append("sort", sort)

    const url = `https://www.law.go.kr/DRF/lawSearch.do?${params.toString()}`
    const response = await fetchWithTimeout(url)

    if (!response.ok) {
      throw new Error(`API 오류: ${response.status}`)
    }

    const xmlText = await response.text()

    if (xmlText.includes("<!DOCTYPE html") || xmlText.includes("<html>")) {
      throw new Error("법제처 API가 에러 페이지를 반환했습니다")
    }

    const { totalCount, interpretations } = parseInterpretationSearchXML(xmlText)

    return NextResponse.json({
      totalCount,
      interpretations,
      page: parseInt(page, 10),
      display: parseInt(display, 10)
    })

  } catch (error) {
    return safeErrorResponse(error, "해석례 검색 중 오류 발생")
  }
}
