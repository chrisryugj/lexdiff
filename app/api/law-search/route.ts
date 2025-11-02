import { NextResponse } from "next/server"
import { debugLogger } from "@/lib/debug-logger"
import { normalizeLawSearchText, resolveLawAlias } from "@/lib/search-normalizer"

const LAW_API_BASE = "https://www.law.go.kr/DRF/lawSearch.do"
const OC = process.env.LAW_OC || ""

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const rawQuery = searchParams.get("query")

  if (!rawQuery) {
    return NextResponse.json({ error: "검색어가 필요합니다" }, { status: 400 })
  }

  const normalizedQuery = normalizeLawSearchText(rawQuery)
  const aliasResolution = resolveLawAlias(normalizedQuery)
  const query = aliasResolution.canonical

  if (!OC) {
    debugLogger.error("LAW_OC 환경변수가 설정되지 않았습니다")
    return NextResponse.json({ error: "API 키가 설정되지 않았습니다" }, { status: 500 })
  }

  try {
    const params = new URLSearchParams({
      OC,
      type: "XML",
      target: "law",
      query,
    })

    const url = `${LAW_API_BASE}?${params.toString()}`
    debugLogger.info("법령 검색 API 호출", {
      query,
      rawQuery,
      normalizedQuery,
      aliasMatched: aliasResolution.matchedAlias,
      url,
    })
    console.log("[v0] Law search URL:", url)

    const response = await fetch(url, {
      next: { revalidate: 3600 },
    })

    const text = await response.text()
    console.log("[v0] Law search response status:", response.status)
    console.log("[v0] Law search response (first 500 chars):", text.substring(0, 500))

    if (!response.ok) {
      debugLogger.error("법령 검색 API 오류", { status: response.status, body: text.substring(0, 200) })
      throw new Error(`API 응답 오류: ${response.status}`)
    }

    debugLogger.success("법령 검색 완료", { length: text.length })

    return new NextResponse(text, {
      headers: {
        "Content-Type": "application/xml",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    })
  } catch (error) {
    console.log("[v0] Law search error:", error)
    debugLogger.error("법령 검색 실패", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "알 수 없는 오류" }, { status: 500 })
  }
}
