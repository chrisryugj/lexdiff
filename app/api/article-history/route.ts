import { NextResponse } from "next/server"
import { debugLogger } from "@/lib/debug-logger"

const LAW_API_BASE = "https://www.law.go.kr/DRF/lawService.do"
const OC = process.env.LAW_OC || ""

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const lawId = searchParams.get("lawId")
  const jo = searchParams.get("jo")

  if (!OC) {
    debugLogger.error("LAW_OC 환경변수가 설정되지 않았습니다")
    return NextResponse.json({ error: "API 키가 설정되지 않았습니다" }, { status: 500 })
  }

  if (!lawId || !jo) {
    return NextResponse.json({ error: "lawId와 jo가 필요합니다" }, { status: 400 })
  }

  try {
    const params = new URLSearchParams({
      target: "lsJoHstInf",
      OC,
      type: "XML",
      ID: lawId,
      JO: jo,
      display: "100", // Get up to 100 revision records
    })

    const url = `${LAW_API_BASE}?${params.toString()}`
    debugLogger.info("조문별 변경이력 API 호출", { lawId, jo })
    console.log("[v0] [조문이력 API] Full URL:", url)

    const response = await fetch(url, {
      next: { revalidate: 3600 },
    })

    const text = await response.text()
    console.log("[v0] [조문이력 API] Response status:", response.status)
    console.log("[v0] [조문이력 API] Response length:", text.length)
    console.log("[v0] [조문이력 API] XML sample (first 2000 chars):", text.substring(0, 2000))

    // Check if it's an error HTML response
    if (text.includes("<!DOCTYPE html") || text.includes("<html")) {
      console.error("[v0] [조문이력 API] Received HTML error page")
      return NextResponse.json({
        error: "법제처 API가 HTML 오류 페이지를 반환했습니다 (조문별 이력 API 미지원 가능성)",
        details: "이 법령은 조문별 개정이력 조회를 지원하지 않을 수 있습니다"
      }, { status: 503 })
    }

    if (!response.ok) {
      throw new Error(`API 응답 오류: ${response.status}`)
    }

    debugLogger.success("조문별 변경이력 조회 완료", { length: text.length })

    return new NextResponse(text, {
      headers: {
        "Content-Type": "application/xml",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    })
  } catch (error) {
    console.log("[v0] [조문이력 API] Error:", error)
    debugLogger.error("조문별 변경이력 조회 실패", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "알 수 없는 오류" }, { status: 500 })
  }
}
