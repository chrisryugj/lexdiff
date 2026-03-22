import { NextResponse } from "next/server"
import { debugLogger } from "@/lib/debug-logger"

const LAW_API_BASE = "https://www.law.go.kr/DRF/lawService.do"
const OC = process.env.LAW_OC || ""

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const ordinId = searchParams.get("ordinId")
  const ordinSeq = searchParams.get("ordinSeq")

  if (!OC) {
    debugLogger.error("LAW_OC 환경변수가 설정되지 않았습니다")
    return NextResponse.json({ error: "API 키가 설정되지 않았습니다" }, { status: 500 })
  }

  if (!ordinId && !ordinSeq) {
    return NextResponse.json({ error: "ordinId 또는 ordinSeq가 필요합니다" }, { status: 400 })
  }

  try {
    const params = new URLSearchParams({
      target: "ordin",
      OC,
      type: "XML",
    })

    if (ordinId) {
      params.append("ID", ordinId)
    } else if (ordinSeq) {
      params.append("MST", ordinSeq)
    }

    const url = `${LAW_API_BASE}?${params.toString()}`
    debugLogger.info("자치법규 본문 API 호출", { ordinId, ordinSeq })
    debugLogger.debug("Ordinance API URL:", url)

    const response = await fetch(url, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(10_000),
    })

    const text = await response.text()
    debugLogger.debug("Ordinance response status:", response.status)

    if (!response.ok) {
      debugLogger.error("자치법규 본문 API 오류", { status: response.status, body: text.substring(0, 500) })
      throw new Error(`자치법규 API 응답 오류 (${response.status})`)
    }

    if (text.includes("<!DOCTYPE html") || text.includes("<html")) {
      debugLogger.error("자치법규 본문 API가 HTML 오류 페이지를 반환했습니다")
      throw new Error("API가 오류 페이지를 반환했습니다. 자치법규 ID를 확인해주세요.")
    }

    debugLogger.success("자치법규 본문 조회 완료", { length: text.length })

    return new NextResponse(text, {
      headers: {
        "Content-Type": "application/xml",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    })
  } catch (error) {
    debugLogger.error("자치법규 본문 조회 실패", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "알 수 없는 오류" }, { status: 500 })
  }
}
