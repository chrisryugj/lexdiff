/**
 * 판례 전문 조회 API
 * 법제처 Open API (target=prec, type=JSON) 사용
 */

import { NextRequest, NextResponse } from "next/server"
import { debugLogger } from "@/lib/debug-logger"
import { safeErrorResponse } from "@/lib/api-error"
import { parsePrecedentDetailJSON, type PrecedentDetail } from "@/lib/precedent-parser"
import { fetchWithTimeout } from "@/lib/fetch-with-timeout"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const id = searchParams.get("id")
  const caseName = searchParams.get("caseName")

  if (!id) {
    return NextResponse.json(
      { error: "id 파라미터가 필요합니다 (판례일련번호)" },
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
      type: "JSON",
      ID: id,
    })

    if (caseName) {
      params.append("LM", caseName)
    }

    const url = `https://www.law.go.kr/DRF/lawService.do?${params.toString()}`
    const response = await fetchWithTimeout(url)

    if (!response.ok) {
      throw new Error(`API 오류: ${response.status}`)
    }

    const responseText = await response.text()

    // HTML 에러 페이지 감지
    if (responseText.includes("<!DOCTYPE html") || responseText.includes("<html>")) {
      throw new Error("법제처 API가 에러 페이지를 반환했습니다")
    }

    let data: any
    try {
      data = JSON.parse(responseText)
    } catch {
      throw new Error("JSON 파싱 실패")
    }

    const detail = parsePrecedentDetailJSON(data)
    if (!detail) {
      return NextResponse.json(
        { error: "판례를 찾을 수 없습니다" },
        { status: 404 }
      )
    }

    // API-7: 명시적 캐시 헤더 (판례 본문은 거의 불변)
    return NextResponse.json(detail, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    })

  } catch (error) {
    return safeErrorResponse(error, "판례 조회 중 오류 발생")
  }
}
