import { NextResponse } from "next/server"
import { debugLogger } from "@/lib/debug-logger"

const LAW_API_BASE = "https://www.law.go.kr/DRF/lawSearch.do"
const OC = process.env.LAW_OC || ""

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get("query")
  const knd = searchParams.get("knd") // 법령종류: 30001-조례, 30002-규칙 등
  const org = searchParams.get("org") // 지자체코드

  if (!OC) {
    debugLogger.error("LAW_OC 환경변수가 설정되지 않았습니다")
    return NextResponse.json({ error: "API 키가 설정되지 않았습니다" }, { status: 500 })
  }

  if (!query) {
    return NextResponse.json({ error: "검색어가 필요합니다" }, { status: 400 })
  }

  try {
    const params = new URLSearchParams({
      OC,
      type: "XML",
      target: "ordin",
      query: query,
      display: "100",
    })

    // 법령종류 필터 추가
    if (knd) {
      params.append("knd", knd)
    }

    // 지자체 필터 추가
    if (org) {
      params.append("org", org)
    }

    const url = `${LAW_API_BASE}?${params.toString()}`
    debugLogger.info("자치법규 검색 API 호출", { query, knd, org, url })
    console.log("Ordinance search URL:", url)

    const response = await fetch(url, {
      next: { revalidate: 3600 },
    })

    const text = await response.text()
    console.log("Ordinance search response status:", response.status)

    if (!response.ok) {
      debugLogger.error("자치법규 검색 API 오류", { status: response.status, body: text.substring(0, 200) })
      throw new Error(`API 응답 오류: ${response.status}`)
    }

    debugLogger.success("자치법규 검색 완료", { length: text.length })

    return new NextResponse(text, {
      headers: {
        "Content-Type": "application/xml",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    })
  } catch (error) {
    console.log("Ordinance search error:", error)
    debugLogger.error("자치법규 검색 실패", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "알 수 없는 오류" }, { status: 500 })
  }
}
