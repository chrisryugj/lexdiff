import { NextRequest, NextResponse } from "next/server"

/**
 * GET /api/admrul-search
 * 행정규칙 목록 조회 API
 *
 * Query parameters:
 * - query: 검색어 (법령명 등)
 * - search: 검색범위 (1=행정규칙명, 2=본문검색, 기본값: 1)
 * - knd: 행정규칙 종류 (1=훈령, 2=예규, 3=고시, 4=공고, 5=지침, 6=기타)
 * - display: 결과 개수 (기본값: 20, 최대: 100)
 * - page: 페이지 번호 (기본값: 1)
 */
export async function GET(request: NextRequest) {
  const LAW_OC = process.env.LAW_OC

  if (!LAW_OC) {
    return NextResponse.json({ error: "LAW_OC not configured" }, { status: 500 })
  }

  try {
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get("query") || ""
    const search = searchParams.get("search") || "1"
    const knd = searchParams.get("knd") || ""
    const display = searchParams.get("display") || "20"
    const page = searchParams.get("page") || "1"
    const nw = searchParams.get("nw") || "1" // 1=현행, 2=연혁

    // Build API URL
    const apiUrl = new URL("http://www.law.go.kr/DRF/lawSearch.do")
    apiUrl.searchParams.set("OC", LAW_OC)
    apiUrl.searchParams.set("target", "admrul")
    apiUrl.searchParams.set("type", "XML")
    apiUrl.searchParams.set("nw", nw)

    if (query) {
      apiUrl.searchParams.set("query", query)
      apiUrl.searchParams.set("search", search)
    }
    if (knd) {
      apiUrl.searchParams.set("knd", knd)
    }
    apiUrl.searchParams.set("display", display)
    apiUrl.searchParams.set("page", page)

    console.log("[admrul-search] Fetching:", apiUrl.toString())

    const response = await fetch(apiUrl.toString(), {
      next: { revalidate: 3600 }, // Cache for 1 hour
    })

    if (!response.ok) {
      console.error("[admrul-search] API error:", response.status)
      return NextResponse.json(
        { error: "Failed to fetch admin rules" },
        { status: response.status }
      )
    }

    const xmlText = await response.text()

    // Debug: Log first 1000 characters of response
    console.log("[admrul-search] Response preview:", xmlText.substring(0, 1000))

    // Check for HTML error page
    if (xmlText.includes("<!DOCTYPE html")) {
      console.error("[admrul-search] Received HTML error page")
      return NextResponse.json(
        { error: "Invalid response from law.go.kr API" },
        { status: 502 }
      )
    }

    return new NextResponse(xmlText, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    })
  } catch (error: any) {
    console.error("[admrul-search] Error:", error)
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    )
  }
}
