/**
 * 관세청 법령해석 전문 조회 API
 * 법제처 Open API (target=kcsCgmExpc, type=JSON) 사용
 */

import { NextRequest, NextResponse } from "next/server"

export interface CustomsDetail {
  name: string         // 안건명
  id: string           // 법령해석일련번호
  date: string         // 해석일자
  queryAgency: string  // 질의기관명
  replyAgency: string  // 해석기관명
  question: string     // 질의요지
  answer: string       // 회답
  reason: string       // 이유
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const id = searchParams.get("id")

  if (!id) {
    return NextResponse.json(
      { error: "id 파라미터가 필요합니다 (법령해석일련번호)" },
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
      target: "kcsCgmExpc",
      type: "JSON",
      ID: id,
    })

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

    const service = data?.KcsCgmExpcService || data?.kcsCgmExpcService
    if (!service) {
      return NextResponse.json(
        { error: "관세청 해석을 찾을 수 없습니다" },
        { status: 404 }
      )
    }

    const detail: CustomsDetail = {
      name: service.안건명 || "",
      id: service.법령해석일련번호 || "",
      date: service.해석일자 || "",
      queryAgency: service.질의기관명 || "",
      replyAgency: service.해석기관명 || "",
      question: service.질의요지 || "",
      answer: service.회답 || "",
      reason: service.이유 || ""
    }

    return NextResponse.json(detail)

  } catch (error) {
    console.error("[customs-text] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "관세청 해석 조회 중 오류 발생" },
      { status: 500 }
    )
  }
}
