/**
 * 법령해석례 전문 조회 API
 * 법제처 Open API (target=expc, type=JSON) 사용
 */

import { NextRequest, NextResponse } from "next/server"
import { debugLogger } from "@/lib/debug-logger"

export interface InterpretationDetail {
  name: string         // 안건명
  number: string       // 법령해석례번호
  date: string         // 회신일자
  queryAgency: string  // 질의기관명
  replyAgency: string  // 해석기관명
  question: string     // 질의요지
  answer: string       // 회신내용
  reason: string       // 이유/관계법령
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const id = searchParams.get("id")
  const caseName = searchParams.get("caseName")

  if (!id) {
    return NextResponse.json(
      { error: "id 파라미터가 필요합니다 (법령해석례일련번호)" },
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
      type: "JSON",
      ID: id,
    })

    if (caseName) {
      params.append("LM", caseName)
    }

    const url = `https://www.law.go.kr/DRF/lawService.do?${params.toString()}`
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`API 오류: ${response.status}`)
    }

    const responseText = await response.text()

    if (responseText.includes("<!DOCTYPE html") || responseText.includes("<html>")) {
      throw new Error("법제처 API가 에러 페이지를 반환했습니다")
    }

    let data: any
    try {
      data = JSON.parse(responseText)
    } catch {
      throw new Error("JSON 파싱 실패")
    }

    if (!data?.ExpcService) {
      return NextResponse.json(
        { error: "해석례를 찾을 수 없습니다" },
        { status: 404 }
      )
    }

    const expc = data.ExpcService
    const detail: InterpretationDetail = {
      name: expc.안건명 || "",
      number: expc.법령해석례일련번호 || "",
      date: expc.해석일자 || "",
      queryAgency: expc.질의기관명 || "",
      replyAgency: expc.해석기관명 || "",
      question: expc.질의요지 || "",
      answer: expc.회답 || "",
      reason: expc.이유 || ""
    }

    return NextResponse.json(detail)

  } catch (error) {
    debugLogger.error("[interpretation-text] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "해석례 조회 중 오류 발생" },
      { status: 500 }
    )
  }
}
