/**
 * 조세심판원 재결례 전문 조회 API
 * 법제처 Open API (target=ttSpecialDecc, type=JSON) 사용
 */

import { NextRequest, NextResponse } from "next/server"
import { debugLogger } from "@/lib/debug-logger"

export interface TaxTribunalDetail {
  name: string           // 사건명
  claimNumber: string    // 청구번호
  decisionDate: string   // 의결일자
  dispositionDate: string // 처분일자
  tribunal: string       // 재결청
  decisionType: string   // 재결구분명
  claimPurpose: string   // 청구취지
  disposition: string    // 처분내용
  decisionContent: string // 재결내용
  reason: string         // 이유
  fullText: string       // 전문
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const id = searchParams.get("id")

  if (!id) {
    return NextResponse.json(
      { error: "id 파라미터가 필요합니다 (특별행정심판재결례일련번호)" },
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
      target: "ttSpecialDecc",
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

    // 응답 구조 확인 (TtSpecialDeccService 또는 다른 키)
    const service = data?.TtSpecialDeccService || data?.ttSpecialDeccService
    if (!service) {
      return NextResponse.json(
        { error: "재결례를 찾을 수 없습니다" },
        { status: 404 }
      )
    }

    const detail: TaxTribunalDetail = {
      name: service.사건명 || "",
      claimNumber: service.청구번호 || "",
      decisionDate: service.의결일자 || "",
      dispositionDate: service.처분일자 || "",
      tribunal: service.재결청 || "",
      decisionType: service.재결구분명 || "",
      claimPurpose: service.청구취지 || "",
      disposition: service.처분내용 || "",
      decisionContent: service.재결내용 || "",
      reason: service.이유 || "",
      fullText: service.전문 || service.재결내용 || ""
    }

    return NextResponse.json(detail)

  } catch (error) {
    debugLogger.error("[tax-tribunal-text] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "재결례 조회 중 오류 발생" },
      { status: 500 }
    )
  }
}
