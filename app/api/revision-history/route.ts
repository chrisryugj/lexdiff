import { NextResponse } from "next/server"
import { debugLogger } from "@/lib/debug-logger"
import { safeErrorResponse } from "@/lib/api-error"

const LAW_API_BASE = "https://www.law.go.kr/DRF/lawService.do"
const OC = process.env.LAW_OC || ""

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const lawId = searchParams.get("lawId")
  const mst = searchParams.get("mst")

  if (!OC) {
    debugLogger.error("LAW_OC 환경변수가 설정되지 않았습니다")
    return NextResponse.json({ error: "API 키가 설정되지 않았습니다" }, { status: 500 })
  }

  if (!lawId && !mst) {
    return NextResponse.json({ error: "lawId 또는 mst가 필요합니다" }, { status: 400 })
  }

  try {
    const params = new URLSearchParams({
      target: "law",
      OC,
      type: "XML",
    })

    if (lawId) {
      params.append("ID", lawId)
    } else if (mst) {
      params.append("MST", mst)
    }

    const url = `${LAW_API_BASE}?${params.toString()}`
    debugLogger.info("법령 변경이력 API 호출", { lawId, mst })
    debugLogger.debug("[개정이력 API] Full URL:", url)

    const response = await fetch(url, {
      next: { revalidate: 3600 },
    })

    if (!response.ok) {
      throw new Error(`API 응답 오류: ${response.status}`)
    }

    const text = await response.text()
    debugLogger.debug("[개정이력 API] Response length:", text.length)

    debugLogger.success("법령 변경이력 조회 완료", { length: text.length })

    return new NextResponse(text, {
      headers: {
        "Content-Type": "application/xml",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    })
  } catch (error) {
    return safeErrorResponse(error, "개정이력 조회 실패")
  }
}
