/**
 * 관세청 법령해석 검색 API
 * 법제처 Open API (target=kcsCgmExpc) 사용
 */

import { NextRequest, NextResponse } from "next/server"
import { debugLogger } from "@/lib/debug-logger"
import { safeErrorResponse } from "@/lib/api-error"
import { fetchWithTimeout } from "@/lib/fetch-with-timeout"

export interface CustomsSearchResult {
  id: string           // 법령해석일련번호
  name: string         // 안건명
  queryAgency: string  // 질의기관명
  replyAgency: string  // 해석기관명
  date: string         // 해석일자
  link: string         // 상세링크
}

function parseXML(xml: string): {
  totalCount: number
  interpretations: CustomsSearchResult[]
} {
  const interpretations: CustomsSearchResult[] = []

  const totalCntMatch = xml.match(/<totalCnt>([^<]*)<\/totalCnt>/)
  const totalCount = totalCntMatch ? parseInt(totalCntMatch[1], 10) : 0

  // 태그가 <cgmExpc>임 (관세청 전용)
  const expcMatches = xml.matchAll(/<cgmExpc[^>]*>([\s\S]*?)<\/cgmExpc>/g)

  for (const match of expcMatches) {
    const content = match[1]

    const extract = (tag: string): string => {
      const cdataRegex = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`)
      const cdataMatch = content.match(cdataRegex)
      if (cdataMatch) return cdataMatch[1].trim()

      const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`)
      const tagMatch = content.match(regex)
      return tagMatch ? tagMatch[1].trim() : ""
    }

    interpretations.push({
      id: extract("법령해석일련번호"),
      name: extract("안건명"),
      queryAgency: extract("질의기관명"),
      replyAgency: extract("해석기관명"),
      date: extract("해석일자"),
      link: extract("법령해석상세링크")
    })
  }

  return { totalCount, interpretations }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get("query")
  const display = String(Math.min(Math.max(parseInt(searchParams.get("display") || "20", 10) || 20, 1), 100))
  const page = String(Math.max(parseInt(searchParams.get("page") || "1", 10) || 1, 1))
  const explYd = searchParams.get("explYd")
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
      target: "kcsCgmExpc",
      type: "XML",
      display,
      page,
    })

    if (query) params.append("query", query)
    if (explYd) params.append("explYd", explYd)
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

    const { totalCount, interpretations } = parseXML(xmlText)

    return NextResponse.json({
      totalCount,
      interpretations,
      page: parseInt(page, 10),
      display: parseInt(display, 10)
    })

  } catch (error) {
    return safeErrorResponse(error, "관세 해석 검색 중 오류 발생")
  }
}
