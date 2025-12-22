/**
 * 판례 상세 조회 API
 * 법제처 Open API (target=prec, ID 파라미터) 사용
 */

import { NextRequest, NextResponse } from "next/server"
import { parsePrecedentDetailXML } from "@/lib/precedent-parser"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const id = searchParams.get("id")

  if (!id) {
    return NextResponse.json(
      { error: "id 파라미터가 필요합니다" },
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
      ID: id,
      type: "XML"
    })

    const url = `https://www.law.go.kr/DRF/lawService.do?${params.toString()}`
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`API 오류: ${response.status}`)
    }

    const xmlText = await response.text()

    // HTML 에러 페이지 감지
    if (xmlText.includes("<!DOCTYPE html") || xmlText.includes("<html>")) {
      throw new Error("법제처 API가 에러 페이지를 반환했습니다")
    }

    const precedent = parsePrecedentDetailXML(xmlText)

    if (!precedent) {
      return NextResponse.json(
        { error: "판례 정보를 찾을 수 없습니다" },
        { status: 404 }
      )
    }

    return NextResponse.json(precedent)

  } catch (error) {
    console.error("[precedent-detail] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "판례 조회 중 오류 발생" },
      { status: 500 }
    )
  }
}
