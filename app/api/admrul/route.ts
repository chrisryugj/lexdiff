import { NextRequest, NextResponse } from "next/server"

/**
 * GET /api/admrul
 * 행정규칙 본문 조회 API
 *
 * Query parameters:
 * - ID: 행정규칙 일련번호
 * - LID: 행정규칙 ID
 * - LM: 행정규칙명
 */
export async function GET(request: NextRequest) {
  const LAW_OC = process.env.LAW_OC

  if (!LAW_OC) {
    return NextResponse.json({ error: "LAW_OC not configured" }, { status: 500 })
  }

  try {
    const searchParams = request.nextUrl.searchParams
    const id = searchParams.get("ID") || searchParams.get("id")
    const lid = searchParams.get("LID") || searchParams.get("lid")
    const lm = searchParams.get("LM") || searchParams.get("lm")

    if (!id && !lid && !lm) {
      return NextResponse.json(
        { error: "Missing required parameter: ID, LID, or LM" },
        { status: 400 }
      )
    }

    // Build API URL
    const apiUrl = new URL("http://www.law.go.kr/DRF/lawService.do")
    apiUrl.searchParams.set("OC", LAW_OC)
    apiUrl.searchParams.set("target", "admrul")
    apiUrl.searchParams.set("type", "XML")

    if (id) {
      apiUrl.searchParams.set("ID", id)
    } else if (lid) {
      apiUrl.searchParams.set("LID", lid)
    } else if (lm) {
      apiUrl.searchParams.set("LM", lm)
    }

    console.log("[admrul] Fetching:", apiUrl.toString())

    const response = await fetch(apiUrl.toString(), {
      // No caching for large admin rules (over 2MB causes Next.js cache warnings)
      cache: "no-store",
    })

    if (!response.ok) {
      console.error("[admrul] API error:", response.status)
      return NextResponse.json(
        { error: "Failed to fetch admin rule content" },
        { status: response.status }
      )
    }

    const xmlText = await response.text()

    // Debug: Log response size and preview
    console.log(`[admrul] Response size: ${xmlText.length} bytes (${(xmlText.length / 1024 / 1024).toFixed(2)} MB)`)
    console.log("[admrul] Response preview:", xmlText.substring(0, 1000))

    // Check for HTML error page
    if (xmlText.includes("<!DOCTYPE html")) {
      console.error("[admrul] Received HTML error page")
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
    console.error("[admrul] Error:", error)
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    )
  }
}
