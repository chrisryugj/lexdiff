import { NextRequest, NextResponse } from "next/server"
import { debugLogger } from "@/lib/debug-logger"
import { fetchWithTimeout } from "@/lib/fetch-with-timeout"
import { safeErrorResponse } from "@/lib/api-error"

const LAW_API_KEY = process.env.LAW_OC

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const lawName = searchParams.get("lawName")
  const lawId = searchParams.get("lawId")
  const mst = searchParams.get("mst")

  if (!LAW_API_KEY) {
    return NextResponse.json({ error: "LAW_OC API key not configured" }, { status: 500 })
  }

  try {
    let finalMst = mst
    let finalLawId = lawId

    // lawName만 주어진 경우, 먼저 검색으로 MST 찾기
    if (lawName && !finalMst && !finalLawId) {
      const searchParams = new URLSearchParams({
        OC: LAW_API_KEY,
        target: "law",
        type: "XML",
        query: lawName,
        display: "1",
      })

      const searchUrl = `https://www.law.go.kr/DRF/lawSearch.do?${searchParams.toString()}`
      debugLogger.debug("[hierarchy API] Searching for law:", searchUrl)

      const searchResponse = await fetchWithTimeout(searchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; LexDiff/1.0)",
        },
      })

      if (searchResponse.ok) {
        const searchXml = await searchResponse.text()

        // XML에서 MST 추출 (정규식 사용)
        const mstMatch = searchXml.match(/<법령일련번호>(\d+)<\/법령일련번호>/)

        if (mstMatch && mstMatch[1]) {
          finalMst = mstMatch[1].trim()
          debugLogger.debug("[hierarchy API] Found MST:", finalMst)
        } else {
          debugLogger.error("[hierarchy API] MST not found in search results")
          return NextResponse.json({ error: "Law not found" }, { status: 404 })
        }
      } else {
        debugLogger.error("[hierarchy API] Search failed:", searchResponse.status)
        return NextResponse.json({ error: "Failed to search for law" }, { status: 502 })
      }
    }

    // MST나 lawId로 체계도 본문 조회
    if (!finalMst && !finalLawId) {
      return NextResponse.json({ error: "Missing required parameter" }, { status: 400 })
    }

    const params = new URLSearchParams({
      OC: LAW_API_KEY,
      target: "lsStmd",
      type: "XML",
    })

    if (finalLawId) {
      params.append("ID", finalLawId)
    } else if (finalMst) {
      params.append("MST", finalMst)
    }

    const url = `https://www.law.go.kr/DRF/lawService.do?${params.toString()}`
    debugLogger.debug("[hierarchy API] Fetching hierarchy:", url)

    const response = await fetchWithTimeout(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LexDiff/1.0)",
      },
    })

    if (!response.ok) {
      debugLogger.error("[hierarchy API] Failed:", { status: response.status })
      return NextResponse.json({ error: "Failed to fetch hierarchy" }, { status: 502 })
    }

    const xmlText = await response.text()
    debugLogger.debug("[hierarchy API] Success, length:", xmlText.length)

    return new Response(xmlText, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
      },
    })
  } catch (error) {
    return safeErrorResponse(error, "법령 체계도 조회에 실패했습니다")
  }
}
